// Popup. Shows one of the design states (see design/popup/states.html) and
// sends commands to the service worker. It keeps no recording state itself.

import { MIC_TEXTS, micPermissionState } from './mic-errors.js';
import { renderDiscoverability } from './discover.js';
import { CRASH_ERROR, DEFAULT_VIDEO_QUALITY, NOTICE_DEFAULT_TEXT, NOTICE_MAX_LENGTH, PRODUCT_NAME, STATE, TARGET, meetingCodeFromUrl } from './constants.js';

const $ = (id) => document.getElementById(id);
const MIC_PAGE = 'src/mic-permission.html';

const ICON_MIC_ON = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>';
const ICON_MIC_OFF = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M3 3l18 18"/>';

let activeTab = null;
let status = null; // last answer of getStatus
let localError = null; // an error view that only the popup knows (start failed, mic)
let shownView = null;
let timer = 0;

// ---------- helpers ----------

async function send(type, extra = {}) {
  const res = await chrome.runtime.sendMessage({ target: TARGET.SW, type, ...extra });
  if (!res?.ok) throw new Error(res?.error || 'No answer from the extension');
  return res.data;
}

function formatClock(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
}

function formatMinutes(ms) {
  const min = Math.round(ms / 60000);
  return min < 1 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${min} min`;
}

function formatSize(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.round(bytes / 1e6)} MB`;
}


function openMicPage() {
  return chrome.tabs.create({ url: chrome.runtime.getURL(MIC_PAGE) });
}

// ---------- views ----------

const SR_TEXT = {
  'not-meet': 'Open a Google Meet call to record.',
  ready: 'Ready to record.',
  starting: 'Starting the recording.',
  recording: 'Recording started.',
  saving: 'Saving the recording.',
  saved: 'Recording saved.',
  error: 'Error.',
  settings: 'Settings.',
};

const QUALITY_LABEL = { standard: 'Standard', high: 'High' };
let settingsOpen = false; // the Settings view is open (only when idle)

function show(view) {
  for (const section of document.querySelectorAll('[data-state]')) {
    section.hidden = section.dataset.state !== view;
  }
  if (view !== shownView) {
    $('sr-status').textContent = view === 'error' ? $('error-title').textContent : SR_TEXT[view];
    shownView = view;
  }
}

/**
 * error = { title, text, primary: {label, action}, secondary?: {label, action} }
 */
function showError(error) {
  $('error-title').textContent = error.title;
  $('error-text').textContent = error.text;
  $('error-detail').hidden = !error.detail;
  $('error-detail').textContent = error.detail || '';
  const primary = $('btn-error-primary');
  const secondary = $('btn-error-secondary');
  primary.textContent = error.primary.label;
  primary.onclick = error.primary.action;
  secondary.hidden = !error.secondary;
  if (error.secondary) {
    secondary.textContent = error.secondary.label;
    secondary.onclick = error.secondary.action;
  }
  shownView = null; // announce the new error title
  show('error');
}

const ERRORS = {
  micBlocked: () => ({
    title: MIC_TEXTS.blocked.title,
    text: MIC_TEXTS.blocked.text,
    primary: { label: 'Allow microphone', action: openMicPage },
    secondary: { label: 'Record without my microphone', action: () => start(false) },
  }),
  micNeeded: () => ({
    title: 'Allow your microphone first',
    text: 'To record your voice, allow the microphone one time. Or record only the call audio.',
    primary: { label: 'Allow microphone', action: openMicPage },
    secondary: { label: 'Record without my microphone', action: () => start(false) },
  }),
  tabClosed: (result) => ({
    title: 'Recording stopped',
    text: 'The Meet tab was closed. The part recorded so far is saved in your Downloads folder.',
    primary: { label: 'Show in folder', action: () => chrome.downloads.show(result.downloadId) },
    secondary: { label: 'Record again', action: recordAgain },
  }),
  capture: (message) => ({
    title: 'Cannot record this tab',
    text: 'Another extension or app possibly records this tab now. Stop it, reload the Meet tab, then try again.',
    detail: message,
    primary: { label: 'Try again', action: () => start($('mic-toggle').checked) },
  }),
  crashed: () => ({
    title: 'The recording stopped unexpectedly',
    text: 'The part that was recorded is safe. Save it with the button above.',
    primary: { label: 'OK', action: recordAgain },
  }),
  generic: (message) => ({
    title: 'Something went wrong',
    text: `${PRODUCT_NAME} could not finish this action. Try again. If it happens again, report it on GitHub with the detail below.`,
    detail: message,
    primary: { label: 'OK', action: recordAgain },
  }),
};

