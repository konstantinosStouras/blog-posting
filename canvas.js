// The public post canvas: cards plus faceted filters (megatrend, organisation,
// year, tags, module) and free-text search. All filtering happens in the browser
// on the posts the page already fetched, so Firestore needs no extra indexes.
//
// Filter state lives in the query string so a filtered view has a shareable link:
//   /module/managing-innovative-projects?trend=sustainability,digital&org=Ryanair&year=2026&tag=ESG,Supply%20Chain&q=fleet
// Several megatrends may be picked (a post has one, so they widen the set); several tags narrow it.
// Changing a filter rewrites that query with history.replaceState (no page
// re-render, no refetch) and redraws only the facets and the grid.
import {esc, fmtDate, postPath, excerptOf, readingTime, wordCount, plainText} from './util.js';
import {route, rewrite} from './router.js';

const norm = s => String(s ?? '').trim().toLowerCase();
const yearOf = p => new Date(p.publishedAt || p.updatedAt || p.createdAt || Date.now()).getFullYear();
// Posts stamped with the module's academic year (2026/27) facet by that; older ones by calendar year.
const yearKey = p => p.academicYear || String(yearOf(p));
const SORTS = [['new', 'Newest first'], ['old', 'Oldest first'], ['title', 'Title A–Z'], ['org', 'Organisation A–Z']];
const TAG_LIMIT = 18;

export function parseFilters(query = '') {
  const p = new URLSearchParams(String(query).replace(/^\?/, ''));
  return {q: (p.get('q') || '').trim(), trends: (p.get('trend') || '').split(',').map(t => t.trim()).filter(Boolean), org: p.get('org') || '', year: p.get('year') || '', module: p.get('module') || '', blog: p.get('blog') || '',
    tags: (p.get('tag') || '').split(',').map(t => t.trim()).filter(Boolean), sort: SORTS.some(s => s[0] === p.get('sort')) ? p.get('sort') : 'new'};
}
export function filterQuery(f) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q); if (f.trends?.length) p.set('trend', f.trends.join(',')); if (f.org) p.set('org', f.org); if (f.year) p.set('year', f.year);
  if (f.module) p.set('module', f.module); if (f.blog) p.set('blog', f.blog); if (f.tags?.length) p.set('tag', f.tags.join(',')); if (f.sort && f.sort !== 'new') p.set('sort', f.sort);
  const s = p.toString(); return s ? '?' + s : '';
}
const routeParts = () => { const h = route(); const i = h.indexOf('?'); return i < 0 ? [h, ''] : [h.slice(0, i), h.slice(i + 1)]; };
export const activeFilterCount = f => [f.q, f.org, f.year, f.module, f.blog].filter(Boolean).length + (f.tags?.length || 0) + (f.trends?.length || 0);

// One canvas per page. The page renders the string renderCanvas() returns; the
// document-level listeners at the bottom find the state again through `current`.
let current = null;
const searchIndex = new Map();   // post id + updatedAt -> lower-cased searchable text

export function renderCanvas(posts, opts = {}) {
  const [base, query] = routeParts();
  current = {posts: posts.slice(), opts, f: parseFilters(query), base, allTags: false, cats: opts.categories || [], modules: new Map((opts.modules || []).map(m => [m.id, m])), blogs: new Map((opts.blogs || []).map(b => [b.id, b]))};
  if (!posts.length) return `<p class="empty">${esc(opts.emptyText || 'No posts here yet.')}</p>`;
  return `<section class="canvas-root" aria-label="Posts">${headHtml(current)}<div class="canvas-filters">${filtersHtml(current)}</div><div class="canvas-grid">${gridHtml(current)}</div></section>`;
}

