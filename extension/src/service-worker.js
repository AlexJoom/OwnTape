// Service worker: owns the state machine and all chrome.* API calls.
// No state lives in globals. The worker can stop at any time; everything it
// needs is in chrome.storage.session (live state) or chrome.storage.local
// (crash-recovery records).

import {
  CRASH_ERROR,
  ICONS_IDLE,
  ICONS_RECORDING,
  PRODUCT_NAME,
  STATE,
  TARGET,
  buildDownloadName,
  meetingCodeFromUrl,
} from './constants.js';
import { postChatNotice } from './meet-chat.js';

const OFFSCREEN_URL = 'src/offscreen.html';
const STARTING_TIMEOUT_MS = 30_000;

// chrome.storage.session  { rec: RecState }
//   RecState = { state, tabId, meetingCode, opfsName, downloadName, startedAt, includeMic,
//                micActive, micError: {kind, detail}|null, mimeType, noticeText, notice, noticeStep, changedAt }
// chrome.storage.session  { downloads: { [downloadId]: opfsName } }
// chrome.storage.local    { pending: { [opfsName]: PendingRecord } }
//   PendingRecord = { opfsName, downloadName, meetingCode, startedAt, durationMs, bytes, status }
//   status: 'recording' | 'saving' | 'saved-failed' | 'interrupted'
// chrome.storage.session  { lastResult: { kind: 'saved', downloadId, fileName,
//                           durationMs, bytes, reason } | null }
// chrome.storage.local    { settings: { includeMic } }
// chrome.storage.session  { lastError: string|null }
// chrome.storage.session  { saveProgress: { opfsName, percent } } while a file is finalised

const IDLE_STATE = Object.freeze({ state: STATE.IDLE });

// ---------- Storage helpers ----------

async function getRec() {
  const { rec } = await chrome.storage.session.get('rec');
  return rec || IDLE_STATE;
}

async function setRec(rec) {
  await chrome.storage.session.set({ rec: { ...rec, changedAt: Date.now() } });
  await updateIcon(rec.state);
}

async function getPending() {
  const { pending = {} } = await chrome.storage.local.get('pending');
  return pending;
}

async function updatePending(opfsName, patch) {
  const pending = await getPending();
  if (patch === null) delete pending[opfsName];
  else pending[opfsName] = { ...pending[opfsName], opfsName, ...patch };
  await chrome.storage.local.set({ pending });
}

async function setLastError(message) {
  await chrome.storage.session.set({ lastError: message || null });
}

// The toolbar icon shows the state (red icon while recording; no badge).
async function updateIcon(state) {
  const active = state !== STATE.IDLE;
  await chrome.action.setIcon({ path: active ? ICONS_RECORDING : ICONS_IDLE });
  await chrome.action.setTitle({ title: active ? `${PRODUCT_NAME} — recording` : PRODUCT_NAME });
}

/** What the popup shows after a recording ends: saved file or an error. */
async function setLastResult(result) {
  await chrome.storage.session.set({ lastResult: result || null });
}

// ---------- Offscreen document ----------

async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  return contexts.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['USER_MEDIA'],
      justification: 'Record the captured tab and microphone with MediaRecorder.',
    });
  } catch (err) {
    // A parallel call can create it first; that is fine.
    if (!String(err?.message).includes('single offscreen')) throw err;
  }
}

async function closeOffscreenIfUnused() {
  const rec = await getRec();
  if (rec.state !== STATE.IDLE) return;
  const { downloads = {} } = await chrome.storage.session.get('downloads');
  if (Object.keys(downloads).length > 0) return;
  if (await hasOffscreen()) await chrome.offscreen.closeDocument().catch(() => {});
}

async function sendToOffscreen(message) {
  const res = await chrome.runtime.sendMessage({ target: TARGET.OFFSCREEN, ...message });
  if (!res?.ok) throw new Error(res?.error || 'No answer from the recorder');
  return res;
}

// ---------- Commands ----------

async function startRecording({ tabId, includeMic, notice }) {
  const rec = await getRec();
  if (rec.state !== STATE.IDLE) throw new Error(`Cannot start while ${rec.state}`);

  const tab = await chrome.tabs.get(tabId);
  const startedAt = Date.now();
  const opfsName = `rec-${startedAt}.webm`;
  const meetingCode = meetingCodeFromUrl(tab.url);
  const downloadName = buildDownloadName(meetingCode, new Date(startedAt));
  const noticeText = notice?.enabled && meetingCode ? String(notice.text || '').slice(0, 500) : null;
  const base = { tabId, meetingCode, opfsName, downloadName, startedAt, includeMic, noticeText };

  await setRec({ state: STATE.STARTING, ...base });
  await setLastError(null);
  await setLastResult(null);
  try {
    // The popup was opened by the user on this tab, which grants the capture.
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    await ensureOffscreen();
    await updatePending(opfsName, { downloadName, meetingCode, startedAt, durationMs: 0, bytes: 0, status: 'recording' });
    const res = await sendToOffscreen({ type: 'start', streamId, includeMic, opfsName });
    await setRec({ state: STATE.RECORDING, ...base, micActive: res.micActive, micError: res.micError || null, micAttempt: res.micAttempt || null, mimeType: res.mimeType });
  } catch (err) {
    await updatePending(opfsName, null);
    await setRec(IDLE_STATE);
    await closeOffscreenIfUnused();
    throw err;
  }
  // Consent aid: only after the capture runs, and only when the user turned it on.
  if (noticeText) await postNotice();
}

