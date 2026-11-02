// Router + every page. Clean URLs (router.js) that work from any static host (stouras.com/ucd-blog/).
import {route, navigate, rewrite, publicUrl, startRouter} from './router.js';
import {initStore, store, resetAccess} from './store.js';
import {renderAccountControl, currentUser, openAuthModal, roleLabel} from './auth.js';
import {can, ROLES, rank} from './permissions.js';
import {mountEditor, fillOutline} from './editor.js';
import {configurePlatform, blogDirectory, myModules, blogCanvas, moduleRedirect, briefPage, manageModule, manageBlog, invitationsPage, acceptInvitationPage, studentInvitationsPage} from './platform.js';
import {renderPeople} from './people.js';
import {renderGrading} from './ai-grading.js';
import {mountFeedbackButton, renderFeedbackInbox} from './feedback.js';
import {startWritingTimer} from './writing-time.js';
import {renderCanvas, filterQuery} from './canvas.js';
import {enhance} from './blocks.js';
import {makeTablesSortable} from './sortable-tables.js';
import {esc, fmtDate, fmtDateTime, monthKey, monthName, postPath, sanitize, plainText, wordCount, excerptOf, readingTime, by, groupBy, toast, shrinkImage, slugify, newId, pageHead, linkedinUrl} from './util.js';

const $app = document.getElementById('app'), $header = document.getElementById('site-header'), $footer = document.getElementById('site-footer');
let S;                      // site settings (masthead only; exercises live on blogs)
let BLOGS = [];             // every blog, refreshed on each navigation: category names, titles, comment policy
let liveView = null;        // the mounted view, when it must not be re-rendered on data changes (the editor)
let renderSeq = 0;          // a stamp for async renders: a slow page must not paint over a later navigation
const blogOf = p => BLOGS.find(b => b.id === (p?.blogId || p)) || null;
const allCategories = () => { const seen = new Map(); for (const b of BLOGS) for (const c of b.categories || []) if (!seen.has(c.slug)) seen.set(c.slug, c); return [...seen.values()]; };
// A category slug is named by the post's own blog (two blogs may use the same slug differently).
const catName = (slug, p) => ((blogOf(p)?.categories) || allCategories()).find(c => c.slug === slug)?.name || allCategories().find(c => c.slug === slug)?.name || slug || '';
const user = () => currentUser();