// ---------- matching ----------
function textOf(p) {
  const key = p.id + ':' + (p.updatedAt || '');
  if (!searchIndex.has(key)) { if (searchIndex.size > 2000) searchIndex.clear(); searchIndex.set(key, [p.title, p.excerpt, p.organisation, (p.tags || []).join(' '), p.authorName, catName(current, p.category, p), plainText(p.body)].join(' ').toLowerCase()); }
  return searchIndex.get(key);
}
function matches(p, f, skip = '') {
  if (skip !== 'trend' && f.trends.length && !f.trends.includes(p.category)) return false;
  if (skip !== 'org' && f.org && norm(p.organisation) !== norm(f.org)) return false;
  if (skip !== 'year' && f.year && yearKey(p) !== f.year) return false;
  if (skip !== 'module' && f.module && p.moduleId !== f.module) return false;
  if (skip !== 'blog' && f.blog && p.blogId !== f.blog) return false;
  if (skip !== 'tags' && f.tags.length) { const have = new Set((p.tags || []).map(norm)); if (!f.tags.every(t => have.has(norm(t)))) return false; }
  if (skip !== 'q' && f.q) { const words = norm(f.q).split(/\s+/).filter(Boolean), t = textOf(p); if (!words.every(w => t.includes(w))) return false; }
  return true;
}
// The category facet is named by the blog (Megatrend on the PM blog, Category elsewhere).
const catLabel = st => st.opts?.categoryLabel || 'Category';
// Category names come from the post's own blog when several blogs share a page.
const catName = (st, slug, p) => ((p && st.blogs?.get(p.blogId)?.categories) || st.cats).find(c => c.slug === slug)?.name || st.cats.find(c => c.slug === slug)?.name || slug || '';
function sorted(posts, sort) {
  const s = posts.slice();
  const newest = (a, b) => (b.publishedAt || b.updatedAt || 0) - (a.publishedAt || a.updatedAt || 0);
  if (sort === 'old') s.sort((a, b) => -newest(a, b));
  else if (sort === 'title') s.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === 'org') s.sort((a, b) => (a.organisation || '￿').localeCompare(b.organisation || '￿') || newest(a, b));
  else s.sort(newest);
  return s;
}

// Facet counts follow every OTHER active filter, so each option says how many
// posts choosing it would show from here.
function facets(st) {
  const {posts, f} = st;
  const count = (skip, keys) => { const m = new Map(); for (const p of posts) if (matches(p, f, skip)) for (const k of keys(p)) if (k) m.set(k, (m.get(k) || 0) + 1); return m; };
  const orgNames = new Map(), tagNames = new Map();
  for (const p of posts) {
    const o = String(p.organisation || '').trim(); if (o && !orgNames.has(norm(o))) orgNames.set(norm(o), o);
    for (const t of p.tags || []) { const k = norm(t); if (!k) continue; const seen = tagNames.get(k) || new Map(); seen.set(t.trim(), (seen.get(t.trim()) || 0) + 1); tagNames.set(k, seen); }
  }
  const tagLabel = k => [...tagNames.get(k).entries()].sort((a, b) => b[1] - a[1])[0][0];
  const trends = count('trend', p => [p.category]);
  const orgs = [...count('org', p => [norm(p.organisation)]).entries()].map(([k, n]) => ({key: orgNames.get(k) || k, label: orgNames.get(k) || k, n})).sort((a, b) => a.label.localeCompare(b.label));
  const years = [...count('year', p => [yearKey(p)]).entries()].map(([k, n]) => ({key: k, label: k, n})).sort((a, b) => b.key.localeCompare(a.key));
  const tags = [...count('tags', p => [...new Set((p.tags || []).map(norm))]).entries()].map(([k, n]) => ({key: k, label: tagLabel(k), n})).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  const modules = [...count('module', p => [p.moduleId]).entries()].map(([k, n]) => { const m = st.modules.get(k); return {key: k, label: m ? [m.code, m.title].filter(Boolean).join(' ') : k, n}; }).sort((a, b) => a.label.localeCompare(b.label));
  const blogs = [...count('blog', p => [p.blogId]).entries()].map(([k, n]) => ({key: k, label: st.blogs.get(k)?.title || k, n})).sort((a, b) => a.label.localeCompare(b.label));
  const allCats = st.cats.slice(); for (const slug of trends.keys()) if (slug && !allCats.some(c => c.slug === slug)) allCats.push({slug, name: slug});
  return {trends, allCats, orgs, years, tags, modules, blogs, yearLabel: posts.some(p => p.academicYear) ? 'Academic year' : 'Year'};
}

