<p align="center">
  <img src="design/brand/lockup-light.svg#gh-light-mode-only" alt="OwnTape" height="64">
  <img src="design/brand/lockup-dark.svg#gh-dark-mode-only" alt="OwnTape" height="64">
</p>

<p align="center"><strong>Record Google Meet™ calls to a video file on your own computer.</strong><br>
Free and open source (MIT). No account, no bot in the call, no upload.</p>

---

OwnTape is a Chrome extension. Recording is not included in some Google Workspace plans, for example Business Starter. OwnTape does not turn on Google's own recording: it records your Meet tab, like a screen recorder, and saves a `.webm` file in your Downloads folder.

## Install

The Chrome Web Store version is not published yet. To use it now, load it from the source:

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.
4. Pin OwnTape in the toolbar (puzzle icon → pin).

Chrome 116 or later is necessary.

## What it does

- Records the Meet tab: the picture that the tab shows, the voices of the other participants, and (optional) your microphone, mixed into one file.
- You keep hearing the call while it records.
- The recording is written to disk while you record, so a long call does not fill the memory, and a crash does not lose the call. After a crash, the popup offers the part that was recorded.
- Stops and saves when you click **Stop and save**, close the Meet tab, or leave the call.
- The toolbar icon turns red while it records.

## Consent aid: the chat notice

When you start a recording, OwnTape can post a notice in the Meet chat. The default text is:

> I am recording this call with OwnTape. Tell me if you do not agree.

- Turn it on or off with **Post a notice in the call chat** in the popup. You can edit the text (**Edit the message**). OwnTape remembers your choice.
- During the recording, **Post the notice again** posts it one more time, for people who join late (they do not see earlier chat messages).
- OwnTape shows **Notice posted in the chat** only after it sees the message in the chat. If the post fails (the host turned off the chat, or Google changed the Meet page), the recording continues and the popup tells you: "The notice was not posted. Tell the participants yourself." Use **Copy the text** to paste it yourself.
- OwnTape posts only when you click **Start recording** or **Post the notice again**. It never posts automatically.
- The notice is an aid, not a replacement for consent. Also say it aloud: not everyone reads the chat.

## Before you record

Tell all participants that you record. In many countries, the law requires their consent. On a managed work or school account, follow your organisation's recording policy.

## Privacy

OwnTape makes **no network requests**. There is no server, no analytics and no account. Settings stay in your browser's extension storage. To post the chat notice, OwnTape writes your text into the Meet page; to check it, it counts exact copies of your own text in the chat panel and keeps nothing else. You can check all of this in the code and in the Network tab of Chrome DevTools. Full text: [PRIVACY.md](PRIVACY.md).

## Permissions

| Permission | Why |
|---|---|
| `tabCapture` | Records the picture and sound of the Meet tab after you click **Start recording**. |
| `offscreen` | Runs the recorder in a hidden extension page, so the recording continues when the popup closes. |
| `downloads` | Saves the finished file to your Downloads folder. |
| `storage` | Keeps your settings and the recording state in the browser. |
| `activeTab` | Access to the tab where you opened the popup. |
| `scripting` | Writes the chat notice into the recorded Meet tab. |
| `https://meet.google.com/*` | Reads the meeting code for the file name, detects when you leave the call, and lets the chat notice reach the Meet tab. No other site. |

Chrome shows the install warning "Read and change all your data on all websites". The `tabCapture` permission causes this warning (Chrome uses it for every extension that can capture a tab). OwnTape captures only the tab where you click **Start recording**.

## FAQ

**Why `.webm`?** Chrome records WebM (VP9 video, Opus audio) natively. VLC, Chrome, Firefox and most editors play it.

**How do I convert it to `.mp4`?**

```sh
ffmpeg -i meet-abc-defg-hij-2026-11-10-1430.webm -c:v libx264 -crf 23 -c:a aac meet.mp4
```

**How big are the files?** About 1 GB per hour at the default quality (2 Mbit/s video, 128 kbit/s audio, up to 1920×1080 at 30 fps).

**Does it work in Edge or Brave?** It uses only standard Chrome extension APIs, so it probably works in Chromium-based browsers. Only Chrome is tested.

**Why no transcripts?** A transcript needs a speech-to-text service or a large local model. OwnTape stays small and local.

## Limits and known issues

- The file shows exactly what the Meet tab shows. If you share your own screen, the file shows what Meet shows in your tab, not your full screen.
- Only one recording at a time.
- After a crash, the last fraction of a second (an incomplete block) is cut off; the rest is saved.
- "Leave the call" detection and the chat notice depend on the Meet page. When Google changes it, these two features can stop working; the recording itself still works and stops when you close the tab.
- At **Stop and save**, OwnTape reads the file once to add a seek index (Cues) and the exact length; this takes about 1 second for a 1-hour file. If that step fails, the file is saved without the index (it still plays and seeks, a bit slower in some players).

## Development

```
extension/          the extension (load this folder unpacked)
  manifest.json
  src/service-worker.js   state machine, chrome.* APIs, downloads
  src/offscreen.js        capture, audio mix, MediaRecorder
  src/opfs-writer.js      worker: writes chunks to OPFS
  src/webm-duration.js    adds the duration to the WebM header
  src/meet-chat.js        chat notice (all Meet selectors in one place)
  src/meet-content.js     detects "left the call"
  src/popup.*             popup UI (from design/popup)
  src/constants.js        product name, quality settings, file name
design/             UI spec, icons, store assets (from the design work)
tests/              unit tests (Node.js 22+)
scripts/package.mjs builds the store ZIP (no dependencies)
```

```sh
npm test          # unit tests
npm run package   # store ZIP: dist/owntape-<version>.zip (extension/ only)
```

### Testing notes

- **Microphone:** test it only with an extension that you load by hand (`chrome://extensions` → **Load unpacked**). An extension loaded through the DevTools protocol (`Extensions.loadUnpacked`, used by automation) does not get the microphone: `getUserMedia` fails with `NotAllowedError` at once, even when the site settings say "Allow".
- **Tab capture in automation:** `--allowlisted-extension-id=<id>` lets an automated test start a capture without the toolbar click. It does not test the real click path.
- **Many dismissed prompts:** after a microphone prompt was closed several times, Chrome stops asking (automatic blocking). Reset it on the extension's site-settings page (**Reset permissions**), or use a fresh profile.

The product name is in `extension/manifest.json` and `extension/src/constants.js` (and in the `<title>` of the HTML pages).

## Licence

MIT, see [LICENSE](LICENSE).

Google Meet is a trademark of Google LLC. OwnTape is not affiliated with or endorsed by Google.
