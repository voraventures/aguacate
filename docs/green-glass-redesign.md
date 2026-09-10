# Green Glass redesign

Implemented September 9, 2026 in the 2.5.1 source. The installed 2.5.0 app and its data were not replaced or migrated.

## What changed

- Five-item, keyboard-accessible floating dock replaces the left navigation rail. Menus open upward; all eleven settings categories remain reachable.
- Section-aware settings navigation opens a 480px non-modal panel. Account access opens Subscription; generic Settings access opens General. Existing settings forms and API operations are reused.
- Native system typography, stronger light/dark contrast, a screen-only scalable type system, restrained green glass navigation, clearer titles/metadata, and responsive transcript/overview layouts.
- Settings, capture screens, empty/error states, and onboarding use the new screen styles. Capture start/pause/stop behavior is unchanged; dismissible capture states now have a visible close button. Reduce motion also skips the ready-summary typewriter animation.
- New navigation labels are included in all six existing locales. No backend, public API, database, licensing, or security fixes are included.
- Print-specific typography and layout remain in the existing stylesheet. The new type and theme overrides apply only to screens.

## Preview without touching real data

From the repository directory:

```sh
npm run dev:renderer -- --port 5198 --host 127.0.0.1
```

Open `http://127.0.0.1:5198/tests/visual/index.html`. This separate development entry uses synthetic meeting data, per-frame in-memory preferences, stubbed API calls, and blocked fetch/external-window actions. It never initializes the backend. Capture controls simulate state changes only; no audio is recorded or played.

Optional isolated Electron window, in another terminal:

```sh
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron tests/visual/electron.cjs
```

The harness uses a temporary Electron profile, without the production main process or preload. Close its window to quit. Stop the preview server with Ctrl+C. Preview entries are not part of the production renderer build.

## Verification

- `npm run build`: passed. Existing warning remains for a renderer JavaScript chunk exceeding 500 kB.
- Node DOM tests: passed registry coverage, every settings destination, menu arrows/Home/End/Escape, outside dismissal, focus return, subscription shortcut, meeting tabs, Digest, capture entry/dismissal, and selected theme contrast pairs.
- Real Chromium layout matrix: **18/18 passed**, combining light/dark, small/medium/large type, and 900×600 / 1320×860 / 1600×1000 viewports. Checks cover dock bounds, content clearance, horizontal overflow, and minimum metadata size on the meeting overview. This is not a full accessibility certification.
- Visual inspection in isolated Electron and Safari included light/dark overviews, settings panels, menus, and synthetic empty, loading, error, recording, processing, and completed states.
- Windows native execution, live audio, integrations, checkout, and real settings saves were not tested. No installer was built.

The DOM tests use jsdom without altering the pre-existing dirty package lock:

```sh
test_deps=$(mktemp -d /tmp/aguacate-ui-tests.XXXXXX)
npm install --prefix "$test_deps" --no-audit --no-fund jsdom@26
AGUACATE_TEST_DEPS="$test_deps" node --test --test-force-exit tests/ui.test.mjs tests/meeting-cards.test.mjs
```

The force-exit option prevents retained test-runtime handles from keeping Node alive after the DOM fixture is unmounted. The test suite completes all assertions before exit. The test runner requires a Node version supporting that flag.

## Compact meeting cards follow-up

- The left panel now has Today and the local date above search, a non-interactive Up next card, Upcoming, Recorded today, Yesterday, and localized date groups. Missing dates use a separate Date unavailable group; invalid times/durations are omitted.
- Opaque compact cards use 14px corners/padding, 10px spacing, two-line titles, a green selected edge, separate Sample labels, and text recording/processing/failure states. There are no date badges, decorative avatars, or new calendar actions.
- Selection and options are sibling buttons. The single options menu supports arrows, Escape, outside dismissal, and focus return, and is portaled outside the scrolling list to prevent clipping. Existing confirmation and store deletion/Undo behavior remain in use; search reflects optimistic deletion and Undo immediately.
- Local-day grouping updates on window focus and every minute. All new labels exist in English, Spanish, French, Korean, Portuguese, and Chinese. Backend, installed app, recordings, and production preferences are untouched.
- Eight automated tests pass, including midnight, 23/25-hour DST days, cancellation/recorded-event filtering, invalid timing, empty/history-only libraries, all recording states, full accessible titles, search, independent options, confirmation, Undo presentation, and focus restoration. Existing shell/settings tests still pass.
- The expanded Chromium layout checks passed **54/54 cases**: the original 18 theme/type/window combinations at each of 260px, 300px, and 480px list widths. Checks include card bounds, selected-card visibility, independent controls, minimum metadata size, scrolling area/dock clearance, and horizontal overflow. Selected light/dark card text pairs meet 4.5:1 contrast.
- Preview controls now include `cards` (all statuses, invalid/missing dates, and filtered calendar events), `no-today`, and panel widths. These are synthetic fixtures, not live recording or calendar tests. Native Windows execution and a complete assistive-technology audit remain outside this validation.

## Heads up and wordmark follow-up

- Heads up now uses independent, opaque blue-gray theme tokens. Its icon, content, spacing, and behavior remain unchanged; shared warning tokens and compliance styles are preserved.
- Header, capture, loading, connection-error, and render-error branding share a screen-only Hanken Grotesk wordmark: weight 600, −0.02em tracking, 1.2 line height. Header/capture use 20px and loading/error use 28px at the standard text size, scaling with preferences. The font is already bundled locally; no remote font dependency was added. Body typography, logo icons, and print/export styling remain unchanged.
- All 10 DOM/helper/contrast tests and the renderer production build pass. The existing >500kB chunk warning remains. Banner text and icon pairs pass 4.5:1 contrast checks.
- All 54 Chromium layout combinations pass expanded checks for local font loading, wordmark face/weight/size, header clearance, exact banner fill/text colors, and isolation from compliance styling. Screenshots were reviewed in light/dark, including synthetic loading and connection-error branding.
- Added `banners`, `boot-loading`, and `boot-error` preview states. The preview remains isolated; no installed app, backend, real data, or production settings were changed.