// ---------- markup ----------
function headHtml(st) {
  return `<div class="canvas-head">
    <form class="canvas-search" role="search" onsubmit="return false"><input type="search" name="q" value="${esc(st.f.q)}" placeholder="Search titles, organisations, tags, text…" aria-label="Search posts" autocomplete="off"><button type="button" class="clear" data-set="q" data-v="" aria-label="Clear search" ${st.f.q ? '' : 'hidden'}>×</button></form>
    <label class="canvas-sort">Sort<select data-set="sort" aria-label="Sort posts">${SORTS.map(([v, l]) => `<option value="${v}" ${st.f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <span class="canvas-count" aria-live="polite">${countText(st)}</span></div>`;
}
function countText(st) {
  const shown = st.posts.filter(p => matches(p, st.f)).length, total = st.posts.length;
  return activeFilterCount(st.f) ? `${shown} of ${total} post${total === 1 ? '' : 's'}` : `${total} post${total === 1 ? '' : 's'}`;
}
function filtersHtml(st) {
  const {f} = st, fx = facets(st), link = patch => esc(st.base + filterQuery({...f, ...patch}));
  const chip = (slug, name, n, active) => `<a href="${link({trends: !slug ? [] : active ? f.trends.filter(t => t !== slug) : [...f.trends, slug]})}" data-trend="${esc(slug)}" class="${active ? 'active' : ''}${n ? '' : ' zero'}" aria-pressed="${active}">${esc(name)}<span class="n">${n}</span></a>`;
  const select = (name, label, rows, value, all) => rows.length ? `<label>${label}<select data-set="${name}" aria-label="${label}"><option value="">${all} (${rows.reduce((s, r) => s + r.n, 0)})</option>${rows.map(r => `<option value="${esc(r.key)}" ${norm(r.key) === norm(value) ? 'selected' : ''}>${esc(r.label)} (${r.n})</option>`).join('')}</select></label>` : '';
  const shownTags = st.allTags ? fx.tags : fx.tags.slice(0, TAG_LIMIT);
  const active = f.tags.map(t => fx.tags.find(x => x.key === norm(t)) || {key: norm(t), label: t, n: 0});
  for (const t of active) if (!shownTags.some(x => x.key === t.key)) shownTags.unshift(t);
  const tagHtml = shownTags.map(t => { const on = f.tags.some(x => norm(x) === t.key); return `<a href="${link({tags: on ? f.tags.filter(x => norm(x) !== t.key) : [...f.tags, t.label]})}" data-tag="${esc(t.label)}" class="${on ? 'active' : ''}${t.n ? '' : ' zero'}" aria-pressed="${on}">${esc(t.label)}<span class="n">${t.n}</span></a>`; }).join('');
  // The category chips are toggles: a click selects a megatrend, a second click on a lit chip
  // deselects it, and nothing selected means every post. "Clear all" at the end of the row
  // resets every filter (chips, search, selects and tags) and shows only while one is set.
  const clearAll = activeFilterCount(f) ? `<button type="button" class="linkish clear-all" data-clear>Clear all</button>` : '';
  return `${fx.allCats.length ? `<div class="chips" role="group" aria-label="${esc(catLabel(st))}">${fx.allCats.map(c => chip(c.slug, c.name, fx.trends.get(c.slug) || 0, f.trends.includes(c.slug))).join('')}${clearAll}</div>` : clearAll ? `<div class="chips">${clearAll}</div>` : ''}
    <div class="canvas-facets">${select('org', 'Organisation', fx.orgs, f.org, 'All organisations')}${select('year', fx.yearLabel, fx.years, f.year, 'All years')}${st.blogs.size > 1 || fx.blogs.length > 1 || f.blog ? select('blog', 'Blog', fx.blogs, f.blog, 'All blogs') : ''}${st.modules.size > 1 || fx.modules.length > 1 || f.module ? select('module', 'Module', fx.modules, f.module, 'All modules') : ''}</div>
    ${fx.tags.length ? `<div class="tagcloud" role="group" aria-label="Tags"><span class="lbl">Tags</span>${tagHtml}${fx.tags.length > TAG_LIMIT ? `<button type="button" class="more" data-more-tags>${st.allTags ? 'Fewer tags' : `All ${fx.tags.length} tags`}</button>` : ''}</div>` : ''}`;
}
function gridHtml(st) {
  const shown = sorted(st.posts.filter(p => matches(p, st.f)), st.f.sort);
  if (!shown.length) return `<div class="canvas-empty"><p>No posts match these filters.</p><button type="button" class="btn small" data-clear>Clear filters</button></div>`;
  return `<div class="canvas">${shown.map(p => card(p, st)).join('')}</div>`;
}
export function card(p, st = current || {f: parseFilters(''), base: '/posts', cats: [], modules: new Map(), blogs: new Map(), opts: {}}) {
  const link = patch => esc(st.base + filterQuery({...st.f, ...patch}));
  const img = p.featuredImage ? `<a href="${postPath(p)}" tabindex="-1"><img class="thumb" src="${esc(p.featuredImage)}" alt="" loading="lazy"></a>` : '';
  const org = String(p.organisation || '').trim(), words = p.wordCount ?? wordCount(p.body), module = st.modules?.get(p.moduleId);
  const kicker = [org ? `<a href="${link({org})}" data-set="org" data-v="${esc(org)}" title="All posts about ${esc(org)}">${esc(org)}</a>` : '', p.category ? `<a href="${link({trends: [p.category]})}" data-trend="${esc(p.category)}" data-only="1" class="trend" title="All posts in this ${esc(catLabel(st).toLowerCase())}">${esc(catName(st, p.category, p))}</a>` : ''].filter(Boolean).join('');
  return `<article class="card ${img ? '' : 'noimage'}">${img}
    ${kicker ? `<div class="kicker">${kicker}</div>` : ''}
    <h2>${st.opts?.showStatus && p.status !== 'published' ? `<span class="badge ${esc(p.status)}">${esc(p.status)}</span>` : ''}<a href="${postPath(p)}">${esc(p.title)}</a></h2>
    <p>${esc(p.excerpt || excerptOf(p.body))}</p>
    <div class="tags">${(p.tags || []).map(t => `<a href="${link({tags: [t]})}" data-tag="${esc(t)}" data-only="1">${esc(t)}</a>`).join('')}</div>
    <div class="meta"><a href="/author/${esc(p.authorId)}">${esc(p.authorName)}</a> · <a href="${link({year: yearKey(p)})}" data-set="year" data-v="${esc(yearKey(p))}" title="All posts from ${esc(yearKey(p))}">${fmtDate(p.publishedAt || p.updatedAt)}</a> · ${readingTime(words)}${module && st.f.module !== p.moduleId && st.modules.size > 1 ? ` · <a href="${link({module: p.moduleId})}" data-set="module" data-v="${esc(p.moduleId)}">${esc(module.code || module.title)}</a>` : ''}</div></article>`;
}

// ---------- behaviour (delegated, so the page only has to render the string) ----------
function root(el) { const r = el?.closest?.('.canvas-root'); return r && current ? r : null; }
function apply(r, patch) {
  current.f = {...current.f, ...patch};
  rewrite(current.base + filterQuery(current.f));
  r.querySelector('.canvas-filters').innerHTML = filtersHtml(current);
  r.querySelector('.canvas-grid').innerHTML = gridHtml(current);
  r.querySelector('.canvas-count').textContent = countText(current);
  r.querySelector('.canvas-search .clear').hidden = !current.f.q;
  if (!current.f.q) r.querySelector('.canvas-search input').value = '';
}
document.addEventListener('click', e => {
  const r = root(e.target); if (!r) return;
  const set = e.target.closest('[data-set]'), tag = e.target.closest('[data-tag]'), trend = e.target.closest('[data-trend]'), rm = e.target.closest('[data-remove]');
  if (set && set.tagName !== 'SELECT') { e.preventDefault(); apply(r, {[set.dataset.set]: set.dataset.v}); }
  else if (trend) { e.preventDefault(); const v = trend.dataset.trend, on = current.f.trends.includes(v); apply(r, {trends: !v ? [] : trend.dataset.only ? [v] : on ? current.f.trends.filter(t => t !== v) : [...current.f.trends, v]}); }
  else if (tag) { e.preventDefault(); const k = norm(tag.dataset.tag), on = current.f.tags.some(t => norm(t) === k); apply(r, {tags: tag.dataset.only ? [tag.dataset.tag] : on ? current.f.tags.filter(t => norm(t) !== k) : [...current.f.tags, tag.dataset.tag]}); }
  else if (rm) { const k = rm.dataset.remove; apply(r, k === 'tag' ? {tags: current.f.tags.filter(t => norm(t) !== norm(rm.dataset.v))} : k === 'trend' ? {trends: current.f.trends.filter(t => t !== rm.dataset.v)} : {[k]: ''}); }
  else if (e.target.closest('[data-clear]')) { apply(r, {q: '', trends: [], org: '', year: '', module: '', blog: '', tags: []}); r.querySelector('.canvas-search input').value = ''; }
  else if (e.target.closest('[data-more-tags]')) { current.allTags = !current.allTags; r.querySelector('.canvas-filters').innerHTML = filtersHtml(current); }
  else return;
  if (set || tag || trend || rm) r.querySelector('.canvas-grid').scrollIntoView({block: 'nearest'});
});
document.addEventListener('change', e => { const r = root(e.target); if (r && e.target.matches('select[data-set]')) apply(r, {[e.target.dataset.set]: e.target.value}); });
let typing;
document.addEventListener('input', e => { const r = root(e.target); if (!r || !e.target.matches('.canvas-search input')) return; clearTimeout(typing); typing = setTimeout(() => apply(r, {q: e.target.value.trim()}), 160); });
document.addEventListener('keydown', e => { const r = root(e.target); if (r && e.key === 'Escape' && e.target.matches('.canvas-search input')) { e.target.value = ''; apply(r, {q: ''}); } });