// Signed out there is only the front door and an invitation link; every other page needs an account.
const PUBLIC = [/^\/?$/, /^\/blogs$/, /^\/modules$/, /^\/invite\//, /^\/join\//];
const routes = [
  [/^\/?$/, home],
  [/^\/blogs$/, blogDirectory],
  [/^\/modules$/, blogDirectory],
  [/^\/posts$/, () => browse({})],
  [/^\/my-modules$/, myModules],
  [/^\/blog\/([a-z0-9-]+)((?:\/brief)?(?:\?.*)?)$/, (id, rest) => navigate('/' + id + rest, {replace: true})],   // the address before 2 Nov 2026: a blog now lives at /<url-name>
  [/^\/blogs\/edit\/([a-z0-9-]+)$/, manageBlog],
  [/^\/module\/([a-z0-9-]+)$/, moduleRedirect],
  [/^\/modules\/new$/, () => manageModule(null)],
  [/^\/modules\/edit\/([a-z0-9-]+)$/, manageModule],
  [/^\/modules\/invite\/([a-z0-9-]+)$/, studentInvitationsPage],
  [/^\/invitations$/, () => navigate('/admin/invite', {replace: true})],   // old address: the page lives in the admin area
  [/^\/invite\/([a-zA-Z0-9-]+)(?:\/([a-z]+(?:-[0-9]{3})?))?$/i, (id,code)=>acceptInvitationPage(id,code,'instructor')],
  [/^\/join\/([a-zA-Z0-9-]+)\/([a-z]+(?:-[0-9]{3})?)$/i, (id,code)=>acceptInvitationPage(id,code,'student')],
  [/^\/(\d{4})\/(\d{2})\/([^/?]+)\/?$/, (y, m, slug) => postView(slug)],
  [/^\/post\/([^/?]+)$/, postView],
  [/^\/category\/([^/?]+)$/, slug => navigate('/posts' + filterQuery({trend: slug}), {replace: true})],   // old links keep working
  [/^\/tag\/([^/?]+)$/, tag => navigate('/posts' + filterQuery({tags: [decodeURIComponent(tag)]}), {replace: true})],
  [/^\/author\/([^/?]+)$/, uid => browse({author: uid})],
  [/^\/archive\/(\d{4}-\d{2})$/, month => browse({month})],
  [/^\/search\/?(.*)$/, q => navigate('/posts' + filterQuery({q: decodeURIComponent(q || '')}), {replace: true})],
  [/^\/challenge$/, () => navigate('/blogs', {replace: true})],
  [/^\/write$/, () => editorView(null)],
  [/^\/write\/([a-z0-9-]+)$/, moduleId => editorView(null,moduleId)],
  [/^\/edit\/([^/?]+)$/, editorView],
  [/^\/mine$/, mine],
  [/^\/profile$/, profileView],
  [/^\/review\/?([a-z]*)(?:\?(.*))?$/, lecturer],
  [/^\/admin\/?([a-z]*)(?:\?module=([a-z0-9-]+))?$/, admin],
  // A blog is the site's first-level page: /project-management. Last, so every named page above wins.
  [/^\/([a-z0-9-]+)$/, blogCanvas],
  [/^\/([a-z0-9-]+)\/brief$/, briefPage],
];

// Renders run one after another: a slow page (waiting for the database) must not
// finish AFTER a later navigation and paint over it.
let queue = Promise.resolve();
function render() { queue = queue.then(doRender).catch(e => console.error(e)); return queue; }
async function doRender() {
  const seq = ++renderSeq;
  const path = route();   // '/x?trend=y': the app route, whatever the site is mounted at
  liveView = null; $app.onclick = null;
  resetAccess();   // who may read what is decided afresh for this navigation
  if (!user() && !PUBLIC.some(re => re.test(path.split('?')[0]))) { navigate('/', {replace: true}); toast('Log in to read the blog.'); return; }
  try { BLOGS = await store.listBlogs(); } catch (e) { console.warn('blogs', e); }
  renderHeader(path);
  window.scrollTo(0, 0);
  const bare = path.split('?')[0];   // canvas filters live in a ?query after the route; routes that expect their own query match first
  for (const [re, fn] of routes) { const m = path.match(re) || bare.match(re); if (m) { try { await fn(...m.slice(1)); } catch (e) { console.error(e); $app.innerHTML = `<p class="empty">Something went wrong: ${esc(e.message)}</p>`; } landed(seq); return; } }
  $app.innerHTML = `<p class="empty">That page does not exist. <a href="/">Back to the blog</a></p>`; landed(seq);
}
// After a page is drawn: a link that named an anchor (/2026/10/post#comments) scrolls to it.
function landed(seq) {
  const id = location.hash.slice(1);
  if (id) { const go = () => document.getElementById(id)?.scrollIntoView({block: 'start'}); go(); setTimeout(go, 400); setTimeout(go, 1200); }   // repeated: images and embeds shift the layout as they load
  renderFooter(seq);
}

// ---------- header & footer ----------
function renderHeader(path = route()) {
  const u = user();
  const active = h => (h === '/' ? path === '/' : path.startsWith(h)) ? 'active' : '';
  // Two rows. Top: the masthead with the account control on the right (a Write button and the
  // avatar menu, where everything personal lives). Under the rule: the site's public tabs on the
  // left and search on the right. On a phone the tabs fold into a drawer that slides in from the left.
  document.body.classList.remove('nav-locked');
  // Signed out there is nothing to browse, so only the masthead and Log in are drawn. Signed in,
  // the first tab is the person's own blog (or blogs); the admin explores them all.
  const blogTab = !u ? null : u.role === 'admin' ? {href: '/blogs', label: 'Explore blogs'} : BLOGS.length === 1 ? {href: '/' + BLOGS[0].id, label: 'My blog'} : {href: '/blogs', label: 'My blogs'};
  $header.innerHTML = `<div class="brand">
    ${u ? '<button type="button" class="nav-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="site-nav"><span></span><span></span><span></span></button>' : ''}
    <div class="masthead"><h1><a href="/">${esc(S.title)}</a></h1><p class="tagline">${esc(S.tagline)}</p></div>
    <div class="account" id="account"></div></div>
  <hr class="rule">
  ${u ? `<div class="sub">
    <nav id="site-nav" class="site-nav" aria-label="Site">
      <button type="button" class="nav-close" aria-label="Close menu">×</button>
      <a href="${esc(blogTab.href)}" class="${active(blogTab.href)}">${blogTab.label}</a><a href="/posts" class="${active('/posts')}">All posts</a>
      <form class="searchbox" role="search"><input name="q" placeholder="Search posts" aria-label="Search posts"><button aria-label="Search">⌕</button></form>
    </nav>
    <div class="nav-backdrop" hidden></div></div><hr class="thin">` : ''}`;
  renderAccountControl($header.querySelector('#account'));   // includes "View as Instructor X" / "View as Student" when they apply
  const toggle = $header.querySelector('.nav-toggle'), nav = $header.querySelector('#site-nav'), backdrop = $header.querySelector('.nav-backdrop');
  if (!nav) return;
  const setNav = open => { $header.classList.toggle('nav-open', open); toggle.setAttribute('aria-expanded', String(open)); backdrop.hidden = !open; document.body.classList.toggle('nav-locked', open); };
  toggle.onclick = () => { const open = !$header.classList.contains('nav-open'); setNav(open); if (open) nav.querySelector('a')?.focus(); };
  backdrop.onclick = () => setNav(false);
  nav.querySelector('.nav-close').onclick = () => { setNav(false); toggle.focus(); };
  nav.addEventListener('click', e => { if (e.target.closest('a')) setNav(false); });
  nav.addEventListener('keydown', e => { if (e.key === 'Escape') { setNav(false); toggle.focus(); } });
  $header.querySelector('.searchbox').onsubmit = e => { e.preventDefault(); navigate('/posts' + filterQuery({q: e.target.q.value.trim()})); };
}
async function renderFooter(seq = renderSeq) {
  document.body.classList.toggle('writing', liveView === 'editor');   // lifts the Feedback button above the writer's sticky footer
  if (liveView === 'editor') { $footer.innerHTML = ''; return; }   // the writer page is full-bleed
  const u = user(), mode = store.mode === 'firebase' ? 'live database' : 'local prototype (this browser only)';
  if (!u) { $footer.innerHTML = `<div class="inner"><div><p class="colophon">${esc(S.title)}. Posts are visible to the members of their blog, who read and review them. Mode: ${mode}.</p></div><div></div>
    <div><h3>About</h3><ul><li><a href="https://www.stouras.com/" target="_blank" rel="noopener">stouras.com</a></li></ul></div></div>`; return; }
  let posts, comments;
  try { [posts, comments] = await Promise.all([store.listPosts({status: 'published'}), store.recentComments(5)]); } catch (e) { console.warn('footer', e); return; }
  if (seq !== renderSeq || liveView === 'editor') { if (liveView === 'editor') $footer.innerHTML = ''; return; }   // a later navigation won; do not paint over it
  posts.sort(by('publishedAt'));
  const byPost = Object.fromEntries(posts.map(p => [p.id, p]));
  const perMonth = groupBy(posts, p => monthKey(p.publishedAt));
  const months = Object.keys(perMonth).sort().reverse();
  $footer.innerHTML = `<div class="inner">
    <div><form class="widget-search" role="search"><input name="q" placeholder="Search" aria-label="Search"><button>Search</button></form>
      <h3>Recent posts</h3><ul>${posts.slice(0, 5).map(p => `<li><a href="${postPath(p)}">${esc(p.title)}</a></li>`).join('') || '<li class="muted">Nothing published yet.</li>'}</ul>
      <p class="colophon">${esc(S.title)}. Posts are visible to the members of their blog, who read and review them. Mode: ${mode}.</p></div>
    <div><h3>Recent comments</h3><ul>${comments.filter(c => byPost[c.postId]).map(c => `<li><b>${esc(c.authorName)}</b> on <a href="${postPath(byPost[c.postId])}">${esc(byPost[c.postId].title)}</a></li>`).join('') || '<li class="muted">No comments yet.</li>'}</ul>
      <h3>Archives</h3><ul>${months.map(m => `<li><a href="/archive/${m}">${monthName(m)}</a> <span class="muted">(${perMonth[m].length})</span></li>`).join('')}</ul></div>
    <div><h3>About</h3><ul><li><a href="/blogs">${u.role === 'admin' ? 'Explore blogs' : 'My blogs'}</a></li><li><a href="https://www.stouras.com/" target="_blank" rel="noopener">stouras.com</a></li></ul></div>
  </div>`;
  $footer.querySelector('.widget-search').onsubmit = e => { e.preventDefault(); navigate('/posts' + filterQuery({q: e.target.q.value.trim()})); };
}

// ---------- cards ----------
// Cards, facets and search live in canvas.js. Pages render the string it returns;
// its own document-level listeners handle every filter interaction afterwards.
const canvas = (posts, o = {}) => { const labels = [...new Set(BLOGS.filter(b => (b.categories || []).length).map(b => b.categoryLabel || 'Category'))]; return renderCanvas(posts, {categories: allCategories(), categoryLabel: labels.length === 1 ? labels[0] : 'Category', blogs: BLOGS, ...o}); };
configurePlatform($app,canvas);

// ---------- pages ----------
async function home() {
  const u = user();
  if (!u) { await blogDirectory(); return; }   // the front door
  // A student lands on the blog of their module(s); everyone else on the directory
  // (or, in the local prototype, on one canvas of every sample post).
  if (u && rank(u.role) < 1) {
    const ids = [...new Set((await store.listMyModules()).map(m => m.blogId).filter(Boolean))];
    if (ids.length === 1) { navigate('/' + ids[0], {replace: true}); return; }
    if (ids.length > 1) { await myModules(); return; }
  }
  if (store.mode === 'firebase') { await blogDirectory(); return; }
  const [posts, modules] = await Promise.all([store.listPosts({status: 'published'}), store.listModules()]);
  $app.innerHTML = `${!u ? `<div class="notice info">Prototype running in <b>local mode</b>: posts and accounts live in this browser only. Use <b>View as</b> at the top right to try the student, instructor and admin experiences.</div>` : ''}
    ${canvas(posts, {modules})}`;
}
async function browse(f) {
  // One canvas across every blog. Category, organisation, year, tag, blog and module
  // filters are facets inside the canvas (read from the ?query); author and month
  // arrive as route parameters and narrow the set before it is drawn.
  const [all, modules] = await Promise.all([store.listPosts({status: 'published'}), store.listModules()]);
  let posts = all.sort(by('publishedAt')), title = 'All posts', sub = BLOGS.length > 1 ? 'Across every blog' : 'Published posts';
  if (f.author) { posts = posts.filter(p => p.authorId === f.author); title = posts[0]?.authorName || 'Author'; sub = 'Posts by'; }
  if (f.month) { posts = posts.filter(p => monthKey(p.publishedAt) === f.month); title = monthName(f.month); sub = 'Archive'; }
  $app.innerHTML = `<p class="page-sub" style="margin:0">${esc(sub)}</p><h1 class="page-title">${esc(title)}</h1>${canvas(posts, {modules, emptyText: f.author || f.month ? 'No published posts here.' : 'No posts have been published yet.'})}`;
}

// The article as readers see it: used by the post page and by the writer's preview.
const ICON = {
  heart: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z"/></svg>',
  comment: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12M7 9l5-5 5 5M5 15v4h14v-4"/></svg>',
};
// A friendly, author-only note when a post went live after the module deadline. Nobody else sees it;
// the deadline is informational and the public byline shows only the title, pen name and date.
function daysLate(p, module) {
  if (!module?.deadline || !p.publishedAt) return 0;
  const end = new Date(module.deadline + 'T23:59:59');   // the deadline day counts in full, in the reader's time zone
  return Math.max(0, Math.ceil((p.publishedAt - end.getTime()) / 86400000));
}
function lateNote(p, module, u) {
  if (!u || u.uid !== p.authorId || p.status !== 'published') return '';
  const n = daysLate(p, module);
  return n ? `<p class="notice late-note">Just so you know: this post went live ${n === 1 ? 'a day' : n + ' days'} after the module deadline of ${fmtDate(module.deadline)}. Only you can see this note.</p>` : '';
}
function articleHtml(p, {blog = null, words = null, likes = [], comments = 0, me = null, preview = false} = {}) {
  const w = words ?? (p.wordCount ?? wordCount(p.body || ''));
  const liked = !!me && likes.includes(me.uid);
  return `<header class="post-head">
    ${p.category ? `<div class="cat"><a href="${p.blogId ? '/' + esc(p.blogId) : '/posts'}?trend=${esc(p.category)}">${esc(catName(p.category, p))}</a></div>` : ''}
    <h1>${esc(p.title || 'Untitled')}</h1>
    ${p.excerpt ? `<p class="subtitle">${esc(p.excerpt)}</p>` : ''}
    <div class="byline"><span class="avatar">${esc((p.authorName || '?')[0].toUpperCase())}</span><div><a href="/author/${esc(p.authorId || '')}"><b>${esc(p.authorName || 'you')}</b></a>${p.organisation ? ` · ${esc(p.organisation)}` : ''}<br><span class="muted">${fmtDate(p.publishedAt || p.updatedAt || Date.now())} · ${readingTime(w)}${blog ? ` · <a href="/${esc(blog.id)}">${esc(blog.title)}</a>` : ''}</span></div></div>
    <div class="post-actions-row" role="group" aria-label="Post actions">
      <button type="button" class="react ${liked ? 'on' : ''}" data-like ${preview || p.status !== 'published' ? 'disabled' : ''} aria-pressed="${liked}" aria-label="Like">${ICON.heart}<span>${likes.length || ''}</span></button>
      <a class="react" href="#comments" data-comments aria-label="Comments">${ICON.comment}<span>${comments || ''}</span></a>
      <span class="grow"></span>
      <button type="button" class="react wide" data-share ${preview ? 'disabled' : ''}>${ICON.share}<span>Share</span></button>
    </div></header>
    ${p.featuredImage ? `<img class="hero" src="${esc(p.featuredImage)}" alt="">` : ''}
    <div class="body">${sanitize(p.body || '')}</div>
    ${(p.tags || []).length ? `<div class="tags">${p.tags.map(t => `<a href="${p.blogId ? '/' + esc(p.blogId) : '/posts'}?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>` : ''}`;
}
async function shareLink(url, title) {
  try { if (navigator.share) { await navigator.share({title, url}); return; } } catch { return; }
  try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch { try { prompt('Link to this post', url); } catch { toast(url); } }
}

async function postView(slug) {
  const p = await store.getPostBySlug(slug);
  const u = user();
  if (!p || (p.status !== 'published' && !(u && can(u, 'edit', p, S)))) { $app.innerHTML = `<p class="empty">That post is not available. <a href="/">Back to the blog</a></p>`; return; }
  const [module, blog, mine] = await Promise.all([p.moduleId ? store.getModule(p.moduleId) : null, store.getBlog(p.blogId), u ? store.listMyModules() : []]);
  // Cohort rules (approval, open/closed) come from the module; the comments policy from the blog.
  const context = {...S, ...(module || {}), allowComments: blog ? blog.allowComments !== false : true};
  const canParticipate = u && (store.mode !== 'firebase' || u.emailVerified) && (rank(u.role) >= 2 || (u.managedModuleIds || []).includes(p.moduleId) || (u.managedBlogIds || []).includes(p.blogId) || mine.some(m => m.id === p.moduleId || (p.blogId && m.blogId === p.blogId)));
  const all = (await store.listPosts({status: 'published', blogId: p.blogId})).sort(by('publishedAt', 1));
  const i = all.findIndex(x => x.id === p.id), prev = i > 0 ? all[i - 1] : null, next = i >= 0 && i < all.length - 1 ? all[i + 1] : null;
  const [comments, likes] = await Promise.all([store.listComments(p.id), store.listLikes(p.id)]);
  const words = wordCount(p.body);
  $app.innerHTML = `${blog ? `<p class="page-sub"><a href="/${esc(blog.id)}">${esc(blog.title)}</a>${module ? ` · ${esc(module.code || module.title)}${p.academicYear ? ' ' + esc(p.academicYear) : ''}` : ''}</p>` : ''}<article class="post">
    ${u && can(u, 'edit', p, context) ? `<div class="post-actions"><span class="badge ${p.status}">${p.status}</span><span class="muted">${words} words</span>
      <a class="btn small" href="/edit/${p.id}">Edit</a>
      ${p.status === 'published' && can(u, 'unpublish', p, context) ? `<button class="btn small" data-act="unpublish">Unpublish</button>` : ''}
      ${p.status !== 'published' && can(u, 'publish', p, context) ? `<button class="btn small primary" data-act="publish">Publish</button>` : ''}
      ${can(u, 'feature', p, context) ? `<button class="btn small" data-act="feature">${p.featured ? 'Unfeature' : 'Feature'}</button>` : ''}
      ${can(u, 'delete', p, S) ? `<button class="btn small danger" data-act="delete">Delete</button>` : ''}</div>` : ''}
    ${lateNote(p, module, u)}
    ${articleHtml(p, {blog, words, likes, comments: comments.length, me: u})}
    <div class="authorbox"><span class="avatar">${esc((p.authorName || '?')[0].toUpperCase())}</span><div>Written by <a href="/author/${esc(p.authorId)}"><b>${esc(p.authorName)}</b></a>${blog ? ` for the <a href="/${esc(blog.id)}">${esc(blog.title)}</a> blog` : ''}.<br><span class="muted">The author's open questions at the end are an invitation. Leave a comment.</span></div></div>
    <div class="prevnext"><span>${prev ? `<a href="${postPath(prev)}"><small>« Previous</small>${esc(prev.title)}</a>` : ''}</span><span style="text-align:right">${next ? `<a href="${postPath(next)}"><small>Next »</small>${esc(next.title)}</a>` : ''}</span></div>
    <section class="comments" id="comments"><h2>${comments.length ? `${comments.length} comment${comments.length === 1 ? '' : 's'}` : 'Leave a reply'}</h2>
      <div id="comment-list">${comments.map(c => commentHtml(c, u, p)).join('')}</div>
      ${context.allowComments === false ? '<p class="muted">Comments are closed.</p>' : canParticipate ? `<form class="reply"><textarea name="body" required maxlength="4000" placeholder="Add to the discussion as ${esc(u.penName)}…"></textarea><button class="btn primary">Post comment</button></form>` : u ? '<p class="muted">An invitation from this blog’s instructor is required to comment. <button class="linkish" id="invite-to-comment">Enter invitation code</button></p>' : `<p class="muted">You must be <button class="linkish" id="login-to-comment">logged in</button> with a module invitation to post a comment.</p>`}
    </section></article>`;
  $app.querySelector('#login-to-comment')?.addEventListener('click', () => store.mode === 'firebase' ? openAuthModal() : toast('Pick an account with "View as" at the top right.'));
  $app.querySelector('#invite-to-comment')?.addEventListener('click',()=>openAuthModal('register'));
  $app.querySelector('.reply')?.addEventListener('submit', async e => {
    e.preventDefault(); const body = e.target.body.value.trim(); if (!body) return;
    try { await store.addComment({postId: p.id, body}, u); toast('Comment posted.'); render(); } catch (err) { toast(err.message, 'error'); }
  });
  enhance($app.querySelector('.post .body'), {post: p, user: u, store});
  $app.querySelector('[data-share]').onclick = () => shareLink(publicUrl(postPath(p)), p.title);
  $app.querySelector('[data-like]').onclick = async e => {
    const b = e.currentTarget;
    if (!u) { store.mode === 'firebase' ? openAuthModal() : toast('Pick an account with "View as" at the top right.'); return; }
    try { const n = await store.toggleLike(p.id, u); b.classList.toggle('on', n.liked); b.setAttribute('aria-pressed', n.liked); b.querySelector('span').textContent = n.count || ''; } catch (err) { toast(err.message, 'error'); }
  };
  $app.onclick = async e => {
    const del = e.target.closest('[data-del-comment]');
    if (del && confirm('Delete this comment?')) { try { await store.deleteComment(del.dataset.delComment); } catch (err) { return toast(err.message, 'error'); } render(); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    try {
      if (act === 'delete') { if (!confirm('Delete this post permanently?')) return; try { await store.deletePost(p.id); } catch (err) { return toast(err.message, 'error'); } toast('Post deleted.'); navigate('/'); return; }
      if (act === 'unpublish') await store.savePost({...p, status: 'draft'}, u);
      if (act === 'publish') await store.savePost({...p, status: 'published'}, u);
      if (act === 'feature') await store.savePost({...p, featured: !p.featured}, u);
      toast('Updated.'); render();
    } catch (err) { toast(err.message, 'error'); }
  };
}
function commentHtml(c, u, p) {
  return `<div class="comment"><div class="who"><span class="avatar">${esc((c.authorName || '?')[0].toUpperCase())}</span><b>${esc(c.authorName)}</b> · ${fmtDateTime(c.createdAt)}${u && can(u, 'deleteComment', {...c, blogId: p?.blogId}, S) ? `<button class="linkish danger small" data-del-comment="${c.id}">Delete</button>` : ''}</div><p>${esc(c.body)}</p></div>`;
}

// ---------- the writer (laid out like Substack's post editor) ----------
document.addEventListener('click', e => { const pop = document.getElementById('info-pop'); if (pop && !pop.hidden && !e.target.closest('.info-wrap')) { pop.hidden = true; document.getElementById('post-info')?.setAttribute('aria-expanded', 'false'); } });
// Top bar: ‹ back · Saved chip … Preview · Continue. Toolbar. A centred column with
// Title, subtitle, byline and the text. Drafts autosave two seconds after a change.
// Continue opens the details step (featured image, category, organisation, tags,
// word target, checklist) whose button is Publish; Preview shows the post as readers
// see it on a phone or a desktop, with Share and Done.
async function editorView(id, moduleId) {
  const u = user();
  if (!u) { $app.innerHTML = `<p class="empty">Log in to write a post.</p>`; if (store.mode === 'firebase') openAuthModal(); return; }
  let p = id ? await store.getPost(id) : null;
  if (id && !p) { $app.innerHTML = `<p class="empty">That post does not exist.</p>`; return; }
  moduleId = p?.moduleId || moduleId;
  if (!moduleId) {
    // No module named: a student with one module goes straight to it, otherwise choose.
    const mine = (await store.listMyModules()).filter(m => m.blogId);
    if (mine.length === 1) { navigate('/write/' + mine[0].id, {replace: true}); return; }
    await myModules(); return;
  }
  const module = await store.getModule(moduleId);
  if (!module) { $app.innerHTML = '<p class="empty">Module not found.</p>'; return; }
  const blog = (await store.getBlog(module.blogId)) || {title: 'Blog', categories: [], checklist: []};
  const context = {...S, ...module, allowComments: blog.allowComments !== false};
  if (p && !can(u, 'edit', p, context)) { $app.innerHTML = `<p class="empty">You cannot edit this post.</p>`; return; }
  if (!p && !can(u, 'write', {moduleId, blogId: module.blogId}, context)) { $app.innerHTML = `<p class="empty">Submissions are closed for ${esc(module.title)}.</p>`; return; }
  if (store.mode === 'firebase' && !u.emailVerified) { $app.innerHTML='<p class="empty">Verify your sign-in email before writing. Use the account menu to resend or refresh verification.</p>';return; }
  if (!p && rank(u.role) < 1) {
    const joined = (await store.listMyModules()).some(m=>m.id===moduleId);
    if(!joined){$app.innerHTML=`<p class="empty">Join this module before writing. <a href="/${esc(module.blogId)}">Open the blog</a></p>`;return;}
  }
  p = p || {moduleId, title: '', body: '', category: '', organisation: '', tags: [], featuredImage: '', status: 'draft', excerpt: ''};
  const draft = {...p, title: p.title === 'Untitled draft' ? '' : (p.title || ''), tags: [...(p.tags || [])]};   // the placeholder title is for the database only
  const trackTime=store.mode==='firebase'&&rank(u.role)===0&&!u.preview&&(!p.authorId||p.authorId===u.uid);   // nothing is recorded while an instructor previews the writer
  if(trackTime&&!p.id){p.id=newId();draft.id=p.id;}
  const previousWritingSeconds=0;
  let writingTimer;
  const approver = can(u, 'approve', draft, context), needsReview = context.requireApproval && !approver;
  const hasCats = (blog.categories || []).length > 0, catLabel = blog.categoryLabel || 'Category', orgLabel = blog.organisationLabel || '';
  let dirty = false, saving = false, ed, saveTimer = null, revision = 0, pendingStatus = null;
  const targetText = blog.minWords && blog.maxWords ? `${blog.minWords}–${blog.maxWords}` : `up to ${blog.maxWords}`;
  liveView = 'editor';

  $app.innerHTML = `<div class="writer">
    <div class="writer-bar">
      <a class="icon-btn" href="/${esc(module.blogId)}" aria-label="Back to the blog" title="Back to the blog"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg></a>
      <span class="save-chip" id="save-chip" data-state="${id ? (draft.status === 'published' ? 'published' : 'saved') : 'new'}"><i></i><span>${id ? (draft.status === 'published' ? 'Published' : draft.status === 'pending' ? 'Submitted' : 'Saved') : 'New draft'}</span></span>
      <span class="grow"></span>
      <button type="button" class="btn ghost" id="preview">Preview</button>
      <button type="button" class="btn accent" id="continue">${draft.status === 'published' ? 'Update' : 'Continue'}</button>
    </div>
    <div id="editor"></div>
    <div class="writer-foot"><div class="info-wrap"><button type="button" class="icon-btn boxed" id="post-info" aria-label="Post info" title="Post info" aria-expanded="false"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg></button><div class="info-pop" id="info-pop" hidden></div></div><span class="wc-line" id="wc-line"></span><span class="grow"></span><button type="button" class="btn ghost small" id="details">Post details</button></div>
  </div>
  <dialog class="sheet" id="sheet"><form method="dialog" class="sheet-form" onsubmit="return false"><button type="button" class="close" data-close aria-label="Close">×</button>
    <h2>${draft.status === 'published' ? 'Update your post' : needsReview ? 'Submit for review' : 'Ready to publish?'}</h2>
    <p class="muted small">${esc(blog.title)} · ${esc(module.code || module.title)}${module.academicYear ? ' · ' + esc(module.academicYear) : ''}${module.deadline ? ' · deadline ' + fmtDate(module.deadline) : ''}</p>
    <div class="sheet-grid">
      <div>
        <h3>Featured image</h3>
        <img class="thumb-preview" id="thumb" src="${esc(draft.featuredImage || '')}" alt="" ${draft.featuredImage ? '' : 'hidden'}>
        <div class="actions"><button type="button" class="btn small" id="pick-image">Upload image</button><button type="button" class="btn small" id="remove-image" ${draft.featuredImage ? '' : 'hidden'}>Remove</button></div>
        <input type="file" id="image-file" accept="image/*" hidden>
        <p class="hint">Shown on the blog canvas and at the top of your post.</p>
        ${hasCats ? `<label class="field">${esc(catLabel)}<select id="category"><option value="">Choose…</option>${blog.categories.map(c => `<option value="${c.slug}" ${draft.category === c.slug ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
        ${orgLabel ? `<label class="field">${esc(orgLabel)}<input id="organisation" maxlength="120" value="${esc(draft.organisation || '')}" placeholder="e.g. Ryanair, UNICEF, the HSE"></label>` : ''}
        <label class="field">Tags<input id="tags" value="${esc(draft.tags.join(', '))}" placeholder="Climate Action, ESG, Supply Chain"><p class="hint">Comma-separated keywords readers browse by.</p></label>
      </div>
      <div>
        ${blog.maxWords ? `<h3>Length</h3><div class="wc"><span><b id="wc">0</b> words</span><span class="muted">target ${targetText}</span></div><div class="meter" id="meter"><i style="width:0"></i></div><p class="hint" id="wc-hint"></p>` : ''}
        ${(blog.checklist || []).length ? `<h3>Before you publish</h3><ul class="checklist">${blog.checklist.map((t, i) => `<li><input type="checkbox" id="chk${i}"><label for="chk${i}">${esc(t)}</label></li>`).join('')}</ul>` : ''}
        ${blog.brief ? `<p class="hint"><a href="/${esc(blog.id)}/brief" target="_blank">Read the brief</a></p>` : ''}
      </div>
    </div>
    <div class="actions sheet-actions"><button type="button" class="btn accent" id="publish">${draft.status === 'published' ? 'Update post' : needsReview ? 'Submit for review' : 'Publish'}</button><button type="button" class="btn" id="save-draft">${draft.status === 'published' ? 'Unpublish to draft' : 'Save draft'}</button><button type="button" class="btn ghost" data-close>Back to editing</button></div>
    <p class="status-line" id="status-line"></p></form></dialog>`;

  const $ = sel => document.getElementById(sel);
  const extras = blog.outline ? [{label: 'Insert the outline', run: api => { if (!api.isEmpty() && !confirm('Insert the outline at the end of what you have written?')) return; api.appendHTML(fillOutline(blog.outline, draft.organisation || 'the organisation', draft.category ? catName(draft.category, {blogId: blog.id}).toLowerCase() : 'the ' + (catLabel || 'topic').toLowerCase())); }}] : [];
  ed = mountEditor($('editor'), {html: draft.body, placeholder: 'Start writing…', extras, onChange: html => { draft.body = html; touched(); }});
  // Title, subtitle and byline sit between the toolbar and the text, as on Substack.
  const head = document.createElement('div'); head.className = 'writer-head';
  head.innerHTML = `<textarea class="w-title" id="title" rows="1" placeholder="Title" maxlength="160" aria-label="Title">${esc(draft.title)}</textarea>
    <textarea class="w-subtitle" id="excerpt" rows="1" placeholder="Add a subtitle…" maxlength="300" aria-label="Subtitle">${esc(draft.excerpt || '')}</textarea>
    <div class="w-byline"><span class="avatar">${esc((u.penName || '?')[0].toUpperCase())}</span><span><b>${esc(u.penName)}</b> · ${esc(module.code || module.title)} · ${esc(blog.title)}</span></div>`;
  $('editor').insertBefore(head, $('editor').querySelector('.surface'));
  const grow = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
  for (const t of [$('title'), $('excerpt')]) { grow(t); t.addEventListener('input', () => grow(t)); t.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); (t.id === 'title' ? $('excerpt') : ed).focus(); } }); }
  $('title').oninput = e => { draft.title = e.target.value; touched(); };
  $('excerpt').oninput = e => { draft.excerpt = e.target.value; touched(); };
  $('category') && ($('category').onchange = e => { draft.category = e.target.value; touched(); });
  $('organisation') && ($('organisation').oninput = e => { draft.organisation = e.target.value; touched(); });
  $('tags').onchange = e => { const seen = new Set(); draft.tags = e.target.value.split(/[,;]/).map(t => t.trim()).filter(t => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase())).slice(0, 12); e.target.value = draft.tags.join(', '); touched(); };
  $('pick-image').onclick = () => $('image-file').click();
  $('image-file').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { draft.featuredImage = await shrinkImage(f, 1400); $('thumb').src = draft.featuredImage; $('thumb').hidden = false; $('remove-image').hidden = false; touched(); } catch (err) { toast(err.message, 'error'); } };
  $('remove-image').onclick = () => { draft.featuredImage = ''; $('thumb').hidden = true; $('remove-image').hidden = true; touched(); };
  $('continue').onclick = $('details').onclick = () => { updateMeter(); $('status-line').textContent = ''; $('sheet').showModal(); };
  const settle = async () => { clearTimeout(saveTimer); while (saving) await new Promise(r => setTimeout(r, 100)); };
  $('save-draft').onclick = () => { const wasLive = draft.status === 'published'; settle().then(() => save(draft.status === 'pending' ? 'pending' : 'draft')).then(ok => { if (ok) { $('sheet').close(); toast(wasLive ? 'Saved as a draft; the post is no longer public.' : 'Draft saved.'); } }); };
  $('publish').onclick = () => {
    const words = wordCount(draft.body);
    if (!draft.title.trim()) return problem('Give your post a title first.', 'title');
    if (hasCats && !draft.category) return problem(`Choose the ${catLabel.toLowerCase()} your post is about.`);
    if (blog.minWords && words < blog.minWords * 0.5 && draft.status !== 'published' && !confirm(`Your post has only ${words} words; the target is ${blog.minWords}–${blog.maxWords}. Publish anyway?`)) return;
    const wasLive = draft.status === 'published';
    settle().then(() => save(needsReview ? 'pending' : 'published')).then(ok => { if (!ok) return; $('sheet').close(); if (draft.status === 'published') { toast(wasLive ? 'Updated.' : 'Published! Your post is live.'); navigate(postPath(draft)); } else { toast('Submitted for review.'); navigate('/mine'); } });
  };
  $('preview').onclick = () => showPreview();
  // Post info (characters, words, sentences, reading and speaking time), as on Substack.
  const fmtTime = secs => secs < 60 ? `${Math.max(1, Math.round(secs))}s` : `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
  $('post-info').onclick = () => {
    const pop = $('info-pop'), open = pop.hidden;
    if (!open) { pop.hidden = true; $('post-info').setAttribute('aria-expanded', 'false'); return; }
    const text = plainText(draft.body), words = wordCount(draft.body), sentences = (text.match(/[^.!?…]+[.!?…]+(\s|$)/g) || []).length || (text.trim() ? 1 : 0);
    const row = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
    pop.innerHTML = `<h4>Post info</h4>${row('Characters', text.length.toLocaleString('en-IE'))}${row('Words', words.toLocaleString('en-IE'))}${row('Sentences', sentences)}<hr>${row('Reading time', fmtTime(words / 220 * 60))}${row('Speaking time', fmtTime(words / 150 * 60))}${blog.maxWords ? `<hr>${row('Target', `${blog.minWords}–${blog.maxWords} words`)}${row('Remaining', words >= blog.minWords ? 'reached' : blog.minWords - words)}` : ''}`;
    pop.hidden = false; $('post-info').setAttribute('aria-expanded', 'true');
  };
  $('sheet').querySelectorAll('[data-close]').forEach(b => b.onclick = () => $('sheet').close());
  function problem(msg, focusId) { $('status-line').textContent = msg; if (focusId) { $('sheet').close(); $(focusId).focus(); } toast(msg, 'error'); }

  function chip(state, text) { const c = $('save-chip'); if (!c) return; c.dataset.state = state; c.querySelector('span').textContent = text; if (state === 'saved') { c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); } }
  function touched() {
    dirty = true; revision++; updateMeter();
    // Published posts are not edited live: changes wait for Update. Drafts autosave after 2 s.
    if (draft.status === 'published') { chip('unsaved', 'Unsaved changes'); return; }
    chip('unsaved', 'Unsaved'); clearTimeout(saveTimer); saveTimer = setTimeout(() => save(draft.status === 'pending' ? 'pending' : 'draft', true), 2000);
  }
  function updateMeter() {
    const w = wordCount(draft.body);
    $('wc-line').textContent = blog.maxWords ? `${w} words · target ${targetText}` : `${w} words`;
    if ($('wc')) {
      const m = $('meter'), pct = Math.min(100, w / blog.maxWords * 100);
      $('wc').textContent = w; m.querySelector('i').style.width = pct + '%';
      m.className = 'meter ' + (w > blog.maxWords ? 'over' : w >= blog.minWords ? 'ok' : '');
      $('wc-hint').textContent = w > blog.maxWords ? `${w - blog.maxWords} over the limit` : w >= blog.minWords ? 'Within the target range' : `${blog.minWords - w} more to reach the minimum`;
    }
  }
  updateMeter();
  async function save(status, quiet = false) {
    if (saving) { pendingStatus = status; return false; }   // queued: runs as soon as the current save lands
    saving = true; chip('saving', 'Saving…');
    const rev = revision; let ok = false;
    try {
      const saved = await store.savePost({...draft, id: p.id, status, title: draft.title.trim() || 'Untitled draft', excerpt: (draft.excerpt || '').trim()}, u);
      p = saved; Object.assign(draft, {id: saved.id, slug: saved.slug, status: saved.status, publishedAt: saved.publishedAt, updatedAt: saved.updatedAt, blogId: saved.blogId, academicYear: saved.academicYear}); if (revision === rev) dirty = false; ok = true;
      chip(status === 'published' ? 'published' : 'saved', status === 'published' ? 'Published' : status === 'pending' ? 'Submitted' : 'Saved');
      if (liveView !== 'editor') return ok;   // the save landed after the writer was left: nothing to repaint, and never rewrite another page's URL
      if ($('continue')) $('continue').textContent = status === 'published' ? 'Update' : 'Continue';
      if (!id && !route().startsWith('/edit/')) rewrite('/edit/' + saved.id);   // the new draft's own address, without re-rendering
      if ($('publish')) $('publish').textContent = draft.status === 'published' ? 'Update post' : needsReview ? 'Submit for review' : 'Publish';
      if ($('save-draft')) $('save-draft').textContent = draft.status === 'published' ? 'Unpublish to draft' : 'Save draft';
      if (revision !== rev) { chip('unsaved', 'Unsaved'); if (draft.status !== 'published') { clearTimeout(saveTimer); saveTimer = setTimeout(() => save(draft.status === 'pending' ? 'pending' : 'draft', true), 1500); } }
    } catch (e) { chip('error', 'Not saved'); toast(e.message, 'error'); }
    finally { saving = false; }
    if (pendingStatus) { const next = pendingStatus; pendingStatus = null; return save(next, true); }
    return ok;
  }
  // Preview: the post as readers will see it, on a phone or a desktop. The editor
  // is detached while the preview shows and put back untouched on Done.
  function showPreview() {
    const editorRoot = $app.firstElementChild, sheet = $('sheet');
    const words = wordCount(draft.body);
    const shell = document.createElement('div'); shell.className = 'preview-shell';
    shell.innerHTML = `<div class="preview-bar"><div class="seg" role="tablist"><button type="button" role="tab" data-dev="mobile" aria-selected="true">Mobile</button><button type="button" role="tab" data-dev="desktop" aria-selected="false">Desktop</button></div><span class="muted small">This is how readers will see your post.</span><span class="grow"></span><button type="button" class="btn ghost" id="pv-share">Share</button><button type="button" class="btn accent" id="pv-done">Done</button></div>
      <div class="preview-stage mobile"><div class="device"><div class="device-bar"><span>9:41</span><i></i><span>●●●</span></div><div class="device-chrome"><span class="dots"><i></i><i></i><i></i></span><span class="url">${esc(location.host + location.pathname)}</span></div><div class="device-screen"><div class="mini-mast">${esc(S.title)}</div><article class="post">${articleHtml({...draft, authorName: u.penName, authorId: u.uid, publishedAt: draft.publishedAt || Date.now()}, {blog, words, preview: true})}</article></div></div></div>`;
    $app.replaceChildren(shell, sheet);
    enhance(shell.querySelector('.post .body'), {preview: true, post: draft});
    shell.querySelectorAll('[data-dev]').forEach(b => b.onclick = () => { shell.querySelectorAll('[data-dev]').forEach(x => x.setAttribute('aria-selected', x === b)); shell.querySelector('.preview-stage').className = 'preview-stage ' + b.dataset.dev; });
    shell.querySelector('#pv-done').onclick = () => $app.replaceChildren(editorRoot, sheet);
    shell.querySelector('#pv-share').onclick = () => draft.status === 'published' && draft.slug ? shareLink(publicUrl(postPath(draft)), draft.title) : toast('Publish first, then share the public link.');
  }
  const leave = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  addEventListener('beforeunload', leave);
  const stop = () => { writingTimer?.stop();clearTimeout(saveTimer); removeEventListener('beforeunload', leave);removeEventListener('pagehide',stop); removeEventListener('routechange', stop); liveView = null; };
  addEventListener('routechange', stop);   // in-page anchors (#comments, #fn-3) change the hash, not the route, so they keep the editor
  addEventListener('pagehide',stop);
  if(trackTime)writingTimer=startWritingTimer({uid:u.uid,postId:p.id,moduleId,store,baseSeconds:previousWritingSeconds,isEditing:()=>!!document.getElementById('editor')});
}

// ---------- my posts ----------
async function mine() {
  const u = user();
  if (!u) { $app.innerHTML = `<p class="empty">Log in to see your posts.</p>`; return; }
  const posts = (await store.listPosts({authorId: u.uid})).sort(by('updatedAt'));
  $app.innerHTML = `<h1 class="page-title">My posts</h1><p class="page-sub">Writing as <b>${esc(u.penName)}</b>. <a href="/profile">Edit profile</a></p>
    <p class="actions"><a class="btn primary" href="/write">Write a new post</a><a class="btn" href="/my-modules">My modules</a></p>
    ${posts.length ? `<table class="list"><thead><tr><th>Title</th><th>Blog</th><th>Status</th><th>Words</th><th>Category</th><th>Updated</th><th></th></tr></thead><tbody>
      ${posts.map(p => `<tr><td><a href="/edit/${p.id}">${esc(p.title)}</a></td><td>${esc(blogOf(p)?.title || '')}</td><td><span class="badge ${p.status}">${p.status}</span></td><td>${wordCount(p.body)}</td><td>${esc(catName(p.category, p))}</td><td>${fmtDateTime(p.updatedAt)}</td>
        <td class="actions"><a href="/edit/${p.id}">Edit</a>${p.status === 'published' ? ` <a href="${postPath(p)}">View</a>` : ''}${can(u, 'delete', p, S) ? ` <button class="linkish danger" data-del="${p.id}">Delete</button>` : ''}</td></tr>`).join('')}</tbody></table>` : `<p class="empty">You have not written anything yet.</p>`}`;
  $app.onclick = async e => { const b = e.target.closest('[data-del]'); if (b && confirm('Delete this post?')) { try { await store.deletePost(b.dataset.del); } catch (err) { return toast(err.message, 'error'); } toast('Deleted.'); mine(); } };
}

async function profileView() {
  const u = user();
  if (!u) { $app.innerHTML = `<p class="empty">Log in to edit your profile.</p>`; return; }
  const student = u.registrationKind !== 'teacher' && u.registrationKind !== 'instructor' && u.role === 'student';
  const f = (name, label, hint = '', type = 'text') => `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(u[name] || '')}" maxlength="${name === 'studentId' ? 40 : 120}" ${student && (name === 'studentId' || name === 'contactEmail' || name === 'firstName' || name === 'lastName' || name === 'affiliation') ? 'required' : ''}>${hint ? `<p class="hint">${hint}</p>` : ''}</label>`;
  if (u.preview) { $app.innerHTML = `<p class="empty">Your profile is not part of a preview. <button class="btn small" data-exit-preview>Return to your own view</button></p>`; return; }
  $app.innerHTML = `<div class="guide"><p class="page-sub crumb"><a href="/my-modules">My modules</a></p><h1 class="page-title">Your profile</h1><p class="page-sub">Role: <b>${esc(roleLabel(u.role))}</b>${u.email ? ` · signed in as ${esc(u.email)}` : ''}</p>
    <form id="profile" class="two-col">
      <div>${rank(u.role) >= 1 ? f('penName', 'Pen name', 'Shown on your posts and comments.') : `<label class="field">Alias<input value="${esc(u.penName || '')}" disabled><p class="hint">Assigned at random when your account was created and shown on your posts and comments instead of your name. It cannot be changed, so classmates cannot identify you; your instructor alone sees who is behind it.</p></label>`}${f('firstName', 'First name')}${f('lastName', 'Last name')}</div>
      <div>${f('contactEmail', 'University email', 'Your university contact address, separate from your Google sign-in email.', 'email')}${u.registrationKind !== 'teacher' && u.role === 'student' ? f('studentId', 'University ID', 'Seen only by you and your module teachers.') : ''}${f('affiliation', 'School / university')}${f('website', 'Website (optional)', '', 'url')}<label class="field">LinkedIn profile (optional)<span class="field-row"><input name="linkedin" value="${esc(u.linkedin || '')}" maxlength="200" placeholder="linkedin.com/in/your-name" autocomplete="off"><button type="button" class="btn small" id="linkedin-btn">${u.linkedin ? 'Open profile' : 'Connect LinkedIn'}</button></span><p class="hint">Connect opens your own LinkedIn profile in a new tab: copy its address into this field and save. Once saved, the button opens your profile.</p></label><label class="field">Short bio (optional)<textarea name="bio" maxlength="400" rows="3">${esc(u.bio || '')}</textarea></label></div>
      <div class="actions"><button class="btn primary">Save profile</button></div></form></div>`;
  const badLinkedin = () => toast('That is not a LinkedIn profile address. It should look like linkedin.com/in/your-name.', 'error');
  const li = $app.querySelector('[name=linkedin]'), liBtn = $app.querySelector('#linkedin-btn');
  li.oninput = () => { liBtn.textContent = li.value.trim() ? 'Open profile' : 'Connect LinkedIn'; };
  liBtn.onclick = () => {   // with an address: open that profile; without one: LinkedIn's own shortcut to the signed-in member's profile, to copy the address from
    const url = linkedinUrl(li.value); if (url === null) return badLinkedin();
    if (url) li.value = url;
    window.open(url || 'https://www.linkedin.com/in/me/', '_blank', 'noopener');
  };
  document.getElementById('profile').onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    d.linkedin = linkedinUrl(d.linkedin); if (d.linkedin === null) return badLinkedin();
    if (rank(u.role) >= 1) { d.penName = (d.penName || '').trim().replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 24); if (!d.penName) return toast('Choose a pen name.', 'error'); } else delete d.penName;   // students keep their generated alias
    try { await store.saveProfile(u.uid, d); toast('Profile saved.'); renderHeader(); } catch (err) { toast(err.message, 'error'); }
  };
}

// ---------- instructor area ----------
// Posts, review queue, comments and roster for the modules an instructor teaches and
// the blogs they own, narrowed by blog, module and academic year (?blog=&module=&year=).
async function lecturer(tab = 'posts', query = '') {
  const u = user();
  const q = new URLSearchParams(query || ''), moduleId = q.get('module') || '', blogId = q.get('blog') || '', year = q.get('year') || '';
  if (!u || rank(u.role) < 1) { $app.innerHTML = `<p class="empty">Instructor access required.</p>`; return; }
  const canRoster = !moduleId || u.role === 'admin' || (u.managedModuleIds || []).includes(moduleId);   // blog owners see posts of guest modules, not their rosters
  tab = tab || 'posts';
  const liveRoster = tab === 'roster' && store.mode === 'firebase';   // the live roster and invitation records (people.js) load their own data
  let [posts, users, allModules] = await Promise.all([store.listAllPosts(), canRoster && !liveRoster ? store.listUsers(moduleId) : Promise.resolve([]), store.listModules()]);
  const teachingModules = allModules.filter(m => u.role === 'admin' || m.teacherIds.includes(u.uid) || (u.managedBlogIds || []).includes(m.blogId));
  const myBlogs = BLOGS.filter(b => u.role === 'admin' || b.teacherIds.includes(u.uid) || teachingModules.some(m => m.blogId === b.id));
  const modOf = id => allModules.find(m => m.id === id);
  const years = [...new Set(posts.map(p => p.academicYear).filter(Boolean))].sort().reverse();
  const scope = posts.filter(p => (!blogId || p.blogId === blogId) && (!moduleId || p.moduleId === moduleId));
  posts = scope.filter(p => !year || p.academicYear === year);
  const qs = patch => { const o = {blog: blogId, module: moduleId, year, ...patch}; const s = new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString(); return s ? '?' + s : ''; };
  const who = Object.fromEntries(users.map(x => [x.uid, x]));
  const real = uid => { const x = who[uid]; return x ? `${esc([x.firstName, x.lastName].filter(Boolean).join(' ') || '—')}${x.studentId ? ` <span class="muted">${esc(x.studentId)}</span>` : ''}` : '<span class="muted">unknown</span>'; };
  const pending = posts.filter(p => p.status === 'pending');
  const tabs = `<nav class="tabs" aria-label="Instructor area"><a href="/review/posts${qs({})}" class="${tab === 'posts' ? 'active' : ''}">All posts (${posts.length})</a><a href="/review/queue${qs({})}" class="${tab === 'queue' ? 'active' : ''}">Review queue (${pending.length})</a><a href="/review/comments${qs({})}" class="${tab === 'comments' ? 'active' : ''}">Comments</a><a href="/review/roster${qs({})}" class="${tab === 'roster' ? 'active' : ''}">Roster${liveRoster ? '' : ` (${users.length})`}</a></nav>`;
  const stats = `<div class="stats"><div class="stat"><b>${posts.filter(p => p.status === 'published').length}</b><span>published</span></div><div class="stat"><b>${posts.filter(p => p.status === 'draft').length}</b><span>drafts</span></div><div class="stat"><b>${pending.length}</b><span>awaiting review</span></div><div class="stat"><b>${users.filter(x => x.role === 'student' || !x.role).length}</b><span>students</span></div><div class="stat"><b>${Math.round(posts.filter(p => p.status === 'published').reduce((s, p) => s + (wordCount(p.body)), 0) / Math.max(1, posts.filter(p => p.status === 'published').length))}</b><span>avg words</span></div></div>`;
  // Posts per module and academic year, for the whole scope (before the year filter).
  const cells = groupBy(scope, p => (p.moduleId || '?') + '|' + (p.academicYear || '—'));
  const summaryYears = [...new Set(scope.map(p => p.academicYear || '—'))].sort().reverse();
  const summaryModules = [...new Set(scope.map(p => p.moduleId))];
  const summary = summaryModules.length ? `<table class="list compact"><thead><tr><th>Posts by module and year</th>${summaryYears.map(y => `<th><a href="/review/${tab}${qs({year: y === '—' ? '' : y})}">${esc(y)}</a></th>`).join('')}<th>Total</th></tr></thead><tbody>${summaryModules.map(mid => { const m = modOf(mid); return `<tr><td><a href="/review/${tab}${qs({module: mid})}">${esc(m ? [m.code, m.title].filter(Boolean).join(' ') : mid)}</a></td>${summaryYears.map(y => `<td>${(cells[mid + '|' + y] || []).filter(p => p.status === 'published').length}<span class="muted small"> / ${(cells[mid + '|' + y] || []).length}</span></td>`).join('')}<td><b>${scope.filter(p => p.moduleId === mid && p.status === 'published').length}</b><span class="muted small"> / ${scope.filter(p => p.moduleId === mid).length}</span></td></tr>`; }).join('')}</tbody></table><p class="hint">published / all posts</p>` : '';
  let body = '';
  const row = p => { const m = modOf(p.moduleId); return `<tr><td>${p.featured ? '<span class="badge featured">★</span>' : ''}<a href="${p.status === 'published' ? postPath(p) : '/edit/' + p.id}">${esc(p.title)}</a><br><span class="muted small">${esc(p.organisation || '')}</span></td><td><b>${esc(p.authorName)}</b><br><span class="small">${real(p.authorId)}</span></td><td>${esc(m?.code || m?.title || '')}<br><span class="muted small">${esc(p.academicYear || '')}</span></td><td><span class="badge ${p.status}">${p.status}</span></td><td>${wordCount(p.body)}</td><td>${esc(catName(p.category, p))}</td><td>${fmtDate(p.publishedAt || p.updatedAt)}</td>
    <td class="actions"><a href="/edit/${p.id}">Edit</a>${p.status !== 'published' ? ` <button class="linkish" data-act="publish" data-id="${p.id}">${p.status === 'pending' ? 'Approve' : 'Publish'}</button>` : ` <button class="linkish" data-act="unpublish" data-id="${p.id}">Unpublish</button>`} <button class="linkish" data-act="feature" data-id="${p.id}">${p.featured ? 'Unfeature' : 'Feature'}</button>${rank(u.role) >= 2 ? ` <button class="linkish danger" data-act="delete" data-id="${p.id}">Delete</button>` : ''}</td></tr>`; };
  const table = list => list.length ? `<table class="list"><thead><tr><th>Post</th><th>Pen name / student</th><th>Module · year</th><th>Status</th><th>Words</th><th>Category</th><th>Date</th><th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>` : '<p class="empty">Nothing here.</p>';
  if (tab === 'posts') body = summary + `<p class="actions"><button class="btn small" id="export-csv">Download CSV (posts + authors)</button><span class="muted small">For grading and for assigning peer reviews. The CSV follows the filters above.</span></p>` + table([...posts].sort(by('updatedAt')));
  if (tab === 'queue') body = '<p class="muted">Posts submitted for review. Approval is switched on per module in its settings.</p>' + table(pending);
  if (tab === 'comments') { const cs = (await store.recentComments(500)).filter(c=>posts.some(p=>p.id===c.postId)); const byId = Object.fromEntries(posts.map(p => [p.id, p])); body = cs.length ? cs.map(c => `<div class="comment"><div class="who"><b>${esc(c.authorName)}</b> <span class="small">(${real(c.authorId)})</span> · ${fmtDateTime(c.createdAt)} · on <a href="${byId[c.postId] ? postPath(byId[c.postId]) : '#'}">${esc(byId[c.postId]?.title || '?')}</a><button class="linkish danger small" data-del-comment="${c.id}">Delete</button></div><p>${esc(c.body)}</p></div>`).join('') : '<p class="empty">No comments yet.</p>'; }
  if (tab === 'roster' && !liveRoster && blogId && !moduleId && canRoster) { const lists = await Promise.all(teachingModules.filter(m => m.blogId === blogId && (u.role === 'admin' || (u.managedModuleIds || []).includes(m.id))).map(m => store.listUsers(m.id))); users = [...new Map(lists.flat().map(x => [x.uid, x])).values()]; }
  if (tab === 'roster' && !liveRoster) { users = users.filter(x => rank(x.role || 'student') === 0); const count = groupBy(posts, p => p.authorId); body = `<table class="list sortable"><thead><tr><th>Pen name</th><th>Name</th><th>Student no.</th><th>E-mail</th><th>Programme</th><th>Role</th><th>Posts</th></tr></thead><tbody>${users.sort((a, b) => rank(b.role) - rank(a.role) || (a.penName || '').localeCompare(b.penName || '')).map(x => `<tr><td><b>${esc(x.penName || '—')}</b></td><td>${esc([x.firstName, x.lastName].filter(Boolean).join(' '))}</td><td>${esc(x.studentId || '')}</td><td>${esc(x.email || x.contactEmail || '')}</td><td>${esc(x.affiliation || '')}</td><td>${esc(roleLabel(x.role || 'student'))}</td><td>${(count[x.uid] || []).filter(p => p.status === 'published').length} / ${(count[x.uid] || []).length}</td></tr>`).join('')}</tbody></table>`; }
  const sel = (id, label, rows, value, all) => `<label class="field">${label}<select id="${id}"><option value="">${all}</option>${rows.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  $app.innerHTML = `<div class="area-head"><h1 class="page-title">Instructor area</h1><p class="page-sub">Posts, review queue, comments and rosters for your modules, by blog, module and academic year.</p>
    <div class="review-filters">${sel('review-blog', 'Blog', myBlogs.map(b => [b.id, b.title]), blogId, 'All my blogs')}${sel('review-module', 'Module', teachingModules.filter(m => !blogId || m.blogId === blogId).map(m => [m.id, [m.code, m.title].filter(Boolean).join(' ') + (m.academicYear ? ` (${m.academicYear})` : '')]), moduleId, 'All modules')}${sel('review-year', 'Academic year', years.map(y => [y, y]), year, 'All years')}</div>
    ${tabs}</div><div class="area-body">${liveRoster ? '' : stats + body}</div>`;
  const go = patch => { navigate('/review/' + tab + qs(patch)); };
  $app.querySelector('#review-blog').onchange = e => go({blog: e.target.value, module: ''});
  $app.querySelector('#review-module').onchange = e => go({module: e.target.value});
  $app.querySelector('#review-year').onchange = e => go({year: e.target.value});
  if (liveRoster) {   // drawn by people.js under the area head, so the tabs and filters stay in place
    const area = $app.querySelector('.area-body');
    if (!canRoster) { area.innerHTML = '<p class="empty">This module writes on your blog, but its roster is private to its own instructor.</p>'; return; }
    await renderPeople(area, {moduleId, admin: false, embedded: true, moduleFilter: false}); return;
  }
  if (tab === 'roster') makeTablesSortable($app);
  $app.querySelector('#export-csv')?.addEventListener('click', () => {
    const esc2 = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['Title', 'URL', 'Pen name', 'First name', 'Last name', 'Student no.', 'E-mail', 'Blog', 'Module code', 'Module', 'Academic year', 'Status', 'Words', 'Category', 'Organisation', 'Published']].concat(posts.map(p => { const x = who[p.authorId] || {}, m = modOf(p.moduleId); return [p.title, publicUrl(postPath(p)), p.authorName, x.firstName, x.lastName, x.studentId, x.email || x.contactEmail, blogOf(p)?.title || p.blogId, m?.code, m?.title, p.academicYear, p.status, wordCount(p.body), catName(p.category, p), p.organisation, p.publishedAt ? new Date(p.publishedAt).toISOString().slice(0, 10) : '']; }));
    const blob = new Blob([rows.map(r => r.map(esc2).join(',')).join('\n')], {type: 'text/csv'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ucd-blog-posts${moduleId ? '-' + moduleId : ''}${year ? '-' + year.replace('/', '-') : ''}.csv`; a.click();
  });
  $app.onclick = async e => {
    const del = e.target.closest('[data-del-comment]'); if (del && confirm('Delete this comment?')) { try { await store.deleteComment(del.dataset.delComment); } catch (err) { return toast(err.message, 'error'); } return lecturer(tab, query); }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const p = posts.find(x => x.id === b.dataset.id); if (!p) return;
    try {
      if (b.dataset.act === 'delete') { if (!confirm(`Delete "${p.title}" permanently?`)) return; try { await store.deletePost(p.id); } catch (err) { return toast(err.message, 'error'); } }
      if (b.dataset.act === 'publish') await store.savePost({...p, status: 'published'}, u);
      if (b.dataset.act === 'unpublish') await store.savePost({...p, status: 'draft'}, u);
      if (b.dataset.act === 'feature') await store.savePost({...p, featured: !p.featured}, u);
      toast('Updated.'); lecturer(tab, query);
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ---------- admin area ----------
// Every admin page is drawn under one head (the title and the tab strip), so the
// tabs stay in place whichever page is open and every other page is one click away.
const ADMIN_TABS = [['guide', 'Admin guide'], ['people', 'People'], ['grading', 'AI grading'], ['feedback', 'Feedback'], ['modules', 'Manage modules'], ['settings', 'Site settings'], ['data', 'Data & backend']];
async function admin(tab = 'users', moduleId = '') {
  const u = user();
  if (!u || rank(u.role) < 2) { $app.innerHTML = `<p class="empty">Admin access required.</p>`; return; }
  if (tab === 'users') { navigate('/admin/people', {replace: true}); return; }   // roles are set on the People page now
  const open = tab === 'invite' ? 'people' : tab;   // /admin/invite: the People page with the invitation form open
  if (!ADMIN_TABS.some(([id]) => id === open)) { navigate('/admin/people', {replace: true}); return; }
  $app.innerHTML = `<div class="area-head"><h1 class="page-title">Admin area</h1><p class="page-sub">Everything an instructor can do, plus roles, site settings and the backend.</p>
    <nav class="tabs" aria-label="Admin area">${ADMIN_TABS.map(([id, label]) => `<a href="/admin/${id}" class="${open === id ? 'active' : ''}">${label}</a>`).join('')}</nav></div><div class="area-body"></div>`;
  const area = $app.querySelector('.area-body');
  if (open === 'people') {
    // One page for people: everyone who has signed in (with their role), the invitation
    // form, every invitation with who sent it, and the writing-time records.
    area.innerHTML = `${pageHead('People', 'Everyone who has signed in and their roles, every instructor and student invitation, and each student’s writing time. Instructors see only their own modules, in the Instructor area.', true)}
      <details class="invite-box" ${tab === 'invite' ? 'open' : ''}><summary>Invite an instructor</summary><div class="invite-body"></div></details><div class="people-body"></div>`;
    await invitationsPage(area.querySelector('.invite-body'), true, {heading: false});
    const people = area.querySelector('.people-body');
    if (store.mode === 'firebase') { await renderPeople(people, {moduleId, admin: true, embedded: true, roles: true}); return; }
    const users = (await store.listUsers()).sort((a, b) => rank(b.role) - rank(a.role) || (a.penName || '').localeCompare(b.penName || ''));
    people.innerHTML = `<h2>Registered users (${users.length})</h2><p class="muted small">Invitation and sign-in records exist only on the live platform. Change a role in the Role column; you cannot change your own.</p>
      <table class="list"><thead><tr><th>Pen name</th><th>Name</th><th>E-mail</th><th>Programme</th><th>Role</th></tr></thead><tbody>${users.map(x => `<tr><td><b>${esc(x.penName || '—')}</b></td><td>${esc([x.firstName, x.lastName].filter(Boolean).join(' '))}</td><td>${esc(x.email || x.contactEmail || '')}</td><td>${esc(x.affiliation || '')}</td><td><select data-role="${x.uid}" ${x.uid === u.uid ? 'disabled title="You cannot change your own role."' : ''}>${ROLES.map(r => `<option value="${r}" ${(x.role || 'student') === r ? 'selected' : ''}>${roleLabel(r)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>`;
    people.querySelectorAll('[data-role]').forEach(sel => sel.onchange = async () => { try { await store.setRole(sel.dataset.role, sel.value); toast('Role updated.'); } catch (e) { toast(e.message, 'error'); } });
    return;
  }
  if (tab === 'grading') { liveView = 'grading'; await renderGrading(area, {moduleId, embedded: true}); return; }   // like the editor: a store notification must not rebuild the page mid-batch
  if (tab === 'feedback') { area.innerHTML = `${pageHead('Feedback inbox', 'What visitors, students and instructors sent with the Feedback button: notes, screenshots and voice notes.', true)}<div id="fb-inbox"></div>`; await renderFeedbackInbox(area.querySelector('#fb-inbox')); return; }
  if (tab === 'modules') { await myModules(area, true); return; }
  let body = '';
  if (tab === 'guide') body = `<div class="admin-guide">${store.mode === 'firebase' ? sanitize(await store.getAdminGuide()) : pageHead('Admin guide', '', true) + '<p>The private admin guide is available on the live Firebase platform.</p>'}</div>`;
  if (tab === 'settings') {
    body = `${pageHead('Site settings', 'The masthead of the whole site. Everything else is set per blog or per module.', true)}<form id="settings" class="two-col">
      <div><label class="field">Blog title (masthead)<input name="title" value="${esc(S.title)}" maxlength="120"></label>
      <label class="field">Tagline<input name="tagline" value="${esc(S.tagline)}" maxlength="160"></label></div>
      <div><p class="muted">Everything about an exercise (the brief, categories such as megatrends, the word target, the outline, the checklist and whether comments are open) is set per blog in <b>Blog settings</b>. Deadlines, approval and open/closed submissions are set per module in <b>Module settings</b>. <a href="/admin/modules">Manage modules</a>.</p></div>
      <div class="actions"><button class="btn primary">Save settings</button></div></form>`;
  }
  if (tab === 'data') {
    body = `${pageHead('Data & backend', 'Where the data lives, and a full export.', true)}<div class="two-col"><div class="panel" style="border:1px solid var(--line);border-radius:8px;padding:14px"><h3>Backend</h3>
      <p>Mode: <b>${store.mode === 'firebase' ? 'Firebase (live)' : 'Local prototype'}</b></p>
      ${store.mode === 'local' ? `<p class="muted small">Posts, comments and accounts live in this browser's storage. To go live for the class, create the Firebase project and paste its config into <code>firebase-config.js</code>, then deploy <code>firestore.rules</code>. Steps in <code>_SETUP-FIREBASE.md</code>.</p>` : `<p class="muted small">Security rules live in <code>firestore.rules</code>; the admin is the verified e-mail named there.</p>`}
      </div><div class="panel" style="border:1px solid var(--line);border-radius:8px;padding:14px"><h3>Data</h3>
      <p class="actions"><button class="btn small" id="export-json">Download everything as JSON</button>${store.mode === 'local' ? `<button class="btn small danger" id="reset-demo">Reset sample data</button>` : ''}</p></div></div>`;
  }
  area.innerHTML = body;
  $app.querySelector('#settings')?.addEventListener('submit', async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    const patch = {title: d.title.trim(), tagline: d.tagline.trim()};
    try { S = await store.saveSettings(patch); toast('Settings saved.'); renderHeader(); } catch (err) { toast(err.message, 'error'); }
  });
  $app.querySelector('#export-json')?.addEventListener('click', async () => { const blob = new Blob([JSON.stringify(await store.exportAll(), null, 2)], {type: 'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ucd-blog-export.json'; a.click(); });
  $app.querySelector('#reset-demo')?.addEventListener('click', async () => { if (confirm('Replace everything in this browser with the sample data?')) { await store.resetDemo(); S = store.settings(); toast('Sample data restored.'); if (!navigate('/')) render(); } });
}

// ---------- boot ----------
(async () => {
  try { await initStore(); S = store.settings(); }
  catch (e) { $app.innerHTML = `<p class="empty">The blog could not start: ${esc(e.message)}</p>`; return; }
  store.onChange(() => { S = store.settings(); renderHeader(); if (!liveView) render(); });
  startRouter(render);
  mountFeedbackButton();
  render();
})();
