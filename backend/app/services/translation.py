"""Interface translation for the Indian-language modes (Hindi, Kannada, Telugu, Tamil).

The frontend collects the English text visible on a page and asks for the strings it hasn't seen yet.
Each string is translated once by the Groq LLM and stored in MongoDB (`i18n_cache`, keyed by language and
text), so every later visitor gets it from the cache. Numbers, units, crop/country names and product names
are kept as they are.
"""
import hashlib
import json
import urllib.request
from datetime import datetime, timezone

from backend.app.core.observability import log
from backend.app.db import mongo
from backend.app.services.llm_service import USER_AGENT, llm_service

LANGUAGES = {"hi": "Hindi", "kn": "Kannada", "te": "Telugu", "ta": "Tamil"}
MAX_ITEMS = 80
MAX_CHARS = 400
BATCH = 40


class TranslationUnavailable(Exception):
    pass


def _key(lang: str, text: str) -> str:
    return f"{lang}:{hashlib.sha1(text.encode('utf-8')).hexdigest()}"


def _groq(lang: str, texts: list[str]) -> dict[str, str]:
    key = llm_service.groq_api_key
    if not key:
        raise TranslationUnavailable("Translation needs a Groq API key (GROQ_API_KEY) on the server.")
    numbered = {str(i): t for i, t in enumerate(texts)}
    prompt = (
        f"Translate each value of this JSON object from English into {LANGUAGES[lang]} for the interface of an "
        "agriculture web app used by farmers. Use simple, natural words a farmer would understand. Keep numbers, "
        "units (kg/ha, mm, °C, %, ha, NDVI, P10–P90, R², RMSE, MAE), currency, dates, brand and product names "
        "(YieldSense, XGBoost, Groq, NASA, MODIS, FAOSTAT, SoilGrids, Open-Meteo, MET Norway), email addresses, "
        "keyboard keys and punctuation unchanged. Return a JSON object with exactly the same keys and only the "
        "translated strings as values.\n\n" + json.dumps(numbered, ensure_ascii=False)
    )
    body = {
        "model": llm_service.groq_model,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
    }
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}", "User-Agent": USER_AGENT},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=45) as r:
        content = json.loads(r.read().decode("utf-8"))["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    out: dict[str, str] = {}
    for i, text in numbered.items():
        value = parsed.get(i)
        if isinstance(value, str) and value.strip():
            out[text] = value.strip()
    return out


def translate(lang: str, texts: list[str]) -> dict[str, str]:
    """English → `lang` for each text: from the cache, otherwise from the LLM (then cached)."""
    if lang not in LANGUAGES:
        raise ValueError(f"Unsupported language '{lang}'.")
    unique = list(dict.fromkeys(t.strip() for t in texts if t and t.strip()))[:MAX_ITEMS]
    unique = [t for t in unique if len(t) <= MAX_CHARS]
    result: dict[str, str] = {}
    try:
        coll = mongo.db().i18n_cache
        for doc in coll.find({"key": {"$in": [_key(lang, t) for t in unique]}}):
            result[doc["text"]] = doc["value"]
    except Exception as e:
        log.warning(f"[i18n] cache read failed: {e}")
        coll = None
    missing = [t for t in unique if t not in result]
    for start in range(0, len(missing), BATCH):
        chunk = missing[start : start + BATCH]
        try:
            fresh = _groq(lang, chunk)
        except TranslationUnavailable:
            raise
        except Exception as e:  # keep what we have; the client retries later
            log.warning(f"[i18n] Groq translation failed: {e}")
            break
        result.update(fresh)
        if coll is not None and fresh:
            now = datetime.now(timezone.utc)
            try:
                for text, value in fresh.items():
                    coll.update_one({"key": _key(lang, text)}, {"$set": {"key": _key(lang, text), "lang": lang, "text": text, "value": value, "created_at": now}}, upsert=True)
            except Exception as e:
                log.warning(f"[i18n] cache write failed: {e}")
    return result
