"""Claude-powered features beyond note generation: follow-up composer and
semantic knowledge search. All calls send text only — never audio."""
import json
import logging
import re

from ..db import get_db
from .notes import current_model, get_client

log = logging.getLogger("aguacate.ai")

TONES = {
    "professional": "professional and polished — courteous, direct, no fluff",
    "friendly": "warm and personable — like a colleague who enjoyed the conversation",
    "concise": "extremely concise — short sentences, bullets where natural, under 120 words",
}


def _extract_json(text: str):
    """Pull the first JSON array/object out of a model response."""
    match = re.search(r"\[.*\]|\{.*\}", text, flags=re.S)
    if not match:
        raise ValueError("No JSON in model response")
    return json.loads(match.group(0))


def compose_followup(meeting_id: str, tone: str) -> dict:
    """Draft a follow-up email from the meeting notes."""
    db = get_db()
    meeting = db.execute("SELECT * FROM meetings WHERE id=?", (meeting_id,)).fetchone()
    note = db.execute(
        "SELECT content FROM notes WHERE meeting_id=?", (meeting_id,)
    ).fetchone()
    if not meeting or not note:
        raise RuntimeError("Meeting notes not found")

    tone_desc = TONES.get(tone, TONES["professional"])
    client = get_client()
    message = client.messages.create(
        model=current_model(),
        max_tokens=900,
        system=(
            "You draft follow-up emails after meetings. Tone: "
            f"{tone_desc}. Output ONLY JSON: "
            '{"subject": "...", "body": "..."} — body is plain text with real '
            "line breaks, opens with a one-line thank-you/context, then recaps "
            "decisions and each action item with its owner, and closes with next "
            "steps. No markdown syntax in the body. Never invent content."
        ),
        messages=[
            {
                "role": "user",
                "content": f"Meeting: {meeting['title']}\n\nNotes:\n{note['content'][:12000]}",
            }
        ],
    )
    text = "".join(b.text for b in message.content if b.type == "text")
    draft = _extract_json(text)
    return {
        "subject": str(draft.get("subject", f"Follow-up: {meeting['title']}"))[:200],
        "body": str(draft.get("body", ""))[:8000],
    }


def ask_meeting(meeting_id: str, query: str) -> dict:
    """Answer a question about one meeting from its notes and transcript.
    Returns {"answer": str, "sources": [{"quote": str}]}."""
    db = get_db()
    meeting = db.execute("SELECT * FROM meetings WHERE id=?", (meeting_id,)).fetchone()
    if not meeting:
        raise RuntimeError("Meeting not found")
    note = db.execute(
        "SELECT content FROM notes WHERE meeting_id=?", (meeting_id,)
    ).fetchone()
    transcript = db.execute(
        "SELECT text FROM transcripts WHERE meeting_id=?", (meeting_id,)
    ).fetchone()
    context_parts = []
    if note and note["content"]:
        context_parts.append("NOTES:\n" + note["content"][:10000])
    if transcript and transcript["text"]:
        context_parts.append("TRANSCRIPT:\n" + transcript["text"][:14000])
    if not context_parts:
        raise RuntimeError("This meeting has no notes or transcript yet")

    client = get_client()
    message = client.messages.create(
        model=current_model(),
        max_tokens=800,
        system=(
            "You answer questions about one specific meeting using only the "
            "provided notes and transcript. Output ONLY JSON: "
            '{"answer": "direct, concise answer", "sources": [{"quote": "short '
            'verbatim or tightly paraphrased passage the answer rests on"}]}. '
            "At most 3 sources. If the material does not contain the answer, "
            'say so plainly in "answer" and return "sources": []. Never invent '
            "content."
        ),
        messages=[
            {
                "role": "user",
                "content": f"Meeting: {meeting['title']}\n\n"
                + "\n\n".join(context_parts)
                + f"\n\nQuestion: {query[:300]}",
            }
        ],
    )
    text = "".join(b.text for b in message.content if b.type == "text")
    try:
        parsed = _extract_json(text)
    except (ValueError, json.JSONDecodeError):
        return {"answer": text.strip()[:1500], "sources": []}
    sources = [
        {"quote": str(s.get("quote", ""))[:400]}
        for s in (parsed.get("sources") or [])
        if isinstance(s, dict) and s.get("quote")
    ][:3]
    return {"answer": str(parsed.get("answer", ""))[:1500], "sources": sources}


def semantic_search(query: str) -> list[dict]:
    """Rank relevant excerpts across all meeting notes for a natural-language
    question. One Claude call over a compact corpus of summaries."""
    db = get_db()
    rows = db.execute(
        """SELECT m.id, m.title, m.started_at, n.sections
           FROM meetings m JOIN notes n ON n.meeting_id=m.id
           ORDER BY m.started_at DESC LIMIT 40"""
    ).fetchall()
    if not rows:
        return []

    corpus_parts = []
    budget = 16000
    for r in rows:
        try:
            sections = json.loads(r["sections"])
        except json.JSONDecodeError:
            sections = {}
        digest = " | ".join(
            f"{k}: {v[:400]}"
            for k, v in sections.items()
            if k in ("Executive Summary", "Decisions Made", "Action Items", "Key Discussions")
        )
        entry = f"[{r['id']}] {r['title']} ({r['started_at'][:10]}): {digest}"
        if budget - len(entry) < 0:
            break
        budget -= len(entry)
        corpus_parts.append(entry)

    client = get_client()
    message = client.messages.create(
        model=current_model(),
        max_tokens=1200,
        system=(
            "You are a meeting-knowledge search engine. Given a question and a "
            "corpus of meeting digests (each prefixed by [meeting_id]), return "
            "ONLY a JSON array of at most 5 results, best first: "
            '[{"meeting_id": "...", "excerpt": "the specific relevant content, '
            'quoted or tightly paraphrased from the digest", "answer": "one-line '
            'direct answer contribution"}]. Only include genuinely relevant '
            "results; return [] if nothing matches. Never fabricate."
        ),
        messages=[
            {
                "role": "user",
                "content": f"Question: {query[:300]}\n\nCorpus:\n" + "\n".join(corpus_parts),
            }
        ],
    )
    text = "".join(b.text for b in message.content if b.type == "text")
    try:
        results = _extract_json(text)
    except (ValueError, json.JSONDecodeError):
        return []

    by_id = {r["id"]: r for r in rows}
    out = []
    for item in results if isinstance(results, list) else []:
        meeting = by_id.get(item.get("meeting_id"))
        if meeting:
            out.append(
                {
                    "meeting_id": meeting["id"],
                    "title": meeting["title"],
                    "date": meeting["started_at"],
                    "excerpt": str(item.get("excerpt", ""))[:500],
                    "answer": str(item.get("answer", ""))[:300],
                }
            )
    return out[:5]
