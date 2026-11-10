// Microphone permission page. getUserMedia needs a visible extension page for
// the first grant; the offscreen recorder then uses the same permission.
import { PRODUCT_NAME } from './constants.js';
import {
  MIC_TEXTS,
  classifyMicError,
  extensionSiteSettingsUrl,
  micErrorDetail,
  micPermissionState,
} from './mic-errors.js';

const $ = (id) => document.getElementById(id);
const panels = document.querySelectorAll('[data-status]');
let currentKind = null; // the error kind on screen, or null

function showPanel(name) {
  for (const panel of panels) panel.hidden = panel.dataset.status !== name;
}

function showError(kind, err) {
  const texts = MIC_TEXTS[kind] || MIC_TEXTS.unreadable;
  $('err-title').textContent = texts.title;
  $('err-text').textContent = texts.text;
  currentKind = kind;
  const allowSteps = kind === 'blocked' || kind === 'not-asked';
  const refused = kind === 'refused';
  const needsSettings = allowSteps || refused;
  $('err-steps').hidden = !allowSteps;
  // 'refused': reset + reload steps. Try again cannot help before the reload.
  $('err-reset-note').hidden = !refused;
  $('err-steps-reset').hidden = !refused;
  $('btn-extensions').hidden = !refused;
  $('btn-retry').hidden = refused;
  $('btn-settings').hidden = !needsSettings;
  // When only the settings can help, they are the next step; otherwise "Try again".
  $('btn-retry').classList.toggle('btn--primary', !needsSettings);
  $('btn-retry').classList.toggle('btn--secondary', needsSettings);
  $('err-os-note').hidden = kind !== 'unreadable' && kind !== 'blocked';
  $('err-detail').hidden = !err;
  $('err-detail').textContent = typeof err === 'string' ? err : micErrorDetail(err);
  showPanel('error');
}

/** Asks for the microphone and shows the real result. Never claims "granted" without a working stream. */
async function requestMic() {
  showPanel('waiting');
  currentKind = null;
  const t0 = performance.now();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const live = stream.getAudioTracks().some((t) => t.readyState === 'live');
    stream.getTracks().forEach((t) => t.stop());
    if (!live) return showError('unreadable', { name: 'TrackNotLive', message: 'The microphone track ended at once.' });
    showPanel('granted');
  } catch (err) {
    const elapsed = performance.now() - t0;
    showError(classifyMicError(err, await micPermissionState(), elapsed), err);
  }
}

$('btn-allow').addEventListener('click', requestMic);
$('btn-retry').addEventListener('click', requestMic);
$('btn-settings').addEventListener('click', () =>
  chrome.tabs.create({
    // This extension's own site page: one "Microphone" dropdown.
    url: extensionSiteSettingsUrl(chrome.runtime.id),
  }),
);

// When the user comes back from the settings, retry by itself if Chrome now allows it.
async function recheckOnReturn() {
  // Not for 'refused': the state is already 'granted' there; only a reload helps.
  if (document.visibilityState !== 'visible' || !currentKind || currentKind === 'refused') return;
  if ((await micPermissionState()) === 'granted') requestMic();
}
document.addEventListener('visibilitychange', recheckOnReturn);
window.addEventListener('focus', recheckOnReturn);
$('btn-close').addEventListener('click', () => window.close());
$('btn-extensions').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/' }));

for (const el of document.querySelectorAll('.js-app-name')) el.textContent = PRODUCT_NAME;

// Show only the operating-system line for this computer (all if unknown).
try {
  const { os } = await chrome.runtime.getPlatformInfo();
  const lines = [...document.querySelectorAll('.os-line')];
  if (lines.some((l) => l.dataset.os === os)) for (const l of lines) l.hidden = l.dataset.os !== os;
} catch {
  // keep all lines
}

// Opened from the popup ("How to fix") with the recorder's result:
// ?kind=<kind>&detail=<technical line>. Show that at once, without a new request.
const params = new URLSearchParams(location.search);
const fromPopup = params.get('kind');
if (fromPopup && MIC_TEXTS[fromPopup]) {
  showError(fromPopup, params.get('detail') || null);
} else if ((await micPermissionState()) === 'denied') {
  // Otherwise show only what the permission state alone proves. A device
  // problem shows when the user presses the button.
  showError('blocked', null);
}
