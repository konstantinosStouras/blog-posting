// Clean URLs for a site that has no server.
//
// Every page has a real path (/project-management, /2026/10/my-post,
// /admin/feedback) and the code only ever speaks in those app routes. The app
// itself is mounted at BASE: /ucd-blog/ on stouras.com and / on a dev server,
// read from this module's own URL so the same files serve both. Links in the
// markup are written root-relative (href="/x"); on a mounted site an
// observer prefixes BASE as they enter the document, so hovering, copying and
// middle-clicking a link all give the real address.
//
// A static host has no file at /ucd-blog/project-management. GitHub Pages serves the site's
// root 404.html instead, which sends the browser to /ucd-blog/?redirect=<path>;
// this module puts the path back before the app starts (dev-server.py does the
// same locally). Old #/… addresses — bookmarks and links shared before clean
// URLs — are rewritten the same way, so nothing anyone saved breaks.
const isDev = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const BASE = typeof document === 'undefined' ? '/' : new URL('.', import.meta.url).pathname;
export const ROOT = BASE.replace(/\/$/, '');          // '/ucd-blog' or ''
const STRIP = ['local', 'redirect', '_'];              // dev-mode flag, 404 hand-over and its cache-buster: never part of a route
let sticky = false;                                    // ?local on a dev server: keep it on every address so a reload stays on the sample data

// The app route (path + query) for an address: the mount point and the
// housekeeping parameters removed.
export function routeOf(pathname, search = '', root = ROOT) {
  let p = pathname || '/';
  if (root && (p === root || p.startsWith(root + '/'))) p = p.slice(root.length);
  try { p = decodeURIComponent(p); } catch {}
  if (p === '/index.html' || p === '') p = '/';
  if (search && STRIP.some(k => new URLSearchParams(search).has(k))) {
    const q = new URLSearchParams(search); STRIP.forEach(k => q.delete(k));
    const s = q.toString(); search = s ? '?' + s : '';
  }
  return p + (search || '');
}
export const route = () => routeOf(location.pathname, location.search);

// The address for an app route, on this mount. Tolerates a route that already
// carries the mount prefix (postPath() output passed through navigate()).
export function href(path, root = ROOT) {
  let p = String(path || '/');
  if (root && (p === root || p.startsWith(root + '/') || p.startsWith(root + '?'))) p = p.slice(root.length);
  if (!p.startsWith('/')) p = '/' + p;
  let u = root + p;
  if (sticky && !/[?&]local(=|&|$)/.test(u)) u += (u.includes('?') ? '&' : '?') + 'local';
  return u;
}
// The shareable address of a route: what goes in copied links, CSV files and invitations.
export const publicUrl = path => location.origin + href(path).replace(/[?&]local(?=&|$)/, '').replace(/\?$/, '');

// Where a visitor was heading, when the host or an old link brought them to the
// app root instead: the ?redirect= target from 404.html, or a legacy #/route.
export function restoreTarget(search, hash, root = ROOT, origin = 'https://example.invalid') {
  const q = new URLSearchParams(search);
  const target = q.has('redirect') ? q.get('redirect') : /^#[/?]/.test(hash) ? hash.slice(1) : null;
  if (target === null) return null;
  let u;
  try { u = new URL(target, origin); } catch { return null; }
  if (u.origin !== origin || u.pathname.startsWith('//')) return null;
  q.delete('redirect'); q.delete('_');
  for (const [k, v] of u.searchParams) q.set(k, v);
  const s = q.toString();
  const path = routeOf(u.pathname, s ? '?' + s : '', root);
  if (!path.startsWith('/') || /^\/[/\\]/.test(path)) return null;
  return {route: path, local: q.has('local'), hash: u.hash};
}

let current = null;
function changed() {
  const now = route();
  if (now === current) return false;
  current = now;
  dispatchEvent(new CustomEvent('routechange'));
  return true;
}
// Go to a route and render it (pushState, or replaceState for redirects).
// Returns false when the route did not change, so nothing re-rendered.
export function navigate(path, {replace = false} = {}) {
  history[replace ? 'replaceState' : 'pushState'](null, '', href(path));
  return changed();
}
// Change the address without re-rendering: a new draft getting its id, a canvas filter.
export function rewrite(path) { history.replaceState(null, '', href(path)); current = route(); }

function onPop() {
  if (/^#[/?]/.test(location.hash)) history.replaceState(null, '', href(location.hash.slice(1)));   // a legacy route typed into the address bar
  changed();   // an in-page anchor (#comments, #fn-3) changes the hash, not the route: nothing happens
}
function onClick(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (!a || a.target || a.hasAttribute('download') || a.isContentEditable) return;
  let url; try { url = new URL(a.href); } catch { return; }
  if (url.origin !== location.origin) return;
  if (/^#[/?]/.test(url.hash) && url.pathname === location.pathname) { e.preventDefault(); navigate(url.hash.slice(1)); return; }   // a #/route left in stored content
  if (!(url.pathname === ROOT || url.pathname.startsWith(BASE))) return;
  if (url.pathname + url.search === location.pathname + location.search && url.hash) return;   // in-page anchor: the browser scrolls
  e.preventDefault();
  history.pushState(null, '', href(routeOf(url.pathname, url.search)) + url.hash);
  changed();
}
// Links are written as app routes; on a mounted site they get the prefix as they appear.
function mountLinks() {
  if (!ROOT) return;
  const fix = a => { const h = a.getAttribute('href') || ''; if (h.startsWith('/') && !h.startsWith('//') && h !== ROOT && !h.startsWith(ROOT + '/') && !h.startsWith(ROOT + '?')) a.setAttribute('href', ROOT + h); };
  const scan = n => { if (n.nodeType !== 1) return; if (n.matches('a[href]')) fix(n); n.querySelectorAll('a[href]').forEach(fix); };
  new MutationObserver(ms => { for (const m of ms) { if (m.type === 'attributes') fix(m.target); else m.addedNodes.forEach(scan); } }).observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['href']});
  scan(document.documentElement);
}

// Runs once, before the app: the address the visitor asked for is restored and
// the dev-mode flag remembered.
if (typeof location !== 'undefined') {
  const q = new URLSearchParams(location.search);
  const t = restoreTarget(location.search, location.hash, ROOT, location.origin);
  sticky = isDev && (q.has('local') || !!t?.local);
  if (t) history.replaceState(null, '', href(t.route) + t.hash);
}
export function startRouter(onChange) {
  current = route();
  addEventListener('popstate', onPop);
  document.addEventListener('click', onClick);
  addEventListener('routechange', onChange);
  mountLinks();
}
