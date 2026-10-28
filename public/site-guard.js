// Load in <head> before third-party counters for the earliest protection.
// Also bundled at the start of widget.js so existing embeds receive the guard.
(() => {
  'use strict';
  const script = document.currentScript;
  if (script?.dataset.blockShoppingRedirects === 'false' || window.__stbNavigationGuard) return;
  const state = { version: '6.3.0', blockedCount: 0 };
  const blockedHosts = new Set([
    'shopee.vn', 'shopee.com', 'shopee.sg', 'shopee.ph', 'shopee.co.th',
    'shopee.co.id', 'shopee.com.my', 'shopee.tw', 'shopee.com.br', 'shopee.com.mx',
    'shope.ee', 'shp.ee', 'lazada.vn',
    'popads.net', 'popcash.net', 'adsterra.com', 'onclicka.com', 'doubleclick.net'
  ]);
  for (const host of (script?.dataset.blockedShoppingHosts || '').split(';')) {
    const value = host.trim().toLowerCase();
    if (/^[a-z0-9.-]+$/.test(value) && value.includes('.')) blockedHosts.add(value);
  }
  function blockedDestination(value, depth = 0) {
    if (depth > 3 || value === undefined || value === null) return false;
    const raw = String(value).trim().slice(0, 8192);
    if (!raw) return false;
    if (/^(?:shopee|lazada):/i.test(raw)) return true;
    if (/^intent:/i.test(raw) && /(?:scheme=(?:shopee|lazada)(?:;|$)|package=com\.(?:shopee|lazada)(?:[.;]|$))/i.test(raw)) return true;
    try {
      const url = new URL(raw, location.href);
      const host = url.hostname.toLowerCase().replace(/\.$/, '');
      if ([...blockedHosts].some((domain) => host === domain || host.endsWith(`.${domain}`))) return true;
      for (const key of ['url', 'u', 'redirect', 'redirect_url', 'redirect_uri', 'target', 'to', 'deeplink', 'destination', 'browser_fallback_url']) {
        const destination = url.searchParams.get(key);
        if (destination && blockedDestination(destination, depth + 1)) return true;
      }
      const fallback = raw.match(/(?:^|[;#])S\.browser_fallback_url=([^;]+)/i)?.[1];
      if (fallback && blockedDestination(decodeURIComponent(fallback), depth + 1)) return true;
    } catch { /* Invalid/encoded URL may be handled by the bounded decoding below. */ }
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded !== raw) return blockedDestination(decoded, depth + 1);
    } catch { /* Preserve the browser's handling of unrelated malformed URLs. */ }
    return false;
  }
  function blocked() { state.blockedCount += 1; }
  const nativeOpen = window.open;
  window.open = function (url, ...args) {
    if (blockedDestination(url)) { blocked(); return null; }
    return Reflect.apply(nativeOpen, window, [url, ...args]);
  };
  function guardNavigation(event) {
    const path = event.composedPath();
    const link = path.find((element) => element instanceof Element && element.matches('a[href],area[href]'));
    const form = event.type === 'submit' ? event.target : null;
    const destination = link?.getAttribute('href') || form?.getAttribute?.('action');
    if (!blockedDestination(destination)) return;
    blocked();
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  for (const event of ['click', 'auxclick', 'pointerdown', 'touchend', 'submit']) {
    window.addEventListener(event, guardNavigation, { capture: true, passive: false });
  }
  Object.defineProperty(window, '__stbNavigationGuard', { value: state, configurable: true });
})();
