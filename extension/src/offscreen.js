// Offscreen document: captures the tab, mixes the microphone, records with
// MediaRecorder and streams chunks to OPFS. Only chrome.runtime messaging is
// available here; the service worker does all other chrome.* work.
//
// Globals are acceptable here: this document lives for the whole recording.

import {
  AUDIO_BITS_PER_SECOND,
  MIME_TYPES,
  PROGRESS_INTERVAL_MS,
  TARGET,
  INDEX_TIMEOUT_MS,
  TIMESLICE_MS,
  captureSize,
  videoQuality,
} from './constants.js';
import { fixWebmDuration } from './webm-duration.js';
import { addWebmIndex } from './webm-cues.js';
import { classifyMicError, micErrorDetail, micPermissionState } from './mic-errors.js';

let session = null; // the active recording, see startRecording()
const blobUrls = new Map(); // opfsName -> object URL waiting for download

// ---------- OPFS writer (worker) ----------

function createWriter() {
  const worker = new Worker('opfs-writer.js');
  let nextId = 1;
  const pending = new Map();
  worker.onmessage = ({ data }) => {
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    if (data.ok) p.resolve(data);
    else p.reject(new Error(data.error));
  };
  const call = (msg, transfer) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...msg, id }, transfer || []);
    });
  return {
    open: (name) => call({ op: 'open', name }),
    write: (buffer) => call({ op: 'write', buffer }, [buffer]),
    close: async () => {
      try {
        await call({ op: 'close' });
      } finally {
        worker.terminate();
      }
    },
  };
}

// ---------- Recording ----------

function pickMimeType() {
  return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

async function getTabStream(streamId, quality, size) {
  return navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
        maxWidth: size.width,
        maxHeight: size.height,
        maxFrameRate: quality.maxFrameRate,
      },
    },
  });
}

// Two attempts: with voice processing first, then plain { audio: true }
// (the processing constraints can fail on some devices).
const MIC_ATTEMPTS = [
  { name: 'processed', constraints: { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } } },
  { name: 'plain', constraints: { audio: true } },
];

/**
 * @returns {Promise<{stream: MediaStream|null, attempt: string|null,
 *   error: {kind, detail, state, attempts: string[]}|null}>}
 */
async function getMicStream() {
  const failures = [];
  let lastErr = null;
  for (const attempt of MIC_ATTEMPTS) {
    const t0 = performance.now();
    try {
      const stream = await navigator.mediaDevices.getUserMedia(attempt.constraints);
      return { stream, attempt: attempt.name, error: null };
    } catch (err) {
      lastErr = err;
      failures.push(`${attempt.name}: ${micErrorDetail(err)} (${Math.round(performance.now() - t0)} ms)`);
      console.warn(`Microphone attempt "${attempt.name}" failed:`, err);
    }
  }
  const state = await micPermissionState();
  return {
    stream: null,
    attempt: null,
    error: { kind: classifyMicError(lastErr, state), detail: micErrorDetail(lastErr), state, attempts: failures },
  };
}

function sendToSw(message) {
  return chrome.runtime.sendMessage({ target: TARGET.SW, ...message }).catch(() => {});
}

async function startRecording({ streamId, includeMic, opfsName, quality: qualityName, tabPixels }) {
  if (session) throw new Error('A recording is already active');

  const quality = videoQuality(qualityName);
  const size = captureSize(quality, tabPixels);
  const tabStream = await getTabStream(streamId, quality, size);
  let micStream = null;
  let micError = null;
  let audioCtx = null;
  try {
    let micAttempt = null;
    if (includeMic) ({ stream: micStream, attempt: micAttempt, error: micError } = await getMicStream());
    audioCtx = new AudioContext();
    const session = await beginSession({ tabStream, micStream, audioCtx, opfsName, quality });
    const settings = tabStream.getVideoTracks()[0]?.getSettings() || {};
    return { ...session, micError, micAttempt, video: { width: settings.width, height: settings.height, frameRate: settings.frameRate, tabPixels: tabPixels || null } };
  } catch (err) {
    // Release the capture, or the next start fails with "active stream".
    for (const stream of [tabStream, micStream]) stream?.getTracks().forEach((t) => t.stop());
    audioCtx?.close().catch(() => {});
    throw err;
  }
}

