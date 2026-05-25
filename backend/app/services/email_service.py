import os
from ..logger import logger

MAIL_ENABLED = False
try:
    from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
    MAIL_ENABLED = True
except ImportError:
    logger.warning("[EMAIL] fastapi-mail not installed — emails will be skipped")


def _get_bool_env(name: str, default: bool) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.lower() in ("true", "1", "yes", "on")


def _get_conf():
    u = os.getenv("MAIL_USERNAME", "")
    p = os.getenv("MAIL_PASSWORD", "")
    if not u or not p or not MAIL_ENABLED:
        return None
    
    server = os.getenv("MAIL_SERVER", "smtp.gmail.com")
    try:
        port = int(os.getenv("MAIL_PORT", "587"))
    except ValueError:
        port = 587
        
    starttls = _get_bool_env("MAIL_STARTTLS", True)
    ssl_tls = _get_bool_env("MAIL_SSL_TLS", False)

    return ConnectionConfig(
        MAIL_USERNAME   = u,
        MAIL_PASSWORD   = p,
        MAIL_FROM       = os.getenv("MAIL_FROM", u),
        MAIL_PORT       = port,
        MAIL_SERVER     = server,
        MAIL_STARTTLS   = starttls,
        MAIL_SSL_TLS    = ssl_tls,
        USE_CREDENTIALS = True,
    )


async def send_email(to: str, subject: str, body: str) -> bool:
    conf = _get_conf()
    if not conf:
        logger.info(f"[EMAIL SKIPPED] to={to} | {subject}")
        return False
    try:
        msg = MessageSchema(subject=subject, recipients=[to], body=body, subtype="html")
        await FastMail(conf).send_message(msg)
        logger.info(f"[EMAIL SENT] to={to} | {subject}")
        return True
    except Exception as e:
        logger.error(f"[EMAIL ERROR] to={to} | {e}")
        return False


def monthly_schedule_html(officer_name: str, rows: list, month_label: str) -> str:
    def c(s):
        return {"Morning": "#f59e0b", "Night": "#3b82f6", "Leave": "#ef4444"}.get(s, "#9ca3af")

    rows_html = "".join(
        f"<tr style='border-bottom:1px solid #e5e7eb;'>"
        f"<td style='padding:8px 12px;font-weight:500;'>{d}</td>"
        f"<td style='padding:8px 12px;color:#6b7280;'>{day}</td>"
        f"<td style='padding:8px 12px;font-weight:600;color:{c(s)};'>{s}</td>"
        f"</tr>"
        for d, day, s in rows
    )
    return f"""
<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:20px;">
  <div style="background:#7b1e3a;color:white;padding:24px;border-radius:10px 10px 0 0;text-align:center;">
    <div style="font-size:30px;font-weight:900;letter-spacing:3px;margin-bottom:2px;">STERLING</div>
    <div style="font-size:10px;letter-spacing:5px;opacity:.75;margin-bottom:14px;">BANK</div>
    <div style="height:1px;background:rgba(255,255,255,.25);margin-bottom:14px;"></div>
    <h2 style="margin:0;font-size:17px;font-weight:600;">SMO Timetable System</h2>
    <p style="margin:4px 0 0;opacity:.7;font-size:12px;">Service Monitoring Officers</p>
  </div>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 10px 10px;">
    <p style="font-size:15px;color:#111827;">Hi <strong>{officer_name}</strong>,</p>
    <p style="color:#374151;margin-bottom:20px;">
      Your schedule for <strong>{month_label}</strong> is ready.
    </p>
    <table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;
                  overflow:hidden;border:1px solid #e5e7eb;">
      <thead>
        <tr style="background:#7b1e3a;color:white;">
          <th style="padding:10px 12px;text-align:left;font-size:13px;">Date</th>
          <th style="padding:10px 12px;text-align:left;font-size:13px;">Day</th>
          <th style="padding:10px 12px;text-align:left;font-size:13px;">Your Shift</th>
        </tr>
      </thead>
      <tbody>{rows_html}</tbody>
    </table>
    <p style="color:#6b7280;font-size:12px;margin-top:24px;text-align:center;">
      Automated message — SMO Scheduler · Sterling Bank. Do not reply.
    </p>
  </div>
</div>"""