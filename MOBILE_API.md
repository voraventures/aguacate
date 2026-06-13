# Aguacate Mobile API

The mobile API lets the upcoming **Aguacate for iOS** app securely access meeting data from the desktop app running on the same machine or local network.

## Authentication

All mobile endpoints require two layers of auth:

1. **Desktop token** (`X-Aguacate-Token` header) — issued at launch, required to mint a mobile token.
2. **Mobile token** (`X-Mobile-Token` header) — 30-day token issued per device, used for all subsequent calls.

### Mint a mobile token

```
POST /api/mobile/auth
X-Aguacate-Token: <desktop-token>
Content-Type: application/json

{
  "device_id": "com.apple.device.XXXXXXXX",
  "device_name": "Luis's iPhone"
}
```

**Response:**
```json
{
  "mobile_token": "...",
  "session_id": "...",
  "expires_at": "2026-07-13T00:00:00+00:00"
}
```

---

## Endpoints

All endpoints below require `X-Mobile-Token: <mobile-token>`.

### List meetings (lightweight)

```
GET /api/mobile/meetings
```

Returns minimal fields: `id`, `title`, `started_at`, `status`, `action_count`, `decision_count`.

---

### Get meeting detail

```
GET /api/mobile/meetings/{meeting_id}
```

Returns full meeting detail including `notes` (markdown string) and `actions` array.

---

### List open actions

```
GET /api/mobile/actions
```

Returns all open action items across all meetings with `meeting_title` included.

---

### Complete an action

```
PATCH /api/mobile/actions/{action_id}
Content-Type: application/json

{ "status": "done" }
```

Marks an action complete (or back to `"open"`).

---

### Search

```
GET /api/mobile/search?q=budget+review
```

Full-text search. Returns `id`, `title`, `started_at`, and a short `excerpt` around the match.

---

## Session management

### List sessions

```
GET /api/mobile/sessions
X-Aguacate-Token: <desktop-token>
```

Returns all mobile sessions with `revoked` flag.

### Revoke a session

```
POST /api/mobile/sessions/{session_id}/revoke
X-Aguacate-Token: <desktop-token>
```

---

## CORS

Requests from `aguacate-ios://app` are allowed.

## Notes

- The desktop app must be running for the mobile app to connect.
- Audio never leaves the device — mobile access is read-only except for action status updates.
- Tokens expire after 30 days and can be revoked from **Settings → Export → Mobile**.
