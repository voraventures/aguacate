"""Send meeting notes to third-party tools. All credentials come from the OS
keychain (C10); nothing is read from plaintext config. Each sender returns a
human-readable result string or raises RuntimeError with a safe message."""
import logging

import httpx

from .keychain import get_secret

log = logging.getLogger("aguacate.integrations")

TIMEOUT = 15


def _require(name: str) -> str:
    value = get_secret(name)
    if not value:
        raise RuntimeError(f"Not configured: add '{name}' in Settings → Integrations")
    return value


def send_slack(title: str, markdown: str) -> str:
    url = _require("slack_webhook_url")
    if not url.startswith("https://hooks.slack.com/"):
        raise RuntimeError("Slack webhook URL must start with https://hooks.slack.com/")
    resp = httpx.post(
        url,
        json={"text": f"*{title}*\n\n{markdown[:2900]}"},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return "Posted to Slack"


def send_zapier(title: str, markdown: str) -> str:
    url = _require("zapier_webhook_url")
    if not url.startswith("https://hooks.zapier.com/"):
        raise RuntimeError("Zapier webhook URL must start with https://hooks.zapier.com/")
    resp = httpx.post(url, json={"title": title, "notes": markdown}, timeout=TIMEOUT)
    resp.raise_for_status()
    return "Sent to Zapier webhook"


def send_notion(title: str, markdown: str) -> str:
    token = _require("notion_token")
    database_id = _require("notion_database_id")
    blocks = []
    for para in markdown.split("\n\n")[:90]:
        if para.strip():
            blocks.append(
                {
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [{"type": "text", "text": {"content": para[:1900]}}]
                    },
                }
            )
    resp = httpx.post(
        "https://api.notion.com/v1/pages",
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": "2022-06-28",
        },
        json={
            "parent": {"database_id": database_id},
            "properties": {"title": {"title": [{"text": {"content": title[:200]}}]}},
            "children": blocks,
        },
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return "Created Notion page"


def send_linear(title: str, markdown: str) -> str:
    key = _require("linear_api_key")
    # Find first team, create an issue containing the notes.
    gql = httpx.post(
        "https://api.linear.app/graphql",
        headers={"Authorization": key},
        json={"query": "{ teams(first: 1) { nodes { id } } }"},
        timeout=TIMEOUT,
    )
    gql.raise_for_status()
    teams = gql.json().get("data", {}).get("teams", {}).get("nodes", [])
    if not teams:
        raise RuntimeError("No Linear team found for this API key")
    mutation = """
    mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success } }
    """
    resp = httpx.post(
        "https://api.linear.app/graphql",
        headers={"Authorization": key},
        json={
            "query": mutation,
            "variables": {
                "input": {
                    "teamId": teams[0]["id"],
                    "title": f"Meeting notes: {title}"[:250],
                    "description": markdown[:30000],
                }
            },
        },
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    if not resp.json().get("data", {}).get("issueCreate", {}).get("success"):
        raise RuntimeError("Linear rejected the issue")
    return "Created Linear issue"


def send_jira(title: str, markdown: str) -> str:
    token = _require("jira_token")
    email = _require("jira_email")
    base = _require("jira_base_url").rstrip("/")
    if not base.startswith("https://"):
        raise RuntimeError("Jira base URL must be https://")
    projects = httpx.get(
        f"{base}/rest/api/3/project/search?maxResults=1",
        auth=(email, token),
        timeout=TIMEOUT,
    )
    projects.raise_for_status()
    values = projects.json().get("values", [])
    if not values:
        raise RuntimeError("No Jira project visible to this account")
    resp = httpx.post(
        f"{base}/rest/api/3/issue",
        auth=(email, token),
        json={
            "fields": {
                "project": {"key": values[0]["key"]},
                "summary": f"Meeting notes: {title}"[:250],
                "issuetype": {"name": "Task"},
                "description": {
                    "type": "doc",
                    "version": 1,
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": markdown[:30000]}],
                        }
                    ],
                },
            }
        },
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return f"Created Jira issue in {values[0]['key']}"


def send_hubspot(title: str, markdown: str) -> str:
    import html
    import time

    token = _require("hubspot_token")
    # HTML-escape user content before embedding in HubSpot's HTML note body (C4)
    body = (
        f"<strong>{html.escape(title)}</strong><br><br>"
        + html.escape(markdown[:9000]).replace("\n", "<br>")
    )
    resp = httpx.post(
        "https://api.hubapi.com/crm/v3/objects/notes",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "properties": {
                "hs_note_body": body,
                "hs_timestamp": int(time.time() * 1000),
            }
        },
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return "Created HubSpot note"


def send_salesforce(title: str, markdown: str) -> str:
    token = _require("salesforce_token")
    instance = _require("salesforce_instance_url").rstrip("/")
    if not instance.startswith("https://"):
        raise RuntimeError("Salesforce instance URL must be https://")
    resp = httpx.post(
        f"{instance}/services/data/v59.0/sobjects/Note",
        headers={"Authorization": f"Bearer {token}"},
        json={"Title": title[:80], "Body": markdown[:31000]},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return "Created Salesforce note"


def send_google_drive(title: str, markdown: str) -> str:
    from .calendars.google_cal import get_access_token

    token = get_access_token()
    if not token:
        raise RuntimeError("Connect Google in Settings → Calendars first")
    metadata = {"name": f"{title}.md", "mimeType": "text/markdown"}
    import json as _json

    boundary = "aguacate_boundary"
    body = (
        f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{_json.dumps(metadata)}\r\n"
        f"--{boundary}\r\nContent-Type: text/markdown\r\n\r\n{markdown}\r\n--{boundary}--"
    )
    resp = httpx.post(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/related; boundary={boundary}",
        },
        content=body.encode("utf-8"),
        timeout=30,
    )
    resp.raise_for_status()
    return "Uploaded to Google Drive"


SENDERS = {
    "slack": send_slack,
    "zapier": send_zapier,
    "notion": send_notion,
    "linear": send_linear,
    "jira": send_jira,
    "hubspot": send_hubspot,
    "salesforce": send_salesforce,
    "google_drive": send_google_drive,
}
