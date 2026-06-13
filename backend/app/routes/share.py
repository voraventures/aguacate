"""Read-only shareable meeting summaries (token-gated, 30-day expiry).

Returns only the human-facing notes (title, date, attendees, note sections) —
never transcripts or audio. The standalone HTML endpoint renders a clean,
chrome-free page with Aguacate branding.
"""
import html as _html
import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from ..db import get_db

router = APIRouter(prefix="/api/share", tags=["share"])


def _valid_share(token: str):
    db = get_db()
    row = db.execute("SELECT * FROM shares WHERE token=?", (token,)).fetchone()
    if not row:
        return None
    try:
        if datetime.fromisoformat(row["expires_at"]) < datetime.now(timezone.utc):
            return None
    except (ValueError, TypeError):
        return None
    return row


def _payload(meeting_id: str):
    db = get_db()
    m = db.execute("SELECT * FROM meetings WHERE id=?", (meeting_id,)).fetchone()
    if not m:
        return None
    note = db.execute(
        "SELECT content, sections FROM notes WHERE meeting_id=?", (meeting_id,)
    ).fetchone()
    try:
        attendees = json.loads(m["attendees"] or "[]")
    except json.JSONDecodeError:
        attendees = []
    return {
        "title": m["title"],
        "date": m["started_at"],
        "attendees": attendees,
        "notes_markdown": note["content"] if note else "",
        "sections": json.loads(note["sections"] or "{}") if note else {},
    }


@router.get("/{token}")
def get_share(token: str):
    s = _valid_share(token)
    if not s:
        raise HTTPException(status_code=404, detail="Share link not found or expired")
    payload = _payload(s["meeting_id"])
    if not payload:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return payload


@router.get("/{token}/html", response_class=HTMLResponse)
def get_share_html(token: str):
    s = _valid_share(token)
    if not s:
        raise HTTPException(status_code=404, detail="Share link not found or expired")
    payload = _payload(s["meeting_id"])
    if not payload:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return HTMLResponse(_render_html(payload))


# ---------- minimal, dependency-free markdown -> HTML (escaped) ----------
def _inline(text: str) -> str:
    text = _html.escape(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    return text


def _md_to_html(md: str) -> str:
    out = []
    lines = md.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line.strip():
            i += 1
            continue
        if line.startswith("### "):
            out.append(f"<h3>{_inline(line[4:])}</h3>")
            i += 1
        elif line.startswith("## "):
            out.append(f"<h2>{_inline(line[3:])}</h2>")
            i += 1
        elif line.startswith("# "):
            out.append(f"<h1>{_inline(line[2:])}</h1>")
            i += 1
        elif line.lstrip().startswith(("- ", "* ")):
            items = []
            while i < len(lines) and lines[i].lstrip().startswith(("- ", "* ")):
                items.append(f"<li>{_inline(lines[i].lstrip()[2:])}</li>")
                i += 1
            out.append("<ul>" + "".join(items) + "</ul>")
        elif line.lstrip().startswith("|"):
            rows = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                rows.append(lines[i])
                i += 1
            out.append(_table(rows))
        else:
            out.append(f"<p>{_inline(line)}</p>")
            i += 1
    return "\n".join(out)


def _table(rows: list[str]) -> str:
    parsed = []
    for r in rows:
        cells = [c.strip() for c in r.strip().strip("|").split("|")]
        if cells and set("".join(cells)) <= {"-", ":", " "}:
            continue  # separator row
        parsed.append(cells)
    if not parsed:
        return ""
    head, *body = parsed
    thead = "<tr>" + "".join(f"<th>{_inline(c)}</th>" for c in head) + "</tr>"
    tbody = "".join(
        "<tr>" + "".join(f"<td>{_inline(c)}</td>" for c in row) + "</tr>" for row in body
    )
    return f"<table>{thead}{tbody}</table>"


def _render_html(payload: dict) -> str:
    title = _html.escape(payload["title"])
    try:
        date = datetime.fromisoformat(payload["date"]).strftime("%B %-d, %Y · %-I:%M %p")
    except (ValueError, TypeError):
        date = _html.escape(str(payload.get("date") or ""))
    attendees = ", ".join(_html.escape(a) for a in payload["attendees"])
    body_html = _md_to_html(payload["notes_markdown"] or "")
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — Aguacate</title>
<style>
  :root {{ color-scheme: light; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: #f3f1ea; color: #1e281d;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    line-height: 1.6; }}
  .wrap {{ max-width: 720px; margin: 0 auto; padding: 48px 24px 80px; }}
  .brand {{ display: flex; align-items: center; gap: 8px; font-weight: 700;
    color: #3f8b45; font-size: 15px; letter-spacing: -0.01em; margin-bottom: 28px; }}
  .brand .dot {{ width: 10px; height: 10px; border-radius: 50%; background: #3f8b45; }}
  h1.title {{ font-size: 28px; line-height: 1.2; margin: 0 0 8px; letter-spacing: -0.02em; }}
  .meta {{ color: #63685e; font-size: 13px; margin-bottom: 32px; }}
  .card {{ background: #fff; border: 1px solid rgba(30,40,29,0.09); border-radius: 14px;
    padding: 8px 28px 24px; box-shadow: 0 1px 3px rgba(30,40,29,0.05); }}
  h2 {{ font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;
    color: #2e6b34; margin: 28px 0 8px; }}
  h3 {{ font-size: 15px; margin: 20px 0 6px; }}
  p {{ margin: 8px 0; }}
  ul {{ margin: 8px 0; padding-left: 20px; }}
  li {{ margin: 4px 0; }}
  table {{ width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }}
  th, td {{ text-align: left; padding: 8px 10px; border-bottom: 1px solid rgba(30,40,29,0.09); }}
  th {{ font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #63685e; }}
  footer {{ margin-top: 32px; color: #9aa093; font-size: 12px; text-align: center; }}
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand"><span class="dot"></span> Aguacate</div>
    <h1 class="title">{title}</h1>
    <div class="meta">{date}{(" · " + attendees) if attendees else ""}</div>
    <div class="card">{body_html}</div>
    <footer>Shared from Aguacate — AI meeting notes. No bot. No cloud.</footer>
  </div>
</body>
</html>"""
