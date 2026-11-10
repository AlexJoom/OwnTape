# Design — OwnTape

Status: all 4 deliverables are ready. Store screenshots 1–4 have placeholders until real captures exist.

## Files

| Path | What |
|---|---|
| `popup/popup.html` | Production popup template. All 7 states as `<section data-state="…" hidden>`. Copy it to the extension. |
| `popup/popup.css` | Popup styles + light/dark tokens. Copy it to the extension. |
| `popup/states.html` | Visual spec: every state (and the variants) in light and dark. Open it in Chrome. Generated; do not edit. |
| `popup/build-states.mjs` | Regenerates `states.html` from `popup.html`: `node design/popup/build-states.mjs` |
| `popup/preview.css` | Gallery-only styles. Do not ship. |
| `icon/icon.svg`, `icon/icon-recording.svg` | Master SVGs (>= 32 px). |
| `icon/icon-16.svg`, `icon/icon-recording-16.svg` | Pixel-snapped SVGs for 16 px. |
| `icon/png/icon-{16,32,48,128}.png` | Idle icon exports. |
| `icon/png/icon-recording-{16,32,48,128}.png` | Recording icon exports (toolbar). |
| `pages/mic-permission.html` | Microphone permission page. Status panels `[data-status=waiting|granted|denied]`, all `hidden`; JS shows one. Notes in the file header. |
| `pages/welcome.html` | First-run page (3 steps + optional mic + facts). Open on `onInstalled` (reason "install"). |
| `pages/pages.css` | Styles for both pages (same tokens as the popup, light/dark). |
| `store/png/screenshot-{1..5}.png` | 1280×800 store screenshots. 1–4: placeholder stage; 5 (data-flow diagram) is final. |
| `store/png/promo-small-440x280.png`, `store/png/marquee-1400x560.png` | Promo images (final, no Meet UI in them). |
| `store/build-store.mjs` | Regenerates all store PNGs. Name/tagline: constants `NAME`, `TAGLINE` at the top. |
| `store/shots/` | Put real captures here as `shot-1.png` … `shot-4.png` (16:10, ≥ 1600×1000). The script then uses them instead of the placeholder. |
| `brand/` | Wordmark, lockup (primary logo) and the tape-reel proposal. See `brand/README.md`. |
| `icon/build-icons.mjs` | Regenerates all SVGs and PNGs (needs `google-chrome`): `node design/icon/build-icons.mjs` |

## Notes for the developer

### Popup
- Width 340 px. `body.mr-body > div.mr-popup`. Height follows the content.
- Show one state: remove `hidden` from one `[data-state]` section, set it on the others.
- States: `not-meet`, `ready`, `starting`, `recording`, `saving`, `saved`, `error`.
- On each state change, write one short sentence into `#sr-status` (role=status) for screen readers, for example "Recording started", "Recording saved".
- `#timer` has `role="timer"`: update its text every second (format `HH:MM:SS`). It is not announced.
- `#mic-toggle` is a native checkbox with `role="switch"`. Keep its value in `chrome.storage.local` (default: on).
- Recording state: set `#mic-chip-text` to "Mic on" / "Mic off". For "Mic off", also use the crossed mic icon (see variant 4b in `states.html`). `#size-chip-text` is optional ("≈ 86 MB"); hide the chip if you do not compute the size.
- Saved state: fill `#file-name` and `#file-meta` ("48 min · 312 MB · Downloads folder"). "Show in folder" → `chrome.downloads.show(downloadId)`.
- Error state: fill `#error-title`, `#error-text`, and the button labels. Hide `#btn-error-secondary` when not used. Texts for 3 errors are in `states.html` (7a mic blocked, 7b tab closed, 7c capture failed).
- "Allow microphone" opens the microphone permission page (deliverable 3, it comes next).
- **Consent aid (chat notice)**
  - Ready: `#notice-toggle` (switch, default on, remember the last choice) and `#notice-text` (textarea, maxlength 500) inside `<details id="notice-details">` ("Edit the message"). `#btn-notice-reset` puts back the default text: "I am recording this call with OwnTape. Tell me if you do not agree."
  - CSS (`:has(.js-notice-toggle:not(:checked))`) hides the editor and shows the long consent reminder when the toggle is off. No JS needed for this. Keep the class `js-notice-toggle` on the switch.
  - Recording: three blocks `[data-notice="pending" | "posted" | "failed"]`, all `hidden`. Show ONE. Show "posted" only after you verify the message in the chat. Show none if the toggle was off.
  - Buttons: `#btn-notice-repost` (Post the notice again), `#btn-notice-copy` (copy the text; then change its label to "Copied" for 2 s), `#btn-notice-retry`.
  - "failed" is a warning (`role="alert"`), not the error state. The recording continues.
