"""The rationale prompt and the rule-based fallback state observations, never causation."""
import re

import pytest

from backend.app.services import llm_service as mod
from backend.app.services.llm_service import LLMService

# Wording that would turn an observed share or a model estimate into a causal claim.
CAUSAL = re.compile(
    r"\b(because|causes?|caused|causing|due to|leads? to|results? in|thanks to|driven by|drives?|"
    r"reduced yields?|reduces yield|lower(s|ed)? yields?|show(s)? reduced|will (increase|raise|boost|improve)|"
    r"raises the|boosts?|guarantee[sd]?)\b",
    re.I,
)


def test_the_check_itself_catches_causal_wording():
    assert CAUSAL.search("58 % of the 506 records show reduced yields")
    assert CAUSAL.search("Yield is low because of heat") and CAUSAL.search("This will increase yield")
    assert not CAUSAL.search("58% of records are outside that band")


def rec(impact):
    return {
        "title": "Temperatures above the optimal band",
        "affected_area": "India · Rice · 506 records",
        "crop_label": "Rice",
        "impact_kg_ha": impact,
        "evidence": [{"label": "Temperature", "unit": " °C", "observed": 26.4, "optimal_low": 22.1, "optimal_high": 25.8, "share_affected": 0.58}],
    }


@pytest.mark.parametrize("impact", [661.7, -471.8, 0.0, None])
def test_fallback_rationale_never_claims_causation(impact):
    text = LLMService._fallback_rationale(rec(impact))
    assert not CAUSAL.search(text), text
    assert "58% of records are outside that band" in text
    if impact is None:
        assert "no yield effect is estimated" in text
    elif impact > 0:
        assert "the model's yield estimate" in text and "662 kg/ha higher" in text


@pytest.mark.parametrize("impact", [661.7, -471.8, None])
def test_rationale_facts_are_observations(impact):
    facts = LLMService._rationale_facts(rec(impact))
    assert not CAUSAL.search(facts), facts
    assert "58% of records are outside that band" in facts
    assert "records affected" not in facts  # the old wording invited "affected yields"
    assert ("Model estimate: none" in facts) == (impact is None)


def test_rationale_rules_tell_the_llm_not_to_infer_causes(monkeypatch):
    rules = mod.RATIONALE_RULES
    assert "State only what the evidence shows" in rules
    assert "never say those records have lower, reduced or lost yield" in rules
    assert "Do not state or imply a reason or mechanism" in rules

    sent = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b'{"choices": [{"message": {"content": "ok"}}]}'

    def fake_urlopen(req, timeout=0):
        import json

        sent.update(json.loads(req.data))
        return FakeResponse()

    monkeypatch.setattr(mod.urllib.request, "urlopen", fake_urlopen)
    LLMService()._groq_rationale(rec(661.7))
    user = sent["messages"][1]["content"]
    assert user.endswith(rules) and user.startswith("Recommendation: Temperatures above the optimal band")
    assert "stating only what the evidence shows" in sent["messages"][0]["content"]
