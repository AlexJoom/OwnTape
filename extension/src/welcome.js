// Welcome page: show the "pin the icon" step only when the icon is not pinned yet.
import { renderDiscoverability } from './discover.js';

renderDiscoverability().catch(() => {});
// The user can pin the icon while this page is open.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') renderDiscoverability().catch(() => {});
});