- Suggested file name: `meet-YYYY-MM-DD_HH-MM.webm` (local time).
- The product name (OwnTape) occurs only in `<title>` and `.js-app-name`. You can also fill it from `chrome.i18n.getMessage("appName")`.
- Links: Help → repo `#readme`, Source → repo, Privacy → `PRIVACY.md` in the repo (the developer must create that file).
- CSP: no inline scripts, no inline handlers, no `style=""` attributes. Inline SVG is used for the icons (it is not script).
- Motion: the red dot pulses, the spinner turns. Both stop with `prefers-reduced-motion`.

### Toolbar icon
```js
// idle
chrome.action.setIcon({ path: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' } });
// recording
chrome.action.setIcon({ path: { 16: 'icons/icon-recording-16.png', 32: 'icons/icon-recording-32.png' } });
chrome.action.setTitle({ title: 'OwnTape — recording' });
```
Do not add a badge. At 16 px the badge covers the mark, and the red icon already shows the state.

manifest: `"icons": { "16": …icon-16.png, "32": …, "48": …, "128": …icon-128.png }` and the same set in `action.default_icon`.

## Design decisions

- **Tone:** calm and clear. Indigo for the brand and normal actions; red only for "recording" and "stop". No dark patterns, no alarm language.
- **Brand colour:** indigo `#4338CA` (dark theme: `#A5B0FF`). It is not a Google colour and not near the Meet palette.
- **Icon:** a "record" symbol (ring + dot) on a rounded tile. No camera, no Google shapes or colours. It does not depend on the name.
- **Recording icon:** red tile + one big solid dot. The shape changes too, not only the colour (colour-blind users).
- **Privacy is visible:** header pill "100% local", footer "Saves to your Downloads folder".
- **Consent reminder:** always visible in the Ready state, just above Start. Not a blocking checkbox (less friction; the user stays responsible).
- **"You can close this window"** in the Recording state: users often think that closing the popup stops the recording.
- **Trademark:** "Google Meet" appears only as a description of where the extension works ("Open a Google Meet call", "meet.google.com"). Never in the name, logo or icon.

## Accessibility (WCAG 2.2 AA)

Checked contrast ratios (text ≥ 4.5:1, UI parts ≥ 3:1):

| Pair | Light | Dark |
|---|---|---|
| Text / background | 17.8 | 15.4 |
| Muted text / background | 7.0 | 7.7 |
| Muted text / surface-2 | 6.0 | 6.0 |
| Button text / brand | 7.9 | 8.8 |
| Button text / stop red | 5.7 | 6.7 |
| Callout text (warning) | 7.5 | 10.4 |
| Recording label / red soft bg | 8.2 | 10.6 |
| Success icon / green soft bg | 4.6 | 7.3 |
| Switch border / background (non-text) | 3.4 | 4.8 |

- Keyboard: all controls are native `<button>`, `<a>`, `<input>`. Visible focus ring (2 px, offset 2 px) on all of them.
- Target size: buttons ≥ 40 px high, switch 40 × 24 px (≥ 24 px, criterion 2.5.8).
- Each state section has a heading (`aria-labelledby`).

## Answered (Orchestrator, 2026-11-10)

1. Name: **OwnTape** (approved). MIT licence. Repository: https://github.com/AlexJoom/OwnTape. Keep the ring-and-dot icon.
2. Mic toggle default: on; remember the last choice.
3. Size chip: keep, as elapsed size only ("86 MB"), not a forecast.
4. Save target: always the Downloads folder. No "Save as" dialog.
5. The red recording icon replaces a "REC" badge.

## Store screenshots — how to make the real captures

- Staged call with test accounts. No real faces or names. Avatars or cameras off are fine.
- Do not edit or redraw the Meet UI. Only crop and scale the capture.
- Browser at 1600×1000 (16:10), light theme, no other extensions pinned, bookmarks bar hidden.
- shot-1: popup open, Ready state. shot-2: same, consent reminder visible. shot-3: Recording state, red toolbar icon visible. shot-4: the saved .webm playing in VLC (or the Downloads folder).

## Open points

- `marketing/04-store-listing.md` says "Record" button and "red badge". The UI says **Start recording** and uses a **red toolbar icon** (no badge). The listing text should follow the UI.