async function beginSession({ tabStream, micStream, audioCtx, opfsName, quality }) {

  // Tab capture mutes the tab for the user. Route the tab audio back to the
  // speakers, and mix tab + microphone into one track for the recording.
  await audioCtx.resume();
  const mixed = audioCtx.createMediaStreamDestination();
  const tabSource = audioCtx.createMediaStreamSource(tabStream);
  tabSource.connect(audioCtx.destination);
  tabSource.connect(mixed);
  if (micStream) audioCtx.createMediaStreamSource(micStream).connect(mixed);

  const recordStream = new MediaStream([
    ...tabStream.getVideoTracks(),
    ...mixed.stream.getAudioTracks(),
  ]);

  const writer = createWriter();
  await writer.open(opfsName);

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(recordStream, {
    mimeType,
    videoBitsPerSecond: quality.videoBitsPerSecond,
    audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
  });

  const s = {
    opfsName,
    recorder,
    writer,
    audioCtx,
    streams: [tabStream, micStream].filter(Boolean),
    writeQueue: Promise.resolve(),
    bytes: 0,
    writeError: null,
    startedAt: 0,
    progressTimer: 0,
    finishing: null,
  };

  recorder.ondataavailable = (e) => {
    if (!e.data || e.data.size === 0) return;
    const blob = e.data;
    // Keep chunk order: each write waits for the previous one.
    s.writeQueue = s.writeQueue.then(async () => {
      try {
        const res = await writer.write(await blob.arrayBuffer());
        s.bytes = res.bytes;
      } catch (err) {
        s.writeError = err;
        console.error('Chunk write failed:', err);
        finishRecording('write-error');
      }
    });
  };
  recorder.onerror = (e) => {
    console.error('MediaRecorder error:', e.error);
    finishRecording('recorder-error');
  };

  // The tab stream ends when the tab closes or capture is stopped by Chrome.
  for (const track of tabStream.getTracks()) {
    track.addEventListener('ended', () => finishRecording('tab-ended'));
  }

  recorder.start(TIMESLICE_MS);
  s.startedAt = performance.now();
  s.progressTimer = setInterval(() => {
    sendToSw({
      type: 'progress',
      opfsName,
      bytes: s.bytes,
      durationMs: Math.round(performance.now() - s.startedAt),
    });
  }, PROGRESS_INTERVAL_MS);

  session = s;
  return { mimeType: recorder.mimeType, micActive: Boolean(micStream) };
}

function finishRecording(reason) {
  const s = session;
  if (!s) return Promise.resolve();
  if (!s.finishing) s.finishing = doFinish(s, reason);
  return s.finishing;
}

async function doFinish(s, reason) {
  clearInterval(s.progressTimer);
  const durationMs = Math.round(performance.now() - s.startedAt);
  try {
    if (s.recorder.state !== 'inactive') {
      const stopped = new Promise((resolve) => s.recorder.addEventListener('stop', resolve, { once: true }));
      s.recorder.stop();
      await stopped;
    }
    await s.writeQueue;
    await s.writer.close();
  } catch (err) {
    console.error('Error while stopping:', err);
  } finally {
    for (const stream of s.streams) stream.getTracks().forEach((t) => t.stop());
    s.audioCtx.close().catch(() => {});
    session = null;
  }

  try {
    const built = await buildDownloadUrl(s.opfsName, durationMs);
    await sendToSw({ type: 'finished', opfsName: s.opfsName, ...built, reason });
  } catch (err) {
    await sendToSw({ type: 'failed', opfsName: s.opfsName, error: String(err?.message || err) });
  }
}

/**
 * Builds the final file and its object URL. First tries the full index
 * (exact duration + Cues). Any problem falls back to the duration-only fix,
 * so the index can never lose or block a recording.
 * @returns {Promise<{url: string, durationMs: number, indexed: boolean}>}
 */
async function buildDownloadUrl(opfsName, durationMs) {
  const root = await navigator.storage.getDirectory();
  const file = await (await root.getFileHandle(opfsName)).getFile();
  if (file.size === 0) throw new Error('The recording is empty');

  let output;
  let finalDuration = durationMs;
  let indexed = false;
  let lastSent = -1;
  const onProgress = (fraction) => {
    const percent = Math.floor(fraction * 100);
    if (percent === lastSent) return;
    lastSent = percent;
    sendToSw({ type: 'saveProgress', opfsName, percent });
  };
  onProgress(0);
  try {
    const result = await addWebmIndex(file, { onProgress, timeoutMs: INDEX_TIMEOUT_MS });
    output = result.blob;
    finalDuration = Math.round(result.durationMs);
    indexed = true;
  } catch (err) {
    console.warn('Index not added; saving with the duration only:', err);
    output = await fixWebmDuration(file, durationMs);
  }

  const old = blobUrls.get(opfsName);
  if (old) URL.revokeObjectURL(old);
  const url = URL.createObjectURL(output);
  blobUrls.set(opfsName, url);
  return { url, durationMs: finalDuration, indexed };
}

async function recover({ opfsName, durationMs }) {
  try {
    const built = await buildDownloadUrl(opfsName, durationMs);
    await sendToSw({ type: 'finished', opfsName, ...built, reason: 'recovered' });
  } catch (err) {
    await sendToSw({ type: 'failed', opfsName, error: String(err?.message || err) });
  }
}

async function release({ opfsName, deleteFile }) {
  const url = blobUrls.get(opfsName);
  if (url) URL.revokeObjectURL(url);
  blobUrls.delete(opfsName);
  if (deleteFile) {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(opfsName).catch(() => {});
  }
}

// ---------- Messages from the service worker ----------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== TARGET.OFFSCREEN) return false;
  (async () => {
    try {
      switch (msg.type) {
        case 'start':
          sendResponse({ ok: true, ...(await startRecording(msg)) });
          break;
        case 'stop':
          finishRecording('user');
          sendResponse({ ok: true });
          break;
        case 'recover':
          recover(msg);
          sendResponse({ ok: true });
          break;
        case 'release':
          await release(msg);
          sendResponse({ ok: true });
          break;
        case 'ping':
          sendResponse({ ok: true, recording: Boolean(session) });
          break;
        default:
          sendResponse({ ok: false, error: `Unknown message: ${msg.type}` });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();
  return true;
});