function render() {
  const { rec, bytes, lastResult, lastError, recoverable, saveProgress } = status;
  clearInterval(timer);

  // The gear is only for idle states; Settings cannot change a running recording.
  const busy = rec.state !== STATE.IDLE || Boolean(status.saveProgress);
  $('btn-open-settings').hidden = busy;
  if (busy) settingsOpen = false;

  if (settingsOpen) show('settings');
  else if (rec.state === STATE.STARTING) show('starting');
  else if (rec.state === STATE.STOPPING || saveProgress) renderSaving(saveProgress);
  else if (rec.state === STATE.RECORDING) renderRecording(rec, bytes);
  else if (localError) showError(localError);
  else if (lastResult?.kind === 'saved' && lastResult.reason === 'tab-ended') showError(ERRORS.tabClosed(lastResult));
  else if (lastResult?.kind === 'saved') renderSaved(lastResult);
  else if (lastError === CRASH_ERROR && recoverable.length > 0) showError(ERRORS.crashed());
  else if (lastError && lastError !== CRASH_ERROR) showError(ERRORS.generic(lastError));
  else if (meetingCodeFromUrl(activeTab?.url)) renderReady();
  else show('not-meet');

  const showRecovery = rec.state === STATE.IDLE && recoverable.length > 0;
  renderRecovery(rec.state === STATE.IDLE ? recoverable : []);
  // Tips (shortcut, pin) only in idle views, and not with the recovery card
  // (height limit of 600 px).
  const idleView = ['not-meet', 'ready', 'saved', 'error'].includes(shownView);
  $('tips').hidden = !(idleView && !showRecovery);
}

function selectedQuality() {
  return document.querySelector('input[name="quality"]:checked')?.value || DEFAULT_VIDEO_QUALITY;
}

