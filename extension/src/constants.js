// Single place for product-level settings. The product name also appears in
// manifest.json ("name", "short_name", "action.default_title") and in the
// <title> of the HTML pages; keep them in sync.
export const PRODUCT_NAME = 'OwnTape';
export const REPO_URL = 'https://github.com/AlexJoom/OwnTape';

// Consent aid: default chat notice. The user can edit it (max 500 characters).
export const NOTICE_DEFAULT_TEXT = `I am recording this call with ${PRODUCT_NAME}. Tell me if you do not agree.`;
export const NOTICE_MAX_LENGTH = 500;

// lastError text when a recording ended without a save (crash, browser closed).
// The popup shows the "stopped unexpectedly" view (7e) for it.
export const CRASH_ERROR = 'The recording stopped unexpectedly. You can save the partial file.';

// Recording quality. 2 Mbit/s video + 128 kbit/s audio is about 1 GB per hour.
export const AUDIO_BITS_PER_SECOND = 128_000;

// Video quality presets (setting "videoQuality" in chrome.storage.local, read
// at Start). Numbers are provisional until measured; see README.
export const VIDEO_QUALITY = Object.freeze({
  standard: { maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30, videoBitsPerSecond: 2_000_000 },
  high: { maxWidth: 2560, maxHeight: 1440, maxFrameRate: 30, videoBitsPerSecond: 6_000_000 },
  small: { maxWidth: 1280, maxHeight: 720, maxFrameRate: 30, videoBitsPerSecond: 1_000_000 },
});
export const DEFAULT_VIDEO_QUALITY = 'standard';
// MediaStreamTrack.contentHint for the tab video ('' = browser default).
export const VIDEO_CONTENT_HINT = 'detail';

export function videoQuality(name) {
  return VIDEO_QUALITY[name] || VIDEO_QUALITY[DEFAULT_VIDEO_QUALITY];
}

/**
 * Capture size: the tab's real pixel size, made smaller (same aspect ratio)
 * to fit the preset, never larger. Tab capture scales the tab into exactly
 * the size that we ask for, so asking for more than the tab has only
 * upscales. Without the tab size, the preset maximum is used.
 * @param {{width:number,height:number}|null} tabPixels
 */
export function captureSize(quality, tabPixels) {
  const even = (n) => Math.max(2, Math.floor(n / 2) * 2);
  if (!tabPixels?.width || !tabPixels?.height) return { width: quality.maxWidth, height: quality.maxHeight };
  const scale = Math.min(1, quality.maxWidth / tabPixels.width, quality.maxHeight / tabPixels.height);
  return { width: even(tabPixels.width * scale), height: even(tabPixels.height * scale) };
}

// MediaRecorder emits a chunk this often; each chunk goes to disk at once.
export const TIMESLICE_MS = 2000;
// The offscreen document reports progress this often (persisted for crash recovery).
export const PROGRESS_INTERVAL_MS = 3000;
// At "Stop and save", the file is read once to add a seek index. After this
// time the index is skipped and the file is saved with the duration only.
export const INDEX_TIMEOUT_MS = 120_000;

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

const MEET_CODE_RE = /^https:\/\/meet\.google\.com\/(?:meet\/)?([a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4})(?:[/?#]|$)/;

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
