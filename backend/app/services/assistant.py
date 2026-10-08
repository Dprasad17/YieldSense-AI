"""Ask YieldSense: a chat assistant grounded in the user's own data.

Each question is answered by the Groq LLM from a context block built on the server: the user's farms,
recent predictions, open tasks, and the risk and recommendation summaries for each farm's region and
crops. The model is told to use only those facts and to say when something isn't in them.
Conversations are kept in MongoDB (`assistant_chats`, last 40 messages per user).
"""
import json
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select

from backend.app.core.observability import log
from backend.app.db import mongo
from backend.app.db.models import Farm, User
from backend.app.db.session import session_scope
from backend.app.services import insights, store
from backend.app.services.dataset import Filters
from backend.app.services.llm_service import USER_AGENT, llm_service
from backend.app.services.ml_service import active_model_summary

MAX_HISTORY = 40
CONTEXT_TURNS = 8
SYSTEM_PROMPT = (
    "You are YieldSense Assistant, an agronomy helper inside the YieldSense AI platform. "
    "Answer the farmer's question using ONLY the facts in the CONTEXT block and general, widely accepted agronomy. "
    "When the answer depends on data that isn't in the context, say so and point to the page in the app that has it "
    "(Yield Predictor, Weather, Soil, Recommendations, Risk assessment, Farms, Market, Leaf check). "
    "Never invent measurements, prices, dates or product names. Yields in the platform are national averages per country "
    "and crop, not field measurements; say this when it matters. Keep answers short: at most 6 sentences or 5 bullet points. "
    "Answer in the language the user writes in."
)


class AssistantUnavailable(Exception):
    pass


def _farms(username: str) -> list[dict]:
    with session_scope() as s:
        uid = s.scalar(select(User.id).where(func.lower(User.username) == username.lower()))
        if uid is None:
            return []
        farms = s.scalars(select(Farm).where(Farm.owner_id == uid).order_by(Farm.id)).all()
        return [
            {"id": f.id, "name": f.name, "region": f.region, "area_ha": f.area_ha, "crops": list(f.crops or []), "irrigation": f.irrigation_type, "soil_ph": f.soil_ph}
            for f in farms
        ]


def build_context(username: str) -> str:
    lines: list[str] = []
    model = active_model_summary() or {}
    lines.append(f"Model: {model.get('name')} v{model.get('version')}, R² {model.get('r2')}, RMSE {model.get('rmse')} kg/ha on held-out years.")
    farms = _farms(username)
    if not farms:
        lines.append("The user has no farms yet.")
    for f in farms[:5]:
        lines.append(f"Farm '{f['name']}' (id {f['id']}): {f['region']}, {f['area_ha']} ha, crops {', '.join(f['crops']) or 'none'}, irrigation {f['irrigation'] or 'unknown'}, soil pH {f['soil_ph'] or 'unknown'}.")
        for crop in f["crops"][:3]:
            filters = Filters.of(f["region"], crop)
            try:
                risk = insights.risk_assessment(filters)
                top = [f"{r['label']} {r['level']} ({round(r['share_affected'] * 100)}% of records)" for r in risk["risks"][:3]]
                lines.append(f"  {crop} in {f['region']} risks: {'; '.join(top) or 'none'}.")
                trend = insights.seasonal_trends(filters)
                fc = trend.get("forecast")
                if fc:
                    lines.append(f"  {crop} next-season model forecast: {fc['mean_kg_ha']:.0f} kg/ha (P10–P90 {fc['p10_kg_ha']:.0f}–{fc['p90_kg_ha']:.0f}).")
            except Exception as e:  # context is best-effort
                log.warning(f"[assistant] context for {crop}/{f['region']} failed: {e}")
    preds = store.list_predictions(username, 1, 5)["items"]
    for p in preds:
        lines.append(f"Prediction {p['created_at'][:10]}: {p['crop_type']} in {p['region']} → {p['predicted_yield_kg_ha']:.0f} kg/ha (P10–P90 {p['low_kg_ha']:.0f}–{p['high_kg_ha']:.0f}), risk {p['risk_rating']}.")
    tasks = [t for t in store.tasks_for_user(username) if t.get("status") == "open"][:5]
    for t in tasks:
        lines.append(f"Open task: {t.get('title') or t.get('recommendation_id') or t.get('id')}.")
    return "\n".join(lines)


def history(username: str) -> list[dict]:
    try:
        docs = mongo.db().assistant_chats.find({"user": username.lower()}).sort([("created_at", -1), ("_id", -1)]).limit(MAX_HISTORY)
        return [{"role": d["role"], "content": d["content"], "created_at": d["created_at"].isoformat(timespec="seconds")} for d in docs][::-1]
    except Exception:
        return []


def clear(username: str) -> int:
    return mongo.db().assistant_chats.delete_many({"user": username.lower()}).deleted_count


def _save(username: str, question: str, answer: str) -> None:
    """Question and answer in one write, the answer 1 ms later so the order is stable."""
    now = datetime.now(timezone.utc)
    docs = [
        {"user": username.lower(), "role": "user", "content": question, "created_at": now},
        {"user": username.lower(), "role": "assistant", "content": answer, "created_at": now + timedelta(milliseconds=1)},
    ]
    try:
        mongo.db().assistant_chats.insert_many(docs)
    except Exception as e:
        log.warning(f"[assistant] history write failed: {e}")


def _groq(messages: list[dict]) -> str:
    key = llm_service.groq_api_key
    if not key:
        raise AssistantUnavailable("The assistant needs a Groq API key (GROQ_API_KEY) on the server.")
    body = {"model": llm_service.groq_model, "messages": messages, "temperature": 0.2, "max_tokens": 700}
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}", "User-Agent": USER_AGENT},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        log.warning(f"[assistant] Groq call failed: {e}")
        raise AssistantUnavailable("The AI service didn't answer. Try again in a minute.")
    text = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    if not text.strip():
        raise AssistantUnavailable("The AI service returned an empty answer. Try rephrasing the question.")
    return text.strip()


def ask(username: str, message: str, page: Optional[str] = None) -> dict:
    context = build_context(username)
    past = history(username)[-CONTEXT_TURNS:]
    messages = [{"role": "system", "content": SYSTEM_PROMPT + "\n\nCONTEXT:\n" + context + (f"\nThe user is on the {page} page." if page else "")}]
    messages += [{"role": m["role"], "content": m["content"]} for m in past]
    messages.append({"role": "user", "content": message})
    answer = _groq(messages)
    _save(username, message, answer)
    return {"answer": answer, "provider": f"Groq · {llm_service.groq_model}", "context_lines": context.count("\n") + 1}
