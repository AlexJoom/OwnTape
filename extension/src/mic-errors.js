// One mapping for microphone problems, used by the permission page, the popup
// and the offscreen recorder, so all three tell the same story.
//
// kind:
//   'blocked'    Chrome blocks the microphone for the extension (state 'denied').
//   'dismissed'  The prompt closed without an answer (NotAllowedError, state 'prompt',
//                slow rejection: the user saw the prompt).
//   'not-asked'  Chrome did not show the prompt at all (NotAllowedError, state 'prompt',
//                rejected at once). Chrome does this after repeated dismissals
//                ("automatic blocking"); only the site settings help.
//   'no-device'  No microphone found.
//   'refused'    Chrome refused it although the state is 'granted' (seen after
//                repeated prompts, or with an extension loaded through DevTools).
//   'unreadable' A microphone exists but cannot be read (busy, OS privacy, driver).

// A rejection faster than this means Chrome showed no prompt.
export const NO_PROMPT_THRESHOLD_MS = 500;

/** Chrome's site-settings page for this extension's own origin. */
export function extensionSiteSettingsUrl(extensionId) {
  return `chrome://settings/content/siteDetails?site=${encodeURIComponent(`chrome-extension://${extensionId}`)}`;
}

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
 * @param {number} [elapsedMs]  Time from the getUserMedia call to the rejection.
 *   Only a visible page that can show a prompt passes it.
 */
export function classifyMicError(err, state, elapsedMs) {
  const name = err?.name || 'Error';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    if (state === 'denied') return 'blocked';
    if (state === 'prompt') {
      if (elapsedMs === undefined) return 'not-asked'; // no prompt possible here (offscreen)
      return elapsedMs < NO_PROMPT_THRESHOLD_MS ? 'not-asked' : 'dismissed';
    }
    // State 'granted': macOS reports an OS refusal as "Permission denied by system".
    return /system/i.test(err?.message || '') ? 'unreadable' : 'refused';
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
    text: 'Chrome blocks the microphone for OwnTape. Allow it in the Chrome settings, then try again.',
  },
  dismissed: {
    title: 'Chrome did not get an answer',
    text: 'The question about the microphone closed before you answered. Click Try again and select Allow.',
  },
  'not-asked': {
    title: 'Chrome stopped asking for the microphone',
    text: 'The question was closed several times, so Chrome now blocks it automatically. Allow the microphone in the settings of OwnTape, then come back to this tab.',
  },
  refused: {
    title: 'Chrome refused the microphone for OwnTape',
    text: 'Chrome says that the microphone is allowed, but it did not give it to OwnTape. Open the settings of OwnTape and click Reset permissions. Then reload OwnTape on the chrome://extensions page, come back here and allow the microphone again.',
  },
  'no-device': {
    title: 'No microphone found',
    text: 'Connect a microphone or turn it on, then try again.',
  },
  unreadable: {
    title: 'The microphone cannot be used',
    text: 'Another program possibly uses the microphone, or your operating system does not let Chrome use it. Close the other program or check the privacy settings below, then try again.',
  },
};
