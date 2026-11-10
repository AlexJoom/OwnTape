// Single place for product-level settings. The product name also appears in
// manifest.json ("name", "short_name", "action.default_title") and in the
// <title> of the HTML pages; keep them in sync.
export const PRODUCT_NAME = 'OwnTape';
export const REPO_URL = 'https://github.com/AlexJoom/OwnTape';

// Recording quality. 2 Mbit/s video + 128 kbit/s audio is about 1 GB per hour.
export const VIDEO_BITS_PER_SECOND = 2_000_000;
export const AUDIO_BITS_PER_SECOND = 128_000;
export const MAX_WIDTH = 1920;
export const MAX_HEIGHT = 1080;
export const MAX_FRAME_RATE = 30;

// MediaRecorder emits a chunk this often; each chunk goes to disk at once.
export const TIMESLICE_MS = 2000;
// The offscreen document reports progress this often (persisted for crash recovery).
export const PROGRESS_INTERVAL_MS = 3000;

// Preferred container/codec order. The first one that the browser supports wins.
export const MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export const ICONS_IDLE = { 16: '/icons/icon-16.png', 32: '/icons/icon-32.png' };
export const ICONS_RECORDING = { 16: '/icons/icon-recording-16.png', 32: '/icons/icon-recording-32.png' };

// Recording states. Stored in chrome.storage.session under the key "rec".
export const STATE = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  RECORDING: 'recording',
  STOPPING: 'stopping',
});

// Message targets.
export const TARGET = Object.freeze({ SW: 'sw', OFFSCREEN: 'offscreen' });

const MEET_CODE_RE = /^https:\/\/meet\.google\.com\/([a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4})(?:[/?#]|$)/;

/** Returns the Meet code (e.g. "abc-defg-hij") or null. */
export function meetingCodeFromUrl(url) {
  const m = MEET_CODE_RE.exec(url || '');
  return m ? m[1] : null;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** meet-<code>-YYYY-MM-DD-HHmm.webm (local time). */
export function buildDownloadName(meetingCode, date = new Date()) {
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `meet-${meetingCode || 'tab'}-${stamp}.webm`;
}
