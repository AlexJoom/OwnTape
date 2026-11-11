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
// at Start). The capture is never larger than the tab (see captureSize).
// Note: MediaStreamTrack.contentHint ('detail'/'text') was measured and has no
// effect on MediaRecorder output, so it is not used.
export const VIDEO_QUALITY = Object.freeze({
  // Measured (5 min, HiDPI 1.5 window): 0.45 GB/h still code, 1.07 GB/h motion.
  standard: { maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30, videoBitsPerSecond: 2_000_000 },
  // Measured: 0.52 GB/h still code, 1.95 GB/h motion. Sharper text only when the
  // tab has more than 1920x1080 real pixels (HiDPI or large window).
  high: { maxWidth: 2560, maxHeight: 1440, maxFrameRate: 30, videoBitsPerSecond: 4_000_000 },
  // A 720p option was measured and dropped: code text was hard to read
  // (ilI1, O0o) and it saved only 0.1-0.5 GB per hour.
});
export const DEFAULT_VIDEO_QUALITY = 'standard';

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
// Frame-rate self-check: warn when fewer frames than this arrive for SLOW_VIDEO_MS.
export const SLOW_VIDEO_FPS = 10;
export const SLOW_VIDEO_MS = 30_000;
// At "Stop and save", the file is read once to add a seek index. After this
// time the index is skipped and the file is saved with the duration only.
export const INDEX_TIMEOUT_MS = 120_000;

// Preferred container/codec order. The first one that the browser supports wins.
export const MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

// Toolbar states (design/icon/toolbar-states.png): a pale ring on other tabs,
// the full indigo tile on a Meet call tab (READY_LOOK), red while recording.
export const ICONS_IDLE = { 16: '/icons/icon-idle-16.png', 32: '/icons/icon-idle-32.png' };
// Toolbar look on a Meet call tab: OwnTape is ready to record it.
export const READY_LOOK = Object.freeze({
  title: `${PRODUCT_NAME} – click to record this call`,
  badgeText: '',
  badgeColor: null,
  icons: { 16: '/icons/icon-ready-16.png', 32: '/icons/icon-ready-32.png' },
});

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

/**
 * Toolbar look (title, badge, icon) for one tab. The recording look always
 * wins; a Meet call tab gets the ready look; any other tab the normal look.
 * @param {string} recState  STATE value
 * @param {string|undefined} url  the tab's URL (undefined for non-Meet tabs)
 */
export function actionLookFor(recState, url) {
  if (recState !== STATE.IDLE) {
    return { title: `${PRODUCT_NAME} — recording`, badgeText: '', badgeColor: null, icons: ICONS_RECORDING };
  }
  if (meetingCodeFromUrl(url)) {
    return { title: READY_LOOK.title, badgeText: READY_LOOK.badgeText, badgeColor: READY_LOOK.badgeColor, icons: READY_LOOK.icons || ICONS_IDLE };
  }
  return { title: PRODUCT_NAME, badgeText: '', badgeColor: null, icons: ICONS_IDLE };
}
