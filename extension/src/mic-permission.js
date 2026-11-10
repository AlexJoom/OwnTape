// Microphone permission page. getUserMedia needs a visible extension page for
// the first grant; the offscreen recorder then uses the same permission.
import { PRODUCT_NAME } from './constants.js';
import { MIC_SETTINGS_URL, MIC_TEXTS, classifyMicError, micErrorDetail, micPermissionState } from './mic-errors.js';

const $ = (id) => document.getElementById(id);
const panels = document.querySelectorAll('[data-status]');

function showPanel(name) {
  for (const panel of panels) panel.hidden = panel.dataset.status !== name;
}

function showError(kind, err) {
  const texts = MIC_TEXTS[kind];
  $('err-title').textContent = texts.title;
  $('err-text').textContent = texts.text;
  $('err-steps').hidden = kind !== 'blocked';
  $('btn-settings').hidden = kind !== 'blocked';
  $('err-os-note').hidden = kind !== 'unreadable' && kind !== 'blocked';
  $('err-detail').hidden = !err;
  $('err-detail').textContent = micErrorDetail(err);
  showPanel('error');
}

/** Asks for the microphone and shows the real result. Never claims "granted" without a working stream. */
async function requestMic() {
  showPanel('waiting');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const live = stream.getAudioTracks().some((t) => t.readyState === 'live');
    stream.getTracks().forEach((t) => t.stop());
    if (!live) return showError('unreadable', { name: 'TrackNotLive', message: 'The microphone track ended at once.' });
    showPanel('granted');
  } catch (err) {
    showError(classifyMicError(err, await micPermissionState()), err);
  }
}

$('btn-allow').addEventListener('click', requestMic);
$('btn-retry').addEventListener('click', requestMic);
$('btn-settings').addEventListener('click', () => chrome.tabs.create({ url: MIC_SETTINGS_URL }));
$('btn-close').addEventListener('click', () => window.close());

for (const el of document.querySelectorAll('.js-app-name')) el.textContent = PRODUCT_NAME;

// On load, show only what the permission state alone proves. "granted" here
// means Chrome allows it; a device problem shows when the user presses the button.
if ((await micPermissionState()) === 'denied') showError('blocked', null);