/**
 * Posts the notice in the Meet chat of the recorded tab. Triggered only by
 * the user's Start click or "Post the notice again". The result in rec.notice
 * is 'pending' | 'posted' | 'failed'; 'posted' means the script saw the
 * message in the chat.
 */
async function postNotice() {
  const rec = await getRec();
  if (rec.state !== STATE.RECORDING || !rec.noticeText) throw new Error('No notice to post');
  await setRec({ ...rec, notice: 'pending', noticeStep: null });
  let result;
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: rec.tabId },
      func: postChatNotice,
      args: [rec.noticeText],
    });
    result = injection?.result || { ok: false, step: 'no-result' };
  } catch (err) {
    console.warn('Notice injection failed:', err);
    result = { ok: false, step: 'injection-failed' };
  }
  const latest = await getRec();
  if (latest.opfsName !== rec.opfsName || latest.state !== STATE.RECORDING) return;
  await setRec({ ...latest, notice: result.ok ? 'posted' : 'failed', noticeStep: String(result.step) });
}

async function stopRecording() {
  const rec = await getRec();
  if (rec.state !== STATE.RECORDING) return;
  await setRec({ ...rec, state: STATE.STOPPING });
  try {
    await sendToOffscreen({ type: 'stop' });
  } catch (err) {
    // The recorder is gone. Keep the file for recovery.
    await markInterrupted(rec.opfsName);
    await setRec(IDLE_STATE);
    throw err;
  }
  // The offscreen document answers later with a "finished" message.
}

async function markInterrupted(opfsName) {
  const pending = await getPending();
  if (pending[opfsName]) await updatePending(opfsName, { status: 'interrupted' });
}

async function recoverRecording(opfsName) {
  const pending = await getPending();
  const item = pending[opfsName];
  if (!item) throw new Error('Recording not found');
  const rec = await getRec();
  if (rec.opfsName === opfsName && rec.state !== STATE.IDLE) throw new Error('This recording is still active');
  await ensureOffscreen();
  await updatePending(opfsName, { status: 'saving' });
  await sendToOffscreen({ type: 'recover', opfsName, durationMs: item.durationMs });
}

async function discardRecording(opfsName) {
  const rec = await getRec();
  if (rec.opfsName === opfsName && rec.state !== STATE.IDLE) throw new Error('This recording is still active');
  await ensureOffscreen();
  await sendToOffscreen({ type: 'release', opfsName, deleteFile: true });
  await updatePending(opfsName, null);
  await closeOffscreenIfUnused();
}

/**
 * Makes the stored state agree with reality. Called on every status request
 * and on startup: the offscreen document can crash, or the browser can restart.
 */
async function reconcile() {
  const rec = await getRec();
  if (rec.state === STATE.IDLE) {
    await updateIcon(STATE.IDLE);
  } else {
    // While starting, the offscreen document may not exist yet; only a timeout counts.
    const dead =
      rec.state === STATE.STARTING
        ? Date.now() - (rec.changedAt || 0) > STARTING_TIMEOUT_MS
        : !(await hasOffscreen());
    if (dead) {
      await markInterrupted(rec.opfsName);
      await setRec(IDLE_STATE);
      await setLastError(CRASH_ERROR);
    }
  }
  const { saveProgress } = await chrome.storage.session.get('saveProgress');
  if (saveProgress && !(await hasOffscreen())) await chrome.storage.session.remove('saveProgress');

  // Records left in "recording"/"saving" state with no live session are from a crash.
  const now = await getRec();
  const pending = await getPending();
  const { downloads = {} } = await chrome.storage.session.get('downloads');
  const downloading = new Set(Object.values(downloads).map((d) => d.opfsName));
  for (const item of Object.values(pending)) {
    const live = item.opfsName === now.opfsName && now.state !== STATE.IDLE;
    if (!live && !downloading.has(item.opfsName) && (item.status === 'recording' || item.status === 'saving')) {
      await updatePending(item.opfsName, { status: 'interrupted' });
    }
  }
}

