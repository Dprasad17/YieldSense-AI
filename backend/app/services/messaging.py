"""Outbound messages: weekly digests by email (SMTP) and SMS / WhatsApp (Twilio).

Both channels are optional and switched on by environment variables:
- Email: SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASSWORD, SMTP_FROM. Any SMTP provider works
  (Gmail with an app password, Brevo, Mailgun, SendGrid SMTP).
- SMS / WhatsApp: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (a Twilio number, or
  "whatsapp:+14155238886" for the WhatsApp sandbox).
Users opt in under Settings → Notifications (email digest, SMS digest and phone number).
The digest is sent by POST /api/admin/digests/send, which an administrator or a scheduled job calls.
"""
import base64
import os
import smtplib
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from email.message import EmailMessage

from sqlalchemy import select

from backend.app.core.observability import log
from backend.app.db.models import Farm, User
from backend.app.db.session import session_scope
from backend.app.services import insights, store
from backend.app.services.dataset import Filters


def email_configured() -> bool:
    return bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_FROM"))


def sms_configured() -> bool:
    return bool(os.getenv("TWILIO_ACCOUNT_SID") and os.getenv("TWILIO_AUTH_TOKEN") and os.getenv("TWILIO_FROM"))


def channels() -> dict:
    return {"email": email_configured(), "sms": sms_configured()}


def send_email(to: str, subject: str, text: str) -> None:
    msg = EmailMessage()
    msg["From"] = os.environ["SMTP_FROM"]
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    port = int(os.getenv("SMTP_PORT", "587"))
    with smtplib.SMTP(os.environ["SMTP_HOST"], port, timeout=20) as smtp:
        smtp.ehlo()
        if port != 25:
            smtp.starttls()
        if os.getenv("SMTP_USER"):
            smtp.login(os.environ["SMTP_USER"], os.getenv("SMTP_PASSWORD", ""))
        smtp.send_message(msg)


def send_sms(to: str, text: str) -> None:
    sid, token, sender = os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"], os.environ["TWILIO_FROM"]
    if sender.startswith("whatsapp:") and not to.startswith("whatsapp:"):
        to = "whatsapp:" + to
    data = urllib.parse.urlencode({"From": sender, "To": to, "Body": text[:1500]}).encode()
    req = urllib.request.Request(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json", data=data, method="POST")
    req.add_header("Authorization", "Basic " + base64.b64encode(f"{sid}:{token}".encode()).decode())
    with urllib.request.urlopen(req, timeout=20):
        pass


def digest_text(username: str, full_name: str) -> tuple[str, str]:
    """Plain-text weekly digest: unread alerts, open tasks and the top risk for each farm crop."""
    lines = [f"Hello {full_name},", "", "Your YieldSense AI weekly summary:", ""]
    unread = store.list_notifications(username, 1, 5, None, True)
    if unread["items"]:
        lines.append(f"Unread alerts ({unread['total']}):")
        lines += [f"- {n['title']}" for n in unread["items"]]
        lines.append("")
    tasks = [t for t in store.tasks_for_user(username) if t["status"] == "open"][:5]
    if tasks:
        lines.append("Open tasks:")
        lines += [f"- {t['title']}" for t in tasks]
        lines.append("")
    with session_scope() as s:
        uid = s.scalar(select(User.id).where(User.username == username))
        farms = [(f.name, f.region, list(f.crops or [])) for f in s.scalars(select(Farm).where(Farm.owner_id == uid))]
    for name, region, crops in farms[:5]:
        for crop in crops[:2]:
            risks = insights.risk_assessment(Filters.of(region, crop))["risks"]
            if risks:
                r = risks[0]
                lines.append(f"{name} · {crop}: highest risk {r['label']} ({r['level']}). {r['mitigation']}")
    if len(lines) <= 4:
        lines.append("Nothing new this week.")
    lines += ["", "Open the app for details. You can turn this digest off under Settings → Notifications."]
    return "YieldSense AI weekly summary", "\n".join(lines)


def sms_text(body: str) -> str:
    """Short version for SMS: the first alert/task lines only."""
    keep = [line for line in body.splitlines() if line.startswith("- ") or "highest risk" in line][:4]
    return "YieldSense AI: " + (" | ".join(k.lstrip("- ") for k in keep) or "nothing new this week.")


def send_digests(only_user: str | None = None) -> dict:
    """Send the digest to every active user who opted in (or just `only_user`). Returns counts per channel."""
    sent = {"email": 0, "sms": 0, "skipped": 0, "failed": 0}
    with session_scope() as s:
        q = select(User).where(User.active.is_(True))
        if only_user:
            q = q.where(User.username == only_user)
        users = [(u.username, u.email, u.full_name or u.username, dict(u.notification_prefs or {})) for u in s.scalars(q)]
    for username, email, name, prefs in users:
        want_email = prefs.get("email_digest") and email and email_configured()
        want_sms = prefs.get("sms_digest") and prefs.get("phone") and sms_configured()
        if not (want_email or want_sms):
            sent["skipped"] += 1
            continue
        subject, body = digest_text(username, name)
        try:
            if want_email:
                send_email(email, subject, body)
                sent["email"] += 1
            if want_sms:
                send_sms(prefs["phone"], sms_text(body))
                sent["sms"] += 1
        except Exception as e:
            log.warning(f"[messaging] digest to {username} failed: {e}")
            sent["failed"] += 1
    sent["at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return sent
