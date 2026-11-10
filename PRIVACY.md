# OwnTape privacy policy

Last updated: 2026-11-10

OwnTape does not collect, sell or transmit any personal data. It has no server, no user accounts, no analytics and no third-party code. The extension makes no network requests.

## Recordings

- OwnTape records the Google Meet™ tab that you choose (its picture and sound) and, if you turn it on, your microphone.
- While you record, the recording is written to the extension's private storage in your browser (the Origin Private File System). This protects the recording if the browser closes during the call.
- When the recording stops, OwnTape saves it as a `.webm` file in your Downloads folder and then deletes the temporary copy.
- If a recording stopped before it was saved (for example, the browser crashed), the temporary copy stays in the browser until you click **Save file** or **Delete** in the OwnTape popup. Uninstalling the extension also deletes it.
- The file name contains the meeting code and the date and time, for example `meet-abc-defg-hij-2026-11-10-1430.webm`.

## Chat notice (consent aid)

If the chat notice is on, OwnTape writes your notice text into the Google Meet chat of the call that you record, when you click **Start recording** or **Post the notice again**. Google Meet then sends it to the participants like any chat message that you type.

To check that the notice really appeared, OwnTape compares the text of the chat panel with your notice text and counts the exact matches. It does not copy, keep, store or send any chat message, participant name or other content of the call. The only result that it keeps is "posted" or "not posted".

## What OwnTape reads in the Meet page

- **Chat notice:** only the check described above, and only when you start a recording or ask to post the notice again.
- **End of the call:** while a Meet page is open, a small script checks every 2 seconds whether the "Leave call" button is present. When the button disappears during a recording, OwnTape stops and saves the recording. The script reads nothing else and does not change the page.
- **Meeting code:** OwnTape reads the address of the Meet tab to find the meeting code for the file name.

## Settings

Your settings ("Include my microphone", "Post a notice in the call chat", and your notice text) are saved in the extension's local storage in your browser (`chrome.storage.local`). They never leave your computer.

## Permissions

| Permission | Why OwnTape needs it |
|---|---|
| `tabCapture` | Records the picture and sound of the Meet tab after you click **Start recording**. |
| `offscreen` | Runs the recorder in a hidden extension page, so the recording continues when you close the popup. |
| `downloads` | Saves the finished recording to your Downloads folder. |
| `storage` | Keeps your settings and the recording state in your browser. |
| `activeTab` | Gives access to the tab where you opened the popup. |
| `scripting` | Writes your chat notice into the recorded Meet tab. |
| Host access to `https://meet.google.com/*` | Reads the meeting code, runs the "end of the call" check, and lets the chat notice reach the Meet tab. No other website is accessed. |

## Microphone

OwnTape uses your microphone only while you record, and only if **Include my microphone** is on. The sound goes only into the video file on your computer.

## Source code

OwnTape is free and open source under the MIT licence: https://github.com/AlexJoom/OwnTape. You can read the code and check this policy yourself, for example in the Network tab of Chrome DevTools.

## Contact

Open an issue: https://github.com/AlexJoom/OwnTape/issues

Google Meet is a trademark of Google LLC. OwnTape is not affiliated with or endorsed by Google.
