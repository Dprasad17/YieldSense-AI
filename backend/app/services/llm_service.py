import os
import json
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional
from backend.app.core.observability import log

class LLMService:
    """
    External LLM Service supporting Groq API, Gemini API, and an offline Agronomic AI Fallback Engine.
    Provides real-time yield insights, agricultural risk alerts, and crop management recommendations.
    """
    def __init__(self):
        self._load_env_file()
        self.groq_api_key = os.getenv("GROQ_API_KEY", "").strip()
        self.groq_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b").strip()
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()

    def _load_env_file(self):
        env_path = os.path.join(os.getcwd(), ".env")
        if os.path.exists(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            os.environ.setdefault(k.strip(), v.strip())
            except Exception as e:
                log.warning(f"[LLMService] Could not read .env file: {e}")

    def generate_agricultural_insights(self, payload: Dict[str, Any], prediction_result: Dict[str, Any]) -> Dict[str, Any]:
        # Try Groq API first if key available
        if self.groq_api_key:
            try:
                res = self._call_groq_api(payload, prediction_result)
                if res:
                    return res
            except Exception as e:
                log.warning(f"[LLMService] Groq API call failed: {e}. Falling back to Agronomic Engine...")

        # Try Gemini API second if key available
        if self.gemini_api_key:
            try:
                res = self._call_gemini_api(payload, prediction_result)
                if res:
                    return res
            except Exception as e:
                log.warning(f"[LLMService] Gemini API call failed: {e}. Falling back to Agronomic Engine...")

        # Fallback to deterministic Agronomic AI Expert Engine
        return self._generate_expert_rule_insights(payload, prediction_result)

    def _call_groq_api(self, payload: Dict[str, Any], prediction_result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        url = "https://api.groq.com/openai/v1/chat/completions"
        prompt = self._build_prompt(payload, prediction_result)

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.groq_api_key}",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) YieldSenseAI/1.0"
        }

        body = {
            "model": self.groq_model,
            "messages": [
                {"role": "system", "content": "You are YieldSense AI, an expert agricultural scientist assistant. Respond strictly in JSON format with keys: ai_insights, risk_alerts, recommendations."},
                {"role": "user", "content": prompt}
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.3
        }

        req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            content = res_data["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            parsed["llm_provider"] = f"Groq · {self.groq_model}"
            return parsed

    def _call_gemini_api(self, payload: Dict[str, Any], prediction_result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={self.gemini_api_key}"
        prompt = self._build_prompt(payload, prediction_result)

        headers = {"Content-Type": "application/json"}
        body = {
            "contents": [{
                "parts": [{"text": prompt + "\nRespond strictly in valid JSON with keys: ai_insights, risk_alerts, recommendations."}]
            }]
        }

        req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            content_text = res_data["candidates"][0]["content"]["parts"][0]["text"]
            
            if "```json" in content_text:
                content_text = content_text.split("```json")[1].split("```")[0].strip()
            elif "```" in content_text:
                content_text = content_text.split("```")[1].split("```")[0].strip()
                
            parsed = json.loads(content_text)
            parsed["llm_provider"] = "Google Gemini AI (gemini-1.5-flash)"
            return parsed

    def _build_prompt(self, payload: Dict[str, Any], prediction_result: Dict[str, Any]) -> str:
        return f"""
Analyze the following agricultural telemetry data and yield forecast:
- Crop Type: {payload.get('crop_type')}
- Region: {payload.get('region')}
- Predicted Yield: {prediction_result.get('predicted_yield_kg_ha')} kg/ha (Rating: {prediction_result.get('productivity_rating')})
- Risk Rating: {prediction_result.get('risk_rating')}
- Soil pH: {payload.get('soil_pH')}, Soil Moisture: {payload.get('soil_moisture_%')}%
- Temperature: {payload.get('temperature_C')}°C, Rainfall: {payload.get('rainfall_mm')} mm
- Humidity: {payload.get('humidity_%')}%, Sunlight: {payload.get('sunlight_hours')} hrs
- Irrigation: {payload.get('irrigation_type')}, Fertilizer: {payload.get('fertilizer_type')}
- Disease Status: {payload.get('crop_disease_status')}

Provide a JSON object with:
"ai_insights": String summary of yield driver performance,
"risk_alerts": List of strings detailing active crop risks,
"recommendations": List of strings detailing actionable agronomic steps.
"""

    def _generate_expert_rule_insights(self, payload: Dict[str, Any], prediction_result: Dict[str, Any]) -> Dict[str, Any]:
        """Deterministic insights. Thresholds come from core/agronomy_rules (derived from the dataset)."""
        from backend.app.core.agronomy_rules import rules_for

        crop = str(payload.get("crop_type", "Crop"))
        region = str(payload.get("region", "the selected region"))
        yield_val = float(prediction_result.get("predicted_yield_kg_ha", 0.0))
        prod_rating = str(prediction_result.get("productivity_rating", "Medium"))
        rules = rules_for(crop)

        risk_alerts: List[str] = []
        recommendations: List[str] = []

        disease = str(payload.get("crop_disease_status", "None"))
        if disease.lower() not in ("none", "unknown", ""):
            risk_alerts.append(f"{disease} disease recorded for this {crop} field.")
            recommendations.append(f"Scout the field and confirm the pathogen before choosing a {disease.lower()}-stage treatment.")

        if rules:
            checks = [
                ("temperature_C", "Temperature", "°C", "Plan heat-tolerant varieties or shift sowing to a cooler window.", "Protect the root zone from cold with mulching."),
                ("soil_pH", "Soil pH", "", "Apply agricultural lime to raise pH toward the optimal band.", "Incorporate elemental sulfur or gypsum to lower pH."),
                ("soil_moisture_%", "Soil moisture", "%", "Schedule irrigation to lift root-zone moisture into the optimal band.", "Improve drainage; moisture is above the optimal band."),
            ]
            for feature, label, unit, low_action, high_action in checks:
                value = payload.get(feature)
                if value is None:
                    continue
                rng = rules.optimal[feature]
                value = float(value)
                band_text = f"{rng.low:g}–{rng.high:g}{unit}"
                if value < rng.low:
                    risk_alerts.append(f"{label} {value:g}{unit} is below the {crop} optimal band ({band_text}).")
                    recommendations.append(low_action)
                elif value > rng.high and high_action:
                    risk_alerts.append(f"{label} {value:g}{unit} is above the {crop} optimal band ({band_text}).")
                    recommendations.append(high_action)

        summary_insight = (
            f"{crop} in {region}: predicted {yield_val:,.0f} kg/ha, which is {prod_rating.lower()} "
            f"productivity for {crop} in this dataset."
        )
        if not risk_alerts:
            risk_alerts.append("All checked inputs are within the optimal bands of top-yielding records for this crop.")
        if not recommendations:
            recommendations.append("Keep current practices; no input is outside the optimal bands.")

        return {
            "ai_insights": summary_insight,
            "risk_alerts": risk_alerts,
            "recommendations": recommendations,
            "llm_provider": "YieldSense rule engine",
        }

    def write_rationale(self, rec: Dict[str, Any]) -> tuple[str, str]:
        """Plain-language "why" for a recommendation. Returns (text, source).
        Groq writes it when a key is configured; otherwise a deterministic sentence is built from the evidence."""
        if self.groq_api_key:
            import hashlib

            from backend.app.db import mongo

            key = hashlib.sha256(json.dumps([self.groq_model, rec["title"], rec["affected_area"], rec["evidence"], rec["impact_kg_ha"]], sort_keys=True, default=str).encode()).hexdigest()
            cached = mongo.cache_get("llm_cache", key)
            if cached:
                return cached, f"Groq · {self.groq_model}"
            try:
                text = self._groq_rationale(rec)
                mongo.cache_set("llm_cache", key, text)
                return text, f"Groq · {self.groq_model}"
            except Exception as e:
                log.warning(f"[LLMService] Groq rationale failed: {e}. Using rule-based text.")
        return self._fallback_rationale(rec), "YieldSense rule engine (fallback)"

    def _groq_rationale(self, rec: Dict[str, Any]) -> str:
        evidence = "; ".join(
            f"{e['label']}: observed {e['observed']}{e['unit']}, optimal {e['optimal_low']}–{e['optimal_high']}{e['unit']}, "
            f"{round(e['share_affected'] * 100)}% of records affected"
            for e in rec["evidence"]
        )
        prompt = (
            f"Recommendation: {rec['title']} ({rec['affected_area']}). Evidence: {evidence}. "
            f"Model-estimated effect of fixing it: {rec['impact_kg_ha']:+.0f} kg/ha. "
            "In 2-3 plain sentences for a farmer, explain why this matters. Use only the numbers given; "
            "do not invent measurements, dates or products."
        )
        body = {
            "model": self.groq_model,
            "messages": [
                {"role": "system", "content": "You are an agronomist who explains recommendations briefly and factually."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 160,
        }
        req = urllib.request.Request(
            "https://api.groq.com/openai/v1/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.groq_api_key}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=6) as response:
            data = json.loads(response.read().decode("utf-8"))
        text = str(data["choices"][0]["message"]["content"]).strip()
        if not text:
            raise ValueError("empty completion")
        return text

    @staticmethod
    def _fallback_rationale(rec: Dict[str, Any]) -> str:
        parts = []
        for e in rec["evidence"]:
            parts.append(
                f"{e['label']} is {e['observed']}{e['unit']} here, while the top-yielding {rec['crop_label']} records sit "
                f"between {e['optimal_low']} and {e['optimal_high']}{e['unit']} "
                f"({round(e['share_affected'] * 100)}% of records are outside that band)."
            )
        impact = rec["impact_kg_ha"]
        if impact > 0:
            parts.append(f"Bringing it into range raises the model's yield estimate by about {impact:,.0f} kg/ha on affected records.")
        else:
            parts.append("The yield model shows no measurable gain from changing it, so treat this as a watch item.")
        return " ".join(parts)


llm_service = LLMService()