function renderReady() {
  $('quality-summary').textContent = QUALITY_LABEL[selectedQuality()];
  $('target-name').textContent = activeTab.url.replace(/^https:\/\//, '').replace(/[?#].*$/, '');
  show('ready');
}

function renderRecording(rec, bytes) {
  const tick = () => ($('timer').textContent = formatClock(Date.now() - rec.startedAt));
  tick();
  timer = setInterval(tick, 1000);
  $('mic-chip-text').textContent = rec.micActive ? 'Mic on' : 'Mic off';
  $('quality-chip-text').textContent = QUALITY_LABEL[rec.videoQuality || DEFAULT_VIDEO_QUALITY];
  $('video-warning').hidden = !rec.videoSlow;
  const micFailed = Boolean(rec.includeMic && !rec.micActive);
  $('mic-warning').hidden = !micFailed;
  if (micFailed) {
    const kind = rec.micError?.kind || 'unreadable';
    $('mic-warning-title').textContent = `${MIC_TEXTS[kind].title}.`;
    $('mic-warning-detail').textContent = micDiagnosis(rec, false);
    $('mic-warning-detail').hidden = false;
    // A missing device has no fix on the permission page.
    $('btn-mic-fix').hidden = kind === 'no-device';
  }
  $('mic-chip').querySelector('svg').innerHTML = rec.micActive ? ICON_MIC_ON : ICON_MIC_OFF;
  $('size-chip-text').textContent = formatSize(bytes);
  for (const block of document.querySelectorAll('[data-notice]')) {
    block.hidden = !rec.noticeText || block.dataset.notice !== (rec.notice || 'pending');
  }
  const otherTab = activeTab && rec.tabId !== activeTab.id;
  $('btn-stop').title = otherTab ? 'Stops the recording in the other tab' : '';
  show('recording');
}

function renderSaving(progress) {
  // The file is read once to add the seek index. Without a known value the
  // <progress> element shows a moving bar.
  const bar = $('saving-progress');
  if (progress) {
    bar.value = progress.percent;
    $('saving-pct').textContent = `${progress.percent} %`;
  } else {
    bar.removeAttribute('value');
    $('saving-pct').textContent = '';
  }
  show('saving');
}

function renderSaved(result) {
  $('file-name').textContent = result.fileName;
  $('file-meta').textContent = `${formatMinutes(result.durationMs)} · ${formatSize(result.bytes)} · Downloads folder`;
  show('saved');
}

const DELETE_CONFIRM_MS = 4000;

function recoveryLabel(item) {
  const when = new Date(item.startedAt).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  return `${item.meetingCode || 'Tab'} · ${when}`;
}

function renderRecovery(items) {
  $('recovery').hidden = items.length === 0;
  $('t-recovery').textContent =
    items.length === 1 ? 'A recording was not saved' : `${items.length} recordings were not saved`;
  const template = $('recovery-item');
  $('recovery-list').replaceChildren(
    ...items.map((item) => {
      const li = template.content.firstElementChild.cloneNode(true);
      const name = li.querySelector('.mr-recovery__name');
      name.textContent = recoveryLabel(item);
      name.title = item.downloadName;
      const meta = [item.durationMs ? formatMinutes(item.durationMs) : null, item.bytes ? formatSize(item.bytes) : null];
      li.querySelector('.mr-recovery__meta').textContent = [...meta.filter(Boolean), 'kept on this computer'].join(' · ');
      li.querySelector('.mr-recovery__save').addEventListener('click', () => run(() => send('recover', { opfsName: item.opfsName })));
      const del = li.querySelector('.mr-recovery__delete');
      let confirmTimer = 0;
      del.addEventListener('click', () => {
        if (!del.classList.contains('is-confirming')) {
          del.classList.add('is-confirming');
          del.textContent = 'Delete for good?';
          confirmTimer = setTimeout(() => {
            del.classList.remove('is-confirming');
            del.textContent = 'Delete';
          }, DELETE_CONFIRM_MS);
          return;
        }
        clearTimeout(confirmTimer);
        run(() => send('discard', { opfsName: item.opfsName })).then(() => {
          // After the refresh, so the view change does not overwrite it.
          $('sr-status').textContent = 'The unsaved recording was deleted.';
        });
      });
      return li;
    }),
  );
}

// ---------- actions ----------

async function refresh() {
  status = await send('getStatus');
  render();
}

async function run(action) {
  try {
    await action();
  } catch (err) {
    localError = ERRORS.generic(err.message);
  }
  await refresh();
}

async function start(includeMic) {
  localError = null;
  if (includeMic) {
    const perm = await micPermissionState();
    if (perm !== 'granted') {
      localError = perm === 'denied' ? ERRORS.micBlocked() : ERRORS.micNeeded();
      return render();
    }
  }
  show('starting');
  try {
    const notice = { enabled: $('notice-toggle').checked, text: noticeText() };
    await send('start', { tabId: activeTab.id, includeMic, notice });
  } catch (err) {
    localError = ERRORS.capture(err.message);
  }
  await refresh();
}

async function recordAgain() {
  localError = null;
  await send('clearResult');
  await refresh();
}

/** Short line for the warning, or the full text for "Copy details". */
function micDiagnosis(rec, full) {
  const e = rec.micError;
  const line = e ? `${e.detail || 'unknown error'} · permission: ${e.state || 'unknown'}` : 'no error details';
  if (!full) return line;
  return [
    `${PRODUCT_NAME} ${chrome.runtime.getManifest().version} microphone problem`,
    `kind: ${e?.kind || 'unknown'}`,
    `permission state (recorder): ${e?.state || 'unknown'}`,
    ...(e?.attempts || []).map((a) => `attempt ${a}`),
    `video quality: ${rec.videoQuality || DEFAULT_VIDEO_QUALITY}`,
    `capture size: ${rec.video ? `${rec.video.width}x${rec.video.height}` : 'unknown'}` +
      ` (tab ${rec.video?.tabPixels ? `${rec.video.tabPixels.width}x${rec.video.tabPixels.height}` : 'unknown'})`,
    `frames per second (last check): ${status.lastFps ?? rec.fps ?? 'unknown'}`,
    `browser: ${navigator.userAgent}`,
  ].join('\n');
}

async function copyMicDetails() {
  const button = $('btn-mic-copy');
  try {
    status.lastFps = (await chrome.storage.session.get('lastFps')).lastFps;
    await navigator.clipboard.writeText(micDiagnosis(status.rec, true));
    button.textContent = 'Copied';
    setTimeout(() => (button.textContent = 'Copy details'), 2000);
  } catch {
    button.textContent = 'Copy failed';
  }
}

function noticeText() {
  return $('notice-text').value.trim().slice(0, NOTICE_MAX_LENGTH) || NOTICE_DEFAULT_TEXT;
}

async function saveSettings(patch) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: { ...settings, ...patch } });
}

