"""Export notes as PDF (fpdf2), Markdown, or plain text. Files land in EXPORTS_DIR."""
import re
from pathlib import Path

from ..config import EXPORTS_DIR, secure_file, touch_secure, write_secure_text

_MD_BOLD = re.compile(r"\*\*(.+?)\*\*")
_MD_HEADER = re.compile(r"^(#{1,3})\s+(.*)$")


def _safe_name(title: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9 _-]", "", title).strip() or "meeting"
    return cleaned[:60].replace(" ", "_")


def export_markdown(title: str, markdown: str) -> Path:
    path = EXPORTS_DIR / f"{_safe_name(title)}.md"
    write_secure_text(path, f"# {title}\n\n{markdown}\n")
    return path


def export_text(title: str, markdown: str) -> Path:
    text = _MD_BOLD.sub(r"\1", markdown)
    lines = []
    for line in text.splitlines():
        m = _MD_HEADER.match(line)
        if m:
            heading = m.group(2).upper()
            lines.append(heading)
            lines.append("=" * len(heading))
        else:
            lines.append(line)
    path = EXPORTS_DIR / f"{_safe_name(title)}.txt"
    write_secure_text(path, f"{title.upper()}\n{'=' * len(title)}\n\n" + "\n".join(lines))
    return path


def export_pdf(title: str, markdown: str) -> Path:
    from fpdf import FPDF

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.set_margins(18, 18, 18)

    def w(text, size=11, style="", color=(30, 40, 29), spacing=6):
        pdf.set_font("Helvetica", style, size)
        pdf.set_text_color(*color)
        safe = text.encode("latin-1", "replace").decode("latin-1")
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(0, spacing, safe, new_x="LMARGIN", new_y="NEXT")

    w(title, size=20, style="B", color=(63, 139, 69), spacing=9)
    pdf.ln(3)

    in_table = False
    for line in markdown.splitlines():
        stripped = line.strip()
        header = _MD_HEADER.match(stripped)
        if header:
            pdf.ln(3)
            w(header.group(2), size=14, style="B", color=(63, 139, 69), spacing=8)
            in_table = False
        elif stripped.startswith("|"):
            cells = [c.strip() for c in stripped.strip("|").split("|")]
            if all(set(c) <= {"-", ":", " "} for c in cells):
                continue
            style = "B" if not in_table else ""
            w("   ".join(_MD_BOLD.sub(r"\1", c) for c in cells), size=10, style=style, spacing=5)
            in_table = True
        elif stripped.startswith(("-", "*")):
            w("  •  " + _MD_BOLD.sub(r"\1", stripped.lstrip("-* ")), spacing=5.5)
            in_table = False
        elif stripped:
            w(_MD_BOLD.sub(r"\1", stripped), spacing=5.5)
            in_table = False
        else:
            pdf.ln(2)

    path = EXPORTS_DIR / f"{_safe_name(title)}.pdf"
    touch_secure(path)  # 0600 before fpdf writes content
    pdf.output(str(path))
    secure_file(path)
    return path


EXPORTERS = {"pdf": export_pdf, "markdown": export_markdown, "text": export_text}


# ---------- Export Pack: cross-meeting premium exports ----------

def export_actions_csv() -> Path:
    """All action items: owner, action, due, meeting, date, status."""
    import csv

    from ..db import get_db

    path = EXPORTS_DIR / "aguacate-actions.csv"
    touch_secure(path)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Owner", "Action", "Due", "Meeting", "Meeting date", "Status"])
        for r in get_db().execute(
            """SELECT a.owner, a.action, a.due, m.title, m.started_at, a.status
               FROM action_items a JOIN meetings m ON m.id=a.meeting_id
               ORDER BY m.started_at DESC"""
        ):
            writer.writerow(
                [r["owner"], r["action"], r["due"], r["title"], r["started_at"][:10], r["status"]]
            )
    secure_file(path)
    return path


def export_timeline_pdf() -> Path:
    """Chronological decision log across all meetings."""
    from fpdf import FPDF

    from ..db import get_db

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.set_margins(18, 18, 18)

    def w(text, size=11, style="", color=(30, 40, 29), spacing=6):
        pdf.set_font("Helvetica", style, size)
        pdf.set_text_color(*color)
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(
            0, spacing, text.encode("latin-1", "replace").decode("latin-1"),
            new_x="LMARGIN", new_y="NEXT",
        )

    w("Aguacate — Decision Timeline", size=20, style="B", color=(63, 139, 69), spacing=9)
    pdf.ln(4)
    current_date = None
    for r in get_db().execute(
        """SELECT d.text, d.status, d.decided_at, m.title
           FROM decisions d JOIN meetings m ON m.id=d.meeting_id
           ORDER BY d.decided_at"""
    ):
        date = r["decided_at"][:10]
        if date != current_date:
            pdf.ln(2)
            w(date, size=12, style="B", color=(63, 139, 69), spacing=7)
            current_date = date
        suffix = "  [superseded]" if r["status"] == "superseded" else ""
        w(f"  -  {r['text']}{suffix}", size=10.5, spacing=5.5)
        w(f"      from: {r['title']}", size=9, color=(118, 123, 114), spacing=4.5)

    path = EXPORTS_DIR / "aguacate-decision-timeline.pdf"
    touch_secure(path)
    pdf.output(str(path))
    secure_file(path)
    return path


def slack_digest(title: str, sections: dict) -> str:
    """Slack-flavored markdown summary, ready to paste."""
    parts = [f"*{title}*"]
    if sections.get("Executive Summary"):
        parts.append(sections["Executive Summary"].replace("**", "*"))
    if sections.get("Decisions Made"):
        parts.append("*Decisions*\n" + sections["Decisions Made"].replace("**", "*"))
    if sections.get("Action Items"):
        rows = [
            line for line in sections["Action Items"].splitlines()
            if line.strip().startswith("|") and "Owner" not in line and "---" not in line
        ]
        actions = []
        for row in rows:
            cells = [c.strip() for c in row.strip("|").split("|")]
            if len(cells) >= 2:
                due = f" _(due {cells[2]})_" if len(cells) > 2 and cells[2] else ""
                actions.append(f"• *{cells[0]}* — {cells[1]}{due}")
        if actions:
            parts.append("*Action items*\n" + "\n".join(actions))
    return "\n\n".join(parts)
