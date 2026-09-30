"""Creates notifications for a user's current context (Region · Crop). Deduplicated by key."""
from backend.app.services import insights, store
from backend.app.services.dataset import Filters

NOTIFY_SEVERITIES = ("critical", "high")
ALERT_LEVELS = ("High", "Critical")


def _context_key(f: Filters) -> str:
    return f"{(f.region or 'all').lower()}|{(f.crop or 'all').lower()}"


def _link(path: str, f: Filters) -> str:
    params = "&".join(f"{k}={v}" for k, v in (("region", f.region), ("crop", f.crop)) if v)
    return f"{path}?{params}" if params else path


def sync_recommendations(username: str, f: Filters, recs: list[dict]) -> int:
    created = 0
    for rec in recs:
        if rec["severity"] not in NOTIFY_SEVERITIES:
            continue
        created += store.notify(
            username,
            category="recommendations",
            severity=rec["severity"],
            title=rec["title"],
            body=f"{rec['affected_area']}. {rec['action']}",
            dedupe_key=f"rec:{rec['id']}",
            link=_link("/app/recommendations", f),
        )
    return created


def sync_risk(username: str, f: Filters, risks: list[dict]) -> int:
    """Notifies when a risk is first seen at High/Critical, or when its level changes afterwards."""
    created, ctx = 0, _context_key(f)
    for r in risks:
        previous = store.swap_risk_level(username, ctx, r["type"], r["level"])
        changed = previous is not None and previous != r["level"]
        first_alert = previous is None and r["level"] in ALERT_LEVELS
        if not (changed or first_alert):
            continue
        title = (
            f"{r['label']} risk is {r['level'].lower()}"
            if previous is None
            else f"{r['label']} risk changed: {previous} → {r['level']}"
        )
        created += store.notify(
            username,
            category="alerts",
            severity="high" if r["level"] in ALERT_LEVELS else "info",
            title=title,
            body=f"{f.describe()}: {round(r['share_affected'] * 100)}% of records affected. {r['mitigation']}",
            dedupe_key=f"risk:{ctx}:{r['type']}:{previous}->{r['level']}",
            link=_link("/app/risk", f),
        )
    return created


def sync_context(username: str, f: Filters) -> None:
    if not insights.filter_df(f).empty:
        sync_recommendations(username, f, insights.recommendations(f)["recommendations"])
        sync_risk(username, f, insights.risk_assessment(f)["risks"])
