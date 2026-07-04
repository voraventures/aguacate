# Handoff: Aguacate — Meeting Workspace UI

## Overview
Aguacate is a desktop conversation workspace: it records meetings, transcribes them, and
auto-generates knowledge (title, summary, actions, decisions, topics, questions, timeline,
highlights). This package covers the redesigned workspace: the **capture flow**
(record → grow → ready), the **Meeting detail** (Overview / Timeline / Transcript / Ask),
the **meeting list + sidebar chrome**, and the **home/marketing** panel.

**Core product principle — zero manual labor:** the user only talks/records. Everything
(including the meeting **title**) is auto-generated *after* processing. Never add UI that
asks the user to type a title, tag, or manually organize. Titles/knowledge surface only at
the "Ready" stage.

## About the Design Files
The files in this bundle are **design references authored in HTML** (a streaming
"Design Component" format) — prototypes showing intended look and behavior, **not**
production code to copy verbatim. The task is to **recreate these designs in the existing
Aguacate codebase**, using its established framework, component library, and patterns.
If a component library exists, map these to it; only the visual spec (tokens, layout,
type, motion) below is authoritative.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, motion, and interactions. Recreate
pixel-accurately using the codebase's stack, honoring the exact tokens below.

## Design language (locked)
- Calm, mostly **warm off-white** (paper), not clinical white. Green is the **only** brand accent.
- **Editorial serif (Newsreader)** for big titles, the wordmark, and the AI summary.
- **Hanken Grotesk** for all UI sans (nav, body, labels). *(In production, substitute the
  studio's licensed grotesque — e.g. Söhne / ABC Diatype — Hanken is the open stand-in.)*
- **JetBrains Mono** for timestamps, meta, section eyebrows, and date badges.
- Icons: one system — **24px grid, 1.75 stroke, round caps + joins**, soft geometry.
- Rounded corners throughout, flat (no heavy shadows), generous whitespace.
- Emoji: none. Gradients: only the whisper-soft green summary card.

## Design Tokens

### Color
Surfaces
- Paper base (windows, main, sidebar): `#FBFAF8`
- Meeting-list surface: `#FDFCF8`
- Pure white (buttons, inset cards, avatars border): `#FFFFFF`
- Active nav pill fill: `#EFEFEA`

Text
- Primary ink: `#22201A` (also `#232320`, `#2A2A26`)
- Secondary: `#54544C`, `#6A6A62`
- Muted: `#8A857C`, `#9A9488`, `#A8A296`
- Faint (placeholders, dividers text): `#B8B2A6`, `#C7C1B4`

Hairlines / borders
- `#EAE6DD` (window border), `#ECE8DF`, `#EFEBE2`, `#F1EEE6`, `#E7E2D6`

Brand green (single accent — use semantically only)
- Logo outline: `#7DBE3A`
- Primary green (checks, dots, active underline, today badge): `#6FA83C`
- Deep green (avatars, wordmark accents): `#5F9E2B`
- Green text on light: `#4C7E22`
- Green tints: bg `#EFF4E6`, `#F3F7EA`, `#E6F0D5`; borders `#E1EBCD`, `#E2EAD2`
- Summary hero gradient: `linear-gradient(135deg,#F3F7EA,#FAF9F1)`, border `#E2EAD2`

Logo waveform bars: `#111111` (black — matches the brand mark; animate while recording)

People/avatar accents (data, NOT brand accents): amber `#C58B3E`, purple `#8B6FC5`,
teal `#4A9BB5`, green `#5F9E2B`

Destructive / REC: `#EF5A4E`, `#EF5A6E`, `#D8453A`
Window traffic lights: `#F0655A` / `#F5BE4F` / `#61C554`

### Typography
- **Newsreader** (serif): weights 400/500/600 + italics.
  - Meeting title: 32–34px / 500 / letter-spacing −.015em
  - Wordmark "Aguacate": 20px / 500
  - AI summary body: 22–23px / 400 / line-height 1.5 (italic green for the key phrase)
- **Hanken Grotesk** (sans): 400/500/600/700.
  - Nav items 14px; body 13.5–15px / line-height 1.6–1.7; buttons 13.5–15px/500
- **JetBrains Mono**: 400/500/600.
  - Timestamps/meta 11–12px; section **eyebrows** 11px / letter-spacing .12–.14em / UPPERCASE / `#9A9488`; date-badge month 7.5px, day 14px/700

### Radius
- Window 16px · cards 14–18px · summary hero 18px · chips/pills 20px · buttons 10–16px ·
  date badge 8px · small controls 8–11px · avatars 50%

### Shadow (soft, sparse)
- Window: `0 40px 90px -34px rgba(40,36,26,.3), 0 8px 24px -14px rgba(40,36,26,.13)`
- Card (subtle lift): `0 1px 2px rgba(40,36,26,.04)`
- Summary hero adds green glow: `0 14px 34px -22px rgba(95,158,43,.4)`
- Active meeting-list card: `0 1px 2px rgba(30,34,20,.04)`

### Layout / spacing
- App window: **1520 × 940** (desktop macOS/Windows).
- Columns: sidebar **210** · meeting list **236** · main **flex** · optional right rail **272**.
  (Overview has **no** right rail; Transcript has a "Chapters" rail.)
- Titlebar 42px (traffic lights). Toolbar/tab row under the title.
- Main content padding ≈ 26–30px vertical / 40–48px horizontal.

## Screens / Views

### 1. Home / brand panel (marketing or first-run/empty state)
620px column on `#FBFAF8`. Newsreader hero "Every conversation *grows* into knowledge."
(italic green "grows"), sub in Hanken. Large avocado illustration. "Signature Moments"
list: 1 Recording, 2 Processing, 3 Ready. Pull-quote in italic serif. Not a nav destination.

### 2. Capture flow (state machine — see `CaptureFlow.dc.html`)
560 × 640 card. Phases:
- **idle** → title "Ready to capture", big dark "Start recording" (mic) button.
- **recording** → REC pill (pulsing), title "New recording", subtitle "Aguacate is
  listening · 10:30 AM". The **logo's black waveform bars animate to the live audio
  amplitude**. Controls: mic / pause / red Stop.
- **processing** → two counter-rotating dashed rings around the mark, "Growing your
  meeting…", three bouncing dots, "~30 seconds".
- **ready** → mark lifts + scales down, green check **pops** in, title reveals the
  auto-generated name **"Product Strategy Sync"**, subtitle **types out** the summary
  ("Mid-market focus, a July analytics beta, and faster onboarding.") with a blinking
  green caret, then **3 actions / 2 decisions / 4 topics** chips stagger in. "View meeting"
  + "Replay".
- Timings: mount→900ms start · recording 4600ms · processing 2800ms · type 30ms/char ·
  chips delay .50/.64/.78s · reset replays after 750ms.

### 3. Meeting Overview (canonical detail — the `#5i` block)
4-col shell (sidebar + list from chrome, then main). Header: serif title + star, meta row
(date · 48m · 6 people) with overlapping avatar stack, Share + "…" buttons. Tab row:
Overview / Timeline / Transcript / Ask (active = ink text + 2px `#6FA83C` underline).
Body:
- **Summary hero** — soft green gradient card, faint avocado watermark, row of
  [primary logo mark 26px] + mono eyebrow "SUMMARY BY AGUACATE", then the serif summary
  with the key phrase in italic green.
- Two columns (left 1.5 / right 1, divided by a hairline):
  - Left: **Actions** (mono eyebrow + count) — rows: check-circle · task · owner · due(mono);
    done rows use a filled green check + strikethrough. **Decisions** — green-dot rows.
  - Right: **Topics** (outline pill chips), **Open questions** (serif "?" + text),
    **Highlight** (avatar + line + timestamp on a soft card).

### 4. Timeline / Transcript / Ask (full screens: `#5c` / `#5d` / `#5e`)
Same shell + header, tab active accordingly.
- **Timeline**: vertical rail (time · dot · card). Card kinds tagged TOPIC (green pill),
  DECISION (green-filled pill + green-tinted card), ACTIONS (amber pill). Milestones
  (start/wrap) are hollow dots, no card.
- **Transcript**: player bar (play · mm:ss · progress w/ green fill + handle · 1x). Speaker
  turns (avatar · name · mono timestamp · paragraph). "Now playing" turn is full-opacity
  with a green left keyline + highlighted phrase; past turns dimmed. Right rail: search +
  Chapters list (active chapter green-tinted).
- **Ask**: user question bubbles (green-tint, right-aligned) + answer cards (logo mark +
  grounded answer, "Sources" with clickable timestamp chips, thumbs up/down). Bottom:
  suggested-question chips + "Ask a question…" input with dark send button.

### 5. Sidebar + meeting list (shared chrome — `AguacateChrome.dc.html`)
- Sidebar: wordmark; nav Meetings(active)/Today/Library/Search/Meeting Zero/Digest;
  Settings; user chip (avatar · Daniel Kim · Acme Inc. · chevron). Active nav = `#EFEFEA`
  pill; icons `#4A4A44` active / `#9A9A90` inactive.
- Meeting list: "Today ▾" scope. Each row = **calendar date badge** + title + duration.
  Badge: rounded 36×40, mono month strip (today `#6FA83C`, past `#B8B2A6`) over a big day
  number. Active meeting = white card + border + green check; groups "Today" / "Earlier".

## Interactions & Behavior
- **Live waveform (recording):** keep a rolling amplitude array (~40 samples, updated
  ~100ms). The mark's 7 inner bars sample from it (indices ~4,10,16,20,24,30,36); bar
  height = base × (0.42 + amp×0.82), vertically centered.
- **Typewriter summary (ready):** reveal SUMMARY string char-by-char at 30ms; show a
  blinking `#6FA83C` caret while typing.
- **Staggered chip entrance:** `cfRise` (opacity 0 + translateY(10px) → 0), .55s
  cubic-bezier(.22,1,.36,1), delays .50/.64/.78s.
- **Scroll-triggered entrances:** elements tagged `data-rise="<ms delay>"` start at
  opacity 0 / translateY(24px) and transition to visible (.7s cubic-bezier(.22,1,.36,1))
  when they enter the viewport; **re-arm** (reset) when fully scrolled out so it replays.
  Implemented with a rAF getBoundingClientRect check (works with transform-panned canvases;
  in a normal app an IntersectionObserver is fine).
- **Action check-off:** click the circle → fill `#6FA83C`, `agPop` (scale 1→1.32→1, .4s),
  insert white tick, set label `#9A9488` + line-through. Toggle back on second click.
- **Tab cross-fade:** clicking a tab dissolves the content region (opacity → 0, swap
  panel display, → 1, ~.2s) and moves the 2px green underline to the active tab.
- **Processing rings:** two dashed circles, `agSpin` 16s and 11s (reverse).
- Hover/focus/loading/error states are not specified here — apply the codebase's
  conventions; keep the calm, low-contrast, green-only accent language.

## State Management
- **Capture flow:** `phase` (idle|recording|processing|ready), `elapsed` (s), `typed`
  (string), `amp` (number[40]). Timers drive phase transitions (values above); clear all on
  reset/unmount.
- **Overview:** per-action `checked` boolean; active `tab`. (In the prototype the check-off
  is DOM-imperative for demo purposes — implement as real state in the app.)

## Assets
Brand mark = avocado outline with a waveform inside. Four provided SVG variants
(`viewBox 0 0 220 256`):
- `logo-primary-5eac84b8.svg` — green `#7DBE3A` outline + **black `#111111`** bars → light surfaces (default).
- `logo-monochrome.svg` — all `#111111` → single-color/print.
- `logo-primary-dark.svg` — green outline + light `#F7F7F5` bars → dark surfaces.
- `logo-reversed.svg` — all `#F7F7F5` → dark/photo backgrounds.
All other icons are inline stroke SVGs following the icon system (24 grid / 1.75 / round);
in production, replace with the codebase's icon set drawn to that spec. Avatars are
initials on a solid color (no photos); wire real user avatars where available.

## Screenshots (reference renders, in `screenshots/`)
Left/main-column crops of each screen at 1520-wide (partial width — see the HTML files for
full layout). Motion end-states shown where relevant.
- `01-screen.png` — Meeting Overview (`#5i`, canonical) · Overview tab
- `02-screen.png` — Timeline tab (`#5c`)
- `03-screen.png` — Transcript tab (`#5d`)
- `04-screen.png` — Ask tab (`#5e`)
- `05-screen.png` — Home / brand panel (`#5f`)
- `06-screen.png` — Signature moments (`#5b`)
- `01-capture.png` — Capture flow · **recording** (live waveform in the mark)
- `02-capture.png` — Capture flow · **processing** ("Growing your meeting…")
- `03-capture.png` — Capture flow · **ready** (name + typed summary + chips)

## Files
- `Aguacate Meeting.dc.html` — main canvas. Anchors: `#5g` capture flow, `#5i` Overview
  (canonical), `#5c` Timeline, `#5d` Transcript, `#5e` Ask, `#5f` Home, `#5b` moments.
  (`#5a` tinted + `#5h` white are earlier **comparison** variants — ignore; `#5i` is final.)
- `AguacateChrome.dc.html` — shared sidebar + meeting list.
- `CaptureFlow.dc.html` — animated capture state machine (logic + template).
- `logo-*.svg` — brand mark variants.
- `CLAUDE.md` — project principles (kept in sync with this doc).