async function copyNotice() {
  const button = $('btn-notice-copy');
  try {
    await navigator.clipboard.writeText(status.rec.noticeText || noticeText());
    button.textContent = 'Copied';
    setTimeout(() => (button.textContent = 'Copy the text'), 2000);
  } catch {
    button.textContent = 'Copy failed';
  }
}

// ---------- init ----------

async function init() {
  for (const el of document.querySelectorAll('.js-app-name')) el.textContent = PRODUCT_NAME;
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const toggle = $('mic-toggle');
  const noticeToggle = $('notice-toggle');
  const noticeField = $('notice-text');
  const { settings = {} } = await chrome.storage.local.get('settings');
  toggle.checked = settings.includeMic ?? true;
  noticeToggle.checked = settings.noticeEnabled ?? true;
  noticeField.maxLength = NOTICE_MAX_LENGTH;
  noticeField.value = settings.noticeText || NOTICE_DEFAULT_TEXT;
  toggle.addEventListener('change', () => saveSettings({ includeMic: toggle.checked }));
  noticeToggle.addEventListener('change', () => saveSettings({ noticeEnabled: noticeToggle.checked }));
  const announceSaved = () => ($('sr-status').textContent = 'Saved');
  noticeField.addEventListener('input', () => saveSettings({ noticeText: noticeField.value }));
  noticeField.addEventListener('change', announceSaved);
  $('btn-notice-reset').addEventListener('click', async () => {
    noticeField.value = NOTICE_DEFAULT_TEXT;
    await saveSettings({ noticeText: NOTICE_DEFAULT_TEXT });
    announceSaved();
  });

  // Video quality (read by the service worker at Start).
  const quality = settings.videoQuality in QUALITY_LABEL ? settings.videoQuality : DEFAULT_VIDEO_QUALITY;
  const radio = document.querySelector(`input[name="quality"][value="${quality}"]`);
  if (radio) radio.checked = true;
  for (const input of document.querySelectorAll('input[name="quality"]')) {
    input.addEventListener('change', async () => {
      await saveSettings({ videoQuality: input.value });
      announceSaved();
    });
  }
  const openSettings = () => {
    settingsOpen = true;
    render();
  };
  $('btn-open-settings').addEventListener('click', openSettings);
  $('btn-change-settings').addEventListener('click', openSettings);
  $('btn-settings-back').addEventListener('click', () => {
    settingsOpen = false;
    render();
  });
  const repost = () => run(() => send('postNotice'));
  $('btn-notice-repost').addEventListener('click', repost);
  $('btn-notice-retry').addEventListener('click', repost);
  $('btn-notice-copy').addEventListener('click', copyNotice);
  $('btn-mic-copy').addEventListener('click', copyMicDetails);
  $('btn-mic-fix').addEventListener('click', () => {
    // A new tab: the recording continues. The page says to do the reload after the call.
    const e = status.rec.micError || {};
    const query = new URLSearchParams({ kind: e.kind || 'unreadable', detail: e.detail || '' });
    chrome.tabs.create({ url: chrome.runtime.getURL(`${MIC_PAGE}?${query}`) });
  });

  $('btn-start').addEventListener('click', () => start(toggle.checked));
  $('btn-stop').addEventListener('click', () => run(() => send('stop')));
  $('btn-show-folder').addEventListener('click', () => chrome.downloads.show(status.lastResult.downloadId));
  $('btn-record-again').addEventListener('click', recordAgain);

  renderDiscoverability().catch(() => {});
  chrome.storage.onChanged.addListener(() => refresh().catch(() => {}));
  await refresh();
}

init().catch((err) => {
  localError = ERRORS.generic(err.message);
  showError(localError);
});