async function getStatus() {
  await reconcile();
  const rec = await getRec();
  const pending = await getPending();
  const { lastError = null, lastResult = null, saveProgress = null } = await chrome.storage.session.get([
    'lastError',
    'lastResult',
    'saveProgress',
  ]);
  const recoverable = Object.values(pending).filter((p) => p.status === 'interrupted' || p.status === 'saved-failed');
  const live = rec.opfsName ? pending[rec.opfsName] : null;
  return { rec, bytes: live?.bytes || 0, recoverable, lastError, lastResult, saveProgress };
}

// ---------- Messages from the offscreen document ----------

async function onFinished({ opfsName, url, durationMs, reason }) {
  await chrome.storage.session.remove('saveProgress');
  const pending = await getPending();
  const item = pending[opfsName];
  const downloadName = item?.downloadName || buildDownloadName(null);
  await updatePending(opfsName, { status: 'saving', durationMs });

  const rec = await getRec();
  if (rec.opfsName === opfsName) await setRec(IDLE_STATE);
  await setLastError(reason === 'write-error' ? 'Could not write to disk. The recording stopped early.' : null);

  try {
    const downloadId = await chrome.downloads.download({ url, filename: downloadName, saveAs: false });
    const { downloads = {} } = await chrome.storage.session.get('downloads');
    downloads[downloadId] = { opfsName, durationMs, reason };
    await chrome.storage.session.set({ downloads });
  } catch (err) {
    await updatePending(opfsName, { status: 'saved-failed' });
    await setLastError(`Download failed: ${err.message}`);
  }
}

async function onFailed({ opfsName, error }) {
  await chrome.storage.session.remove('saveProgress');
  const rec = await getRec();
  if (rec.opfsName === opfsName) await setRec(IDLE_STATE);
  await updatePending(opfsName, { status: 'saved-failed' });
  await setLastError(`Could not save the recording: ${error}`);
}

async function onProgress({ opfsName, bytes, durationMs }) {
  const pending = await getPending();
  if (pending[opfsName]) await updatePending(opfsName, { bytes, durationMs });
}

// ---------- Listeners (registered at top level) ----------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== TARGET.SW) return false;
  const handlers = {
    // From the popup
    getStatus: () => getStatus(),
    start: () => startRecording(msg),
    stop: () => stopRecording(),
    postNotice: () => postNotice(),
    recover: () => recoverRecording(msg.opfsName),
    discard: () => discardRecording(msg.opfsName),
    clearError: () => setLastError(null),
    clearResult: async () => {
      await setLastResult(null);
      await setLastError(null);
    },
    // From the offscreen document
    finished: () => onFinished(msg),
    failed: () => onFailed(msg),
    progress: () => onProgress(msg),
    saveProgress: () => chrome.storage.session.set({ saveProgress: { opfsName: msg.opfsName, percent: msg.percent } }),
    // From the Meet content script
    meetCallEnded: async () => {
      const rec = await getRec();
      if (rec.state === STATE.RECORDING && rec.tabId === _sender.tab?.id) await stopRecording();
    },
  };
  const handler = handlers[msg.type];
  if (!handler) return false;
  (async () => {
    try {
      sendResponse({ ok: true, data: await handler() });
    } catch (err) {
      console.error(`[${msg.type}]`, err);
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();
  return true;
});

chrome.downloads.onChanged.addListener(async (delta) => {
  if (!delta.state) return;
  const { downloads = {} } = await chrome.storage.session.get('downloads');
  const entry = downloads[delta.id];
  if (!entry) return;
  const state = delta.state.current;
  if (state !== 'complete' && state !== 'interrupted') return;

  const { opfsName, durationMs, reason } = entry;
  delete downloads[delta.id];
  await chrome.storage.session.set({ downloads });
  if (state === 'complete') {
    const [item] = await chrome.downloads.search({ id: delta.id });
    const fileName = (item?.filename || '').split(/[\\/]/).pop();
    await sendToOffscreen({ type: 'release', opfsName, deleteFile: true }).catch(() => {});
    await updatePending(opfsName, null);
    await setLastResult({ kind: 'saved', downloadId: delta.id, fileName, durationMs, bytes: item?.fileSize || 0, reason });
  } else {
    await sendToOffscreen({ type: 'release', opfsName, deleteFile: false }).catch(() => {});
    await updatePending(opfsName, { status: 'saved-failed' });
    await setLastError('The download was interrupted. You can try to save the recording again.');
  }
  await closeOffscreenIfUnused();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const rec = await getRec();
  if (rec.state === STATE.RECORDING && rec.tabId === tabId) await stopRecording().catch(() => {});
});

// A full page load in the recorded tab that leaves the meeting ends the call.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return;
  const rec = await getRec();
  if (rec.state !== STATE.RECORDING || rec.tabId !== tabId) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (rec.meetingCode && meetingCodeFromUrl(tab?.url) !== rec.meetingCode) await stopRecording().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => reconcile());
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await reconcile();
  if (reason === 'install') await chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome.html') });
});
