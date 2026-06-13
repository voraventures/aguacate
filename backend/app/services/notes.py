"""Structured AI meeting notes via the Claude API."""
import logging

from ..config import CLAUDE_MODEL, NOTES_DIR, write_secure_text
from ..db import get_setting
from ..events import hub
from .keychain import get_secret

log = logging.getLogger("aguacate.notes")

def is_configured() -> bool:
    return bool(get_secret("anthropic_api_key"))


def get_client():
    api_key = get_secret("anthropic_api_key")
    if not api_key:
        raise RuntimeError("Anthropic API key not configured. Add it in Settings → AI.")
    import anthropic

    return anthropic.Anthropic(api_key=api_key)


def current_model() -> str:
    return get_setting("claude_model", CLAUDE_MODEL)


def generate_notes(
    meeting_id: str,
    title: str,
    transcript: str,
    attendees: list[str],
    template_id: str | None = None,
) -> dict:
    """Call Claude with the meeting's template and persist the markdown."""
    from . import templates as templates_svc

    client = get_client()
    template = templates_svc.get_template(template_id)
    hub.emit("notes_started", {"meeting_id": meeting_id, "template": template["name"]})

    attendee_line = f"Attendees: {', '.join(attendees)}\n" if attendees else ""
    message = client.messages.create(
        model=current_model(),
        max_tokens=2400,
        system=templates_svc.compose_system_prompt(template),
        messages=[
            {
                "role": "user",
                "content": (
                    f"Meeting title: {title}\n{attendee_line}\n"
                    f"Transcript:\n\n{transcript[:120000]}"
                ),
            }
        ],
    )
    content = "".join(b.text for b in message.content if b.type == "text").strip()

    path = NOTES_DIR / f"{meeting_id}.md"
    write_secure_text(path, content)

    hub.emit("notes_done", {"meeting_id": meeting_id})
    return {"content": content, "path": str(path)}


def split_sections(markdown: str) -> dict[str, str]:
    """Split the notes markdown into {section_name: body} using ## headers."""
    sections: dict[str, str] = {}
    current = None
    buf: list[str] = []
    for line in markdown.splitlines():
        if line.startswith("## "):
            if current:
                sections[current] = "\n".join(buf).strip()
            current = line[3:].strip()
            buf = []
        else:
            buf.append(line)
    if current:
        sections[current] = "\n".join(buf).strip()
    return sections
