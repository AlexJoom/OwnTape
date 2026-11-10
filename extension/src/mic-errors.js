// One mapping for microphone problems, used by the permission page, the popup
// and the offscreen recorder, so all three tell the same story.
//
// kind:
//   'blocked'    Chrome blocks the microphone for the extension (state 'denied').
//   'dismissed'  The prompt closed without an answer (NotAllowedError, state 'prompt').
//   'no-device'  No microphone found.
//   'unreadable' A microphone exists but cannot be read (busy, OS privacy, driver).

export const MIC_SETTINGS_URL = 'chrome://settings/content/microphone';

/** @returns {Promise<'granted'|'denied'|'prompt'>} */
export async function micPermissionState() {
  try {
    return (await navigator.permissions.query({ name: 'microphone' })).state;
  } catch {
    return 'prompt';
  }
}

/**
 * @param {{name?: string, message?: string}} err  DOMException from getUserMedia.
 * @param {'granted'|'denied'|'prompt'} state  Permission state after the error.
 */
export function classifyMicError(err, state) {
  const name = err?.name || 'Error';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    if (state === 'denied') return 'blocked';
    if (state === 'prompt') return 'dismissed';
    return 'unreadable'; // permission granted in Chrome, but the OS refused
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'no-device';
  }
  return 'unreadable'; // NotReadableError, AbortError, TrackStartError, other
}

/** Short technical line, for example "NotReadableError: Could not start audio source". */
export function micErrorDetail(err) {
  if (!err) return '';
  return err.message ? `${err.name}: ${err.message}` : String(err.name || err);
}

export const MIC_TEXTS = {
  blocked: {
    title: 'The microphone is blocked',
    text: 'Chrome blocks the microphone for OwnTape. Allow it in the Chrome settings, then try again. Or record only the call audio.',
  },
  dismissed: {
    title: 'Chrome did not get an answer',
    text: 'The question about the microphone closed without an answer. Press the button again and select Allow.',
  },
  'no-device': {
    title: 'No microphone found',
    text: 'Connect a microphone or turn it on, then try again. Or record only the call audio.',
  },
  unreadable: {
    title: 'The microphone cannot be used',
    text: 'A different program possibly uses the microphone, or your operating system does not let Chrome use it. Close the other program or check the privacy settings of your operating system, then try again.',
  },
};
