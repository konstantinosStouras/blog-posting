// Router + every page. Hash routes so the site works from any static host (stouras.com/ucd-blog/).
import {initStore, store} from './store.js';
import {renderAccountControl, currentUser, openAuthModal, roleLabel} from './auth.js';
import {can, ROLES, rank} from './permissions.js';
import {mountEditor, OUTLINE} from './editor.js';
import {configurePlatform, moduleDirectory, moduleCanvas, manageModule, invitationsPage, acceptInvitationPage, studentInvitationsPage} from './platform.js';
import {esc, fmtDate, fmtDateTime, monthKey, monthName, postPath, sanitize, wordCount, excerptOf, readingTime, by, groupBy, toast, shrinkImage, slugify} from './util.js';

const $app = document.getElementById('app'), $header = document.getElementById('site-header'), $footer = document.getElementById('site-footer');
let S;                      // site settings
let liveView = null;        // the mounted view, when it must not be re-rendered on data changes (the editor)
const catName = slug => (S.categories.find(c => c.slug === slug) || {}).name || slug;
const user = () => currentUser();

const routes = [
  [/^\/?$/, home],
  [/^\/modules$/, () => moduleDirectory(false)],
  [/^\/posts$/, () => browse({})],
  [/^\/my-modules$/, () => moduleDirectory(true)],
  [/^\/module\/([a-z0-9-]+)$/, moduleCanvas],
  [/^\/modules\/new$/, () => manageModule(null)],
  [/^\/modules\/edit\/([a-z0-9-]+)$/, manageModule],
  [/^\/modules\/invite\/([a-z0-9-]+)$/, studentInvitationsPage],
  [/^\/invitations$/, invitationsPage],
  [/^\/invite\/([a-zA-Z0-9-]+)(?:\/([a-z]+))?$/i, (id,code)=>acceptInvitationPage(id,code,'instructor')],
  [/^\/join\/([a-zA-Z0-9-]+)\/([a-z]+)$/i, (id,code)=>acceptInvitationPage(id,code,'student')],
  [/^\/(\d{4})\/(\d{2})\/([^/]+)\/?$/, (y, m, slug) => postView(slug)],
  [/^\/post\/([^/]+)$/, postView],
  [/^\/category\/([^/]+)$/, slug => browse({category: slug})],
  [/^\/tag\/([^/]+)$/, tag => browse({tag: decodeURIComponent(tag)})],
  [/^\/author\/([^/]+)$/, uid => browse({author: uid})],
  [/^\/archive\/(\d{4}-\d{2})$/, month => browse({month})],
  [/^\/search\/?(.*)$/, q => browse({q: decodeURIComponent(q || '')})],
  [/^\/challenge$/, guide],
  [/^\/write$/, () => editorView(null)],
  [/^\/write\/([a-z0-9-]+)$/, moduleId => editorView(null,moduleId)],
  [/^\/edit\/([^/]+)$/, editorView],
  [/^\/mine$/, mine],
  [/^\/profile$/, profileView],
  [/^\/review\/?([a-z]*)(?:\?module=([a-z0-9-]+))?$/, lecturer],
  [/^\/admin\/?([a-z]*)$/, admin],
];

// Renders run one after another: a slow page (waiting for the database) must not
// finish AFTER a later navigation and paint over it.
let queue = Promise.resolve();
function render() { queue = queue.then(doRender).catch(e => console.error(e)); return queue; }
async function doRender() {
  const path = location.hash.replace(/^#/, '') || '/';
  liveView = null;
  renderHeader(path);
  window.scrollTo(0, 0);
  for (const [re, fn] of routes) { const m = path.match(re); if (m) { try { await fn(...m.slice(1)); } catch (e) { console.error(e); $app.innerHTML = `<p class="empty">Something went wrong: ${esc(e.message)}</p>`; } renderFooter(); return; } }
  $app.innerHTML = `<p class="empty">That page does not exist. <a href="#/">Back to the blog</a></p>`; renderFooter();
}

// ---------- header & footer ----------
function renderHeader(path = location.hash.slice(1) || '/') {
  const u = user();
  const active = h => (h === '/' ? path === '/' : path.startsWith(h)) ? 'active' : '';
  $header.innerHTML = `<div class="brand"><h1><a href="#/">${esc(S.title)}</a></h1><div class="account" id="account"></div></div>
  <hr class="rule">
  <div class="sub"><p class="tagline">${esc(S.tagline)}</p>
    <nav><a href="#/modules" class="${active('/modules')}">Explore modules</a><a href="#/posts" class="${active('/posts')}">All posts</a><a href="#/challenge" class="${active('/challenge')}">The challenge</a>
      ${u ? `<a href="#/my-modules" class="${active('/my-modules')}">My modules</a>` : ''}
      ${u ? `<a href="#/write" class="${active('/write')}">Write</a><a href="#/mine" class="${active('/mine')}">My posts</a>` : ''}
      ${u && rank(u.role) >= 1 ? `<a href="#/review" class="${active('/review')}">Instructor</a>` : ''}
      ${u && rank(u.role) >= 2 ? `<a href="#/admin" class="${active('/admin')}">Admin</a>` : ''}
      <form class="searchbox" role="search"><input name="q" placeholder="Search posts" aria-label="Search posts"><button aria-label="Search">⌕</button></form>
    </nav></div><hr class="thin">`;
  renderAccountControl($header.querySelector('#account'));
  $header.querySelector('.searchbox').onsubmit = e => { e.preventDefault(); location.hash = '#/search/' + encodeURIComponent(e.target.q.value.trim()); };
}
async function renderFooter() {
  const [posts, comments] = await Promise.all([store.listPosts({status: 'published'}), store.recentComments(5)]);
  posts.sort(by('publishedAt'));
  const byPost = Object.fromEntries(posts.map(p => [p.id, p]));
  const perMonth = groupBy(posts, p => monthKey(p.publishedAt));
  const months = Object.keys(perMonth).sort().reverse();
  const cats = groupBy(posts, p => p.category);
  $footer.innerHTML = `<div class="inner">
    <div><form class="widget-search" role="search"><input name="q" placeholder="Search" aria-label="Search"><button>Search</button></form>
      <h3>Recent posts</h3><ul>${posts.slice(0, 5).map(p => `<li><a href="${postPath(p)}">${esc(p.title)}</a></li>`).join('') || '<li class="muted">Nothing published yet.</li>'}</ul>
      <p class="colophon">${esc(S.module)} · ${esc(S.challenge)}<br>Posts stay public so classmates can read and review them. Mode: ${store.mode === 'firebase' ? 'live database' : 'local prototype (this browser only)'}.</p></div>
    <div><h3>Recent comments</h3><ul>${comments.filter(c => byPost[c.postId]).map(c => `<li><b>${esc(c.authorName)}</b> on <a href="${postPath(byPost[c.postId])}">${esc(byPost[c.postId].title)}</a></li>`).join('') || '<li class="muted">No comments yet.</li>'}</ul>
      <h3>Archives</h3><ul>${months.map(m => `<li><a href="#/archive/${m}">${monthName(m)}</a> <span class="muted">(${perMonth[m].length})</span></li>`).join('')}</ul></div>
    <div><h3>Categories</h3><ul>${S.categories.map(c => `<li><a href="#/category/${c.slug}">${esc(c.name)}</a> <span class="muted">(${(cats[c.slug] || []).length})</span></li>`).join('')}</ul>
      <h3>Class blog</h3><ul><li><a href="#/challenge">How the PM Challenge works</a></li><li><a href="https://www.stouras.com/" target="_blank" rel="noopener">stouras.com</a></li></ul></div>
  </div>`;
  $footer.querySelector('.widget-search').onsubmit = e => { e.preventDefault(); location.hash = '#/search/' + encodeURIComponent(e.target.q.value.trim()); };
}

// ---------- cards ----------
function card(p, {showStatus = false} = {}) {
  const img = p.featuredImage ? `<a href="${postPath(p)}"><img class="thumb" src="${esc(p.featuredImage)}" alt="" loading="lazy"></a>` : '';
  return `<article class="card ${img ? '' : 'noimage'}">${img}
    <h2>${showStatus && p.status !== 'published' ? `<span class="badge ${p.status}">${p.status}</span>` : ''}${p.featured ? '<span class="badge featured">Featured</span>' : ''}<a href="${postPath(p)}">${esc(p.title)}</a></h2>
    <p>${esc(p.excerpt || excerptOf(p.body))}</p>
    <div class="tags">${(p.tags || []).map(t => `<a href="#/tag/${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>
    <div class="meta"><a href="#/author/${esc(p.authorId)}">${esc(p.authorName)}</a> · ${fmtDate(p.publishedAt || p.updatedAt)} · ${esc(catName(p.category))}</div></article>`;
}
const canvas = (posts, o) => posts.length ? `<div class="canvas">${posts.map(p => card(p, o)).join('')}</div>` : `<p class="empty">No posts here yet.</p>`;
configurePlatform($app,canvas);
const chips = (activeSlug = '') => `<div class="chips"><a href="#/" class="${activeSlug ? '' : 'active'}">All megatrends</a>${S.categories.map(c => `<a href="#/category/${c.slug}" class="${c.slug === activeSlug ? 'active' : ''}">${esc(c.name)}</a>`).join('')}</div>`;

// ---------- pages ----------
async function home() {
  if (store.mode === 'firebase') { await moduleDirectory(false); return; }
  const posts = (await store.listPosts({status: 'published'})).sort((a, b) => (b.featured - a.featured) || (b.publishedAt - a.publishedAt));
  const u = user();
  $app.innerHTML = `${!u && store.mode === 'local' ? `<div class="notice info">Prototype running in <b>local mode</b>: posts and accounts live in this browser only. Use <b>View as</b> at the top right to try the student, lecturer and admin experiences.</div>` : ''}
    ${chips()}${canvas(posts)}`;
}
async function browse(f) {
  let posts = (await store.listPosts({status: 'published'})).sort(by('publishedAt'));
  let title = 'All published posts', sub = 'Across UCD modules';
  if (f.category) { posts = posts.filter(p => p.category === f.category); title = catName(f.category); sub = 'Megatrend'; }
  if (f.tag) { posts = posts.filter(p => (p.tags || []).some(t => t.toLowerCase() === f.tag.toLowerCase())); title = '#' + f.tag; sub = 'Tag'; }
  if (f.author) { posts = posts.filter(p => p.authorId === f.author); title = posts[0]?.authorName || 'Author'; sub = 'Posts by'; }
  if (f.month) { posts = posts.filter(p => monthKey(p.publishedAt) === f.month); title = monthName(f.month); sub = 'Archive'; }
  if ('q' in f) { const q = f.q.toLowerCase(); posts = q ? posts.filter(p => [p.title, p.authorName, p.organisation, (p.tags || []).join(' '), p.body].join(' ').toLowerCase().includes(q)) : []; title = f.q ? `Results for “${f.q}”` : 'Search'; sub = `${posts.length} post${posts.length === 1 ? '' : 's'}`; }
  $app.innerHTML = `<p class="page-sub" style="margin:0">${esc(sub)}</p><h1 class="page-title">${esc(title)}</h1><p class="page-sub">${posts.length} post${posts.length === 1 ? '' : 's'}</p>${f.category ? chips(f.category) : ''}${canvas(posts)}`;
}

async function postView(slug) {
  const p = await store.getPostBySlug(slug);
  const u = user();
  if (!p || (p.status !== 'published' && !(u && can(u, 'edit', p, S)))) { $app.innerHTML = `<p class="empty">That post is not available. <a href="#/">Back to the blog</a></p>`; return; }
  const module = p.moduleId && store.mode === 'firebase' ? await store.getModule(p.moduleId) : null;
  const context = module ? {...S,...module} : S;
  const canParticipate = u && (store.mode !== 'firebase' || (await store.listMyModules()).some(m=>m.id===p.moduleId));
  const all = (await store.listPosts({status: 'published'})).sort(by('publishedAt', 1));
  const i = all.findIndex(x => x.id === p.id), prev = i > 0 ? all[i - 1] : null, next = i >= 0 && i < all.length - 1 ? all[i + 1] : null;
  const comments = await store.listComments(p.id);
  const words = p.wordCount ?? wordCount(p.body);
  $app.innerHTML = `${module ? `<p class="page-sub"><a href="#/module/${esc(module.id)}">${esc(module.title)}</a></p>` : ''}<article class="post">
    ${u && can(u, 'edit', p, context) ? `<div class="post-actions"><span class="badge ${p.status}">${p.status}</span><span class="muted">${words} words</span>
      <a class="btn small" href="#/edit/${p.id}">Edit</a>
      ${p.status === 'published' && can(u, 'unpublish', p, context) ? `<button class="btn small" data-act="unpublish">Unpublish</button>` : ''}
      ${p.status !== 'published' && can(u, 'publish', p, context) ? `<button class="btn small primary" data-act="publish">Publish</button>` : ''}
      ${can(u, 'feature', p, context) ? `<button class="btn small" data-act="feature">${p.featured ? 'Unfeature' : 'Feature'}</button>` : ''}
      ${can(u, 'delete', p, S) ? `<button class="btn small danger" data-act="delete">Delete</button>` : ''}</div>` : ''}
    <div class="cat"><a href="#/category/${esc(p.category)}">${esc(catName(p.category))}</a></div>
    <h1>${esc(p.title)}</h1>
    <div class="meta"><a href="#/author/${esc(p.authorId)}">${esc(p.authorName)}</a> / ${fmtDate(p.publishedAt || p.updatedAt)} / ${readingTime(words)}${p.organisation ? ` / <span>Organisation: ${esc(p.organisation)}</span>` : ''}</div>
    ${p.featuredImage ? `<img class="hero" src="${esc(p.featuredImage)}" alt="">` : ''}
    <div class="body">${sanitize(p.body)}</div>
    <div class="tags">${(p.tags || []).map(t => `<a href="#/tag/${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>
    <div class="authorbox"><span class="avatar">${esc((p.authorName || '?')[0].toUpperCase())}</span><div>Written by <a href="#/author/${esc(p.authorId)}"><b>${esc(p.authorName)}</b></a> for the ${esc(S.challenge)}.<br><span class="muted">Classmates: the author's open questions at the end are an invitation. Leave a comment.</span></div></div>
    <div class="prevnext"><span>${prev ? `<a href="${postPath(prev)}"><small>« Previous</small>${esc(prev.title)}</a>` : ''}</span><span style="text-align:right">${next ? `<a href="${postPath(next)}"><small>Next »</small>${esc(next.title)}</a>` : ''}</span></div>
    <section class="comments"><h2>${comments.length ? `${comments.length} comment${comments.length === 1 ? '' : 's'}` : 'Leave a reply'}</h2>
      <div id="comment-list">${comments.map(c => commentHtml(c, u)).join('')}</div>
      ${context.allowComments === false ? '<p class="muted">Comments are closed.</p>' : canParticipate ? `<form class="reply"><textarea name="body" required maxlength="4000" placeholder="Add to the discussion as ${esc(u.penName)}…"></textarea><button class="btn primary">Post comment</button></form>` : u ? '<p class="muted">An invitation from this module’s instructor is required to comment. <button class="linkish" id="invite-to-comment">Enter invitation code</button></p>' : `<p class="muted">You must be <button class="linkish" id="login-to-comment">logged in</button> with a module invitation to post a comment.</p>`}
    </section></article>`;
  $app.querySelector('#login-to-comment')?.addEventListener('click', () => store.mode === 'firebase' ? openAuthModal() : toast('Pick an account with "View as" at the top right.'));
  $app.querySelector('#invite-to-comment')?.addEventListener('click',()=>openAuthModal('register'));
  $app.querySelector('.reply')?.addEventListener('submit', async e => {
    e.preventDefault(); const body = e.target.body.value.trim(); if (!body) return;
    try { await store.addComment({postId: p.id, body}, u); toast('Comment posted.'); render(); } catch (err) { toast(err.message, 'error'); }
  });
  $app.onclick = async e => {
    const del = e.target.closest('[data-del-comment]');
    if (del && confirm('Delete this comment?')) { await store.deleteComment(del.dataset.delComment); render(); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    try {
      if (act === 'delete') { if (!confirm('Delete this post permanently?')) return; await store.deletePost(p.id); toast('Post deleted.'); location.hash = '#/'; return; }
      if (act === 'unpublish') await store.savePost({...p, status: 'draft'}, u);
      if (act === 'publish') await store.savePost({...p, status: 'published'}, u);
      if (act === 'feature') await store.savePost({...p, featured: !p.featured}, u);
      toast('Updated.'); render();
    } catch (err) { toast(err.message, 'error'); }
  };
}
function commentHtml(c, u) {
  return `<div class="comment"><div class="who"><span class="avatar">${esc((c.authorName || '?')[0].toUpperCase())}</span><b>${esc(c.authorName)}</b> · ${fmtDateTime(c.createdAt)}${u && can(u, 'deleteComment', c, S) ? `<button class="linkish danger small" data-del-comment="${c.id}">Delete</button>` : ''}</div><p>${esc(c.body)}</p></div>`;
}

async function guide() {
  const u = user();
  $app.innerHTML = `<div class="guide"><p class="page-sub" style="margin:0">${esc(S.module)}</p><h1 class="page-title">${esc(S.challenge)}</h1>
    <div class="body">${sanitize(S.guide)}</div>
    <h2 class="page-title" style="font-size:20px;margin-top:30px">How publishing works here</h2>
    <ol class="steps">
      <li><b>Log in</b> and choose a <b>pen name</b> in your profile. Posts and comments show the pen name; the instructor alone sees who is behind it.</li>
      <li><b>Write</b> your post in the editor. Add hyperlinks to your sources, images, tables and a featured image. The word meter follows the ${S.minWords}–${S.maxWords} word target (tables and captions are not counted).</li>
      <li><b>Save a draft</b> as often as you like. Drafts are private to you${rank(u?.role) >= 1 ? ' (and visible to staff)' : ''}.</li>
      <li><b>Publish</b> when you are done.${S.requireApproval ? ' A lecturer checks each post before it appears on the canvas.' : ' Your post appears on the canvas immediately and its address never changes.'}</li>
      <li><b>Discuss.</b> Read your classmates' posts and answer the open questions they raise in the comments.</li>
    </ol>
    ${S.deadline ? `<div class="notice">Deadline: <b>${fmtDate(S.deadline)}</b>${S.submissionsOpen ? '' : ' — submissions are now closed.'}</div>` : ''}
    <p><a class="btn primary" href="#/write">Start writing</a></p></div>`;
}

// ---------- compose ----------
async function editorView(id,moduleId) {
  const u = user();
  if (!u) { $app.innerHTML = `<p class="empty">Log in to write a post.</p>`; if (store.mode === 'firebase') openAuthModal(); return; }
  let p = id ? await store.getPost(id) : null;
  if (store.mode === 'firebase') {
    moduleId = p?.moduleId || moduleId;
    if (!moduleId) { await moduleDirectory(true); return; }
  }
  const module = store.mode === 'firebase' ? await store.getModule(moduleId) : null;
  if (store.mode === 'firebase' && !module) { $app.innerHTML='<p class="empty">Module not found.</p>';return; }
  const context = module ? {...S,...module} : S;
  if (id && !p) { $app.innerHTML = `<p class="empty">That post does not exist.</p>`; return; }
  if (p && !can(u, 'edit', p, context)) { $app.innerHTML = `<p class="empty">You cannot edit this post.</p>`; return; }
  if (!p && !can(u, 'write', {moduleId}, context)) { $app.innerHTML = `<p class="empty">Submissions are closed.</p>`; return; }
  if (store.mode === 'firebase' && !u.emailVerified) { $app.innerHTML='<p class="empty">Verify your sign-in email before writing. Use the account menu to resend or refresh verification.</p>';return; }
  if (store.mode === 'firebase' && !p) {
    const joined = (await store.listMyModules()).some(m=>m.id===moduleId);
    if(!joined){$app.innerHTML=`<p class="empty">Join this module before writing. <a href="#/module/${esc(moduleId)}">Open module canvas</a></p>`;return;}
  }
  p = p || {moduleId, title: '', body: '', category: '', organisation: '', tags: [], featuredImage: '', status: 'draft', excerpt: ''};
  const draft = {...p, tags: [...(p.tags || [])]};
  let dirty = false, saving = false, ed;
  liveView = 'editor';

  $app.innerHTML = `${module ? `<p class="page-sub">Writing for <a href="#/module/${esc(module.id)}">${esc(module.title)}</a></p>` : ''}<div class="compose">
    <div class="main">
      <input class="title-input" id="title" placeholder="Title: name the organisation and the challenge" maxlength="160" value="${esc(draft.title)}">
      <div id="editor"></div>
      <label class="field">Short summary (shown on the canvas; optional, written for you if blank)<textarea id="excerpt" maxlength="300" rows="2">${esc(draft.excerpt || '')}</textarea></label>
    </div>
    <aside class="side">
      <div class="panel"><h3>Status</h3>
        <div class="wc"><span><b id="wc">0</b> words</span><span class="muted">target ${S.minWords}–${S.maxWords}</span></div>
        <div class="meter" id="meter"><i style="width:0"></i></div>
        <p class="hint" id="wc-hint"></p>
        <div class="actions" style="margin-top:10px">
          <button class="btn" id="save-draft">Save draft</button>
          <button class="btn primary" id="publish">${context.requireApproval && !can(u,'approve',draft,context) ? 'Submit for review' : draft.status === 'published' ? 'Update' : 'Publish'}</button>
          ${draft.status === 'published' ? `<a class="btn" href="${postPath(draft)}">View</a>` : ''}
        </div>
        <p class="status-line" id="status-line">${draft.status === 'published' ? 'Published · ' + fmtDate(draft.publishedAt) : draft.status === 'pending' ? 'Waiting for an instructor to approve' : p.id ? 'Draft · saved ' + fmtDateTime(draft.updatedAt) : 'New draft (not saved yet)'}</p>
        ${S.deadline ? `<p class="hint">Deadline ${fmtDate(S.deadline)}</p>` : ''}
      </div>
      <div class="panel"><h3>Megatrend</h3>
        <label class="field"><select id="category" required><option value="">Choose the megatrend…</option>${S.categories.map(c => `<option value="${c.slug}" ${draft.category === c.slug ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field">Organisation studied<input id="organisation" maxlength="120" value="${esc(draft.organisation || '')}" placeholder="e.g. Ryanair, UNICEF, the HSE"></label>
      </div>
      <div class="panel"><h3>Featured image</h3>
        <img class="thumb-preview" id="thumb" src="${esc(draft.featuredImage || '')}" alt="" ${draft.featuredImage ? '' : 'hidden'}>
        <div class="actions"><button class="btn small" id="pick-image">Upload image</button><button class="btn small" id="remove-image" ${draft.featuredImage ? '' : 'hidden'}>Remove</button></div>
        <input type="file" id="image-file" accept="image/*" hidden>
        <p class="hint">Shown on the canvas and at the top of your post. An image that summarises your post, or the organisation's logo.</p>
      </div>
      <div class="panel"><h3>Tags</h3>
        <label class="field"><input id="tags" value="${esc(draft.tags.join(', '))}" placeholder="Climate Action, ESG, Supply Chain"></label>
        <p class="hint">Comma-separated keywords. They become the orange #hashtags readers browse by.</p>
      </div>
      <div class="panel"><h3>The five questions</h3>
        <ul class="checklist">
          <li><input type="checkbox" id="q1"><label for="q1">Why the megatrend matters to management</label></li>
          <li><input type="checkbox" id="q2"><label for="q2">How management is affected (+/−)</label></li>
          <li><input type="checkbox" id="q3"><label for="q3">Current steps: next 2 years and 2–10 years</label></li>
          <li><input type="checkbox" id="q4"><label for="q4">Your recommendations, short and medium term</label></li>
          <li><input type="checkbox" id="q5"><label for="q5">One or two open questions for classmates</label></li>
          <li><input type="checkbox" id="q6"><label for="q6">Sources as hyperlinks (FT50, HBR, MIT SMR, The Economist…)</label></li>
        </ul>
        <button class="btn small" id="insert-outline" style="margin-top:8px">Insert the outline</button>
        <p class="hint">A quarter of the post for each of the first four questions; a few sentences for the last.</p>
      </div>
    </aside></div>`;

  const $ = id => document.getElementById(id);
  ed = mountEditor($('editor'), {html: draft.body, onChange: html => { draft.body = html; dirty = true; updateMeter(); }});
  $('title').oninput = e => { draft.title = e.target.value; dirty = true; };
  $('excerpt').oninput = e => { draft.excerpt = e.target.value; dirty = true; };
  $('category').onchange = e => { draft.category = e.target.value; dirty = true; };
  $('organisation').oninput = e => { draft.organisation = e.target.value; dirty = true; };
  $('tags').onchange = e => { draft.tags = e.target.value.split(/[,;]/).map(t => t.trim()).filter(Boolean).slice(0, 12); e.target.value = draft.tags.join(', '); dirty = true; };
  $('pick-image').onclick = () => $('image-file').click();
  $('image-file').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { draft.featuredImage = await shrinkImage(f, 1400); $('thumb').src = draft.featuredImage; $('thumb').hidden = false; $('remove-image').hidden = false; dirty = true; } catch (err) { toast(err.message, 'error'); } };
  $('remove-image').onclick = () => { draft.featuredImage = ''; $('thumb').hidden = true; $('remove-image').hidden = true; dirty = true; };
  $('insert-outline').onclick = () => { if (ed.getHTML().trim() && !confirm('Insert the outline at the end of what you have written?')) return; ed.insertHTML(OUTLINE(draft.organisation || 'the organisation', draft.category ? catName(draft.category).toLowerCase() : 'the megatrend')); };
  $('save-draft').onclick = () => save(draft.status === 'published' ? 'published' : 'draft', true);
  $('publish').onclick = () => {
    const words = wordCount(draft.body);
    if (!draft.title.trim()) return toast('Give your post a title first.', 'error');
    if (!draft.category) return toast('Choose the megatrend your post is about.', 'error');
    if (words < S.minWords * 0.5 && draft.status !== 'published' && !confirm(`Your post has only ${words} words; the target is ${S.minWords}–${S.maxWords}. Publish anyway?`)) return;
    save(context.requireApproval && !can(u,'approve',draft,context) ? 'pending' : 'published');
  };
  function updateMeter() {
    const w = wordCount(draft.body), m = $('meter'), pct = Math.min(100, w / S.maxWords * 100);
    $('wc').textContent = w; m.querySelector('i').style.width = pct + '%';
    m.className = 'meter ' + (w > S.maxWords ? 'over' : w >= S.minWords ? 'ok' : '');
    $('wc-hint').textContent = w > S.maxWords ? `${w - S.maxWords} over the limit` : w >= S.minWords ? 'Within the target range' : `${S.minWords - w} more to reach the minimum`;
    const text = (draft.body || '').toLowerCase();
    $('q6').checked = /<a\s/.test(text);
  }
  updateMeter();
  async function save(status, quiet = false) {
    if (saving) return; saving = true;
    const btn = $('save-draft'); btn.disabled = true;
    try {
      if (!draft.title.trim()) draft.title = 'Untitled draft';
      const saved = await store.savePost({...draft, id: p.id, status, excerpt: draft.excerpt.trim()}, u);
      p = saved; draft.slug = saved.slug; draft.status = saved.status; draft.publishedAt = saved.publishedAt; draft.updatedAt = saved.updatedAt; dirty = false;
      $('status-line').textContent = status === 'published' ? 'Published · ' + fmtDate(saved.publishedAt) : status === 'pending' ? 'Submitted · waiting for an instructor' : 'Draft · saved ' + fmtDateTime(saved.updatedAt);
      if (!id) history.replaceState(null, '', '#/edit/' + saved.id);
      if (status === 'published' && !quiet) { toast('Published! Your post is live.'); location.hash = postPath(saved); }
      else if (status === 'pending') { toast('Submitted for review.'); location.hash = '#/mine'; }
      else toast('Draft saved.');
    } catch (e) { toast(e.message, 'error'); } finally { saving = false; btn.disabled = false; }
  }
  // Safety net: drafts are also backed up locally every 20 seconds while editing.
  const timer = setInterval(() => { if (dirty && draft.status !== 'published') save('draft', true); }, 20000);
  const leave = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  addEventListener('beforeunload', leave);
  const stop = () => { clearInterval(timer); removeEventListener('beforeunload', leave); removeEventListener('hashchange', stop); };
  addEventListener('hashchange', stop);
}

// ---------- my posts ----------
async function mine() {
  const u = user();
  if (!u) { $app.innerHTML = `<p class="empty">Log in to see your posts.</p>`; return; }
  const posts = (await store.listPosts({authorId: u.uid})).sort(by('updatedAt'));
  $app.innerHTML = `<h1 class="page-title">My posts</h1><p class="page-sub">Writing as <b>${esc(u.penName)}</b>. <a href="#/profile">Edit profile</a></p>
    <p><a class="btn primary" href="#/write">Write a new post</a></p>
    ${posts.length ? `<table class="list"><thead><tr><th>Title</th><th>Status</th><th>Words</th><th>Megatrend</th><th>Updated</th><th></th></tr></thead><tbody>
      ${posts.map(p => `<tr><td><a href="#/edit/${p.id}">${esc(p.title)}</a></td><td><span class="badge ${p.status}">${p.status}</span></td><td>${p.wordCount ?? wordCount(p.body)}</td><td>${esc(catName(p.category))}</td><td>${fmtDateTime(p.updatedAt)}</td>
        <td class="actions"><a href="#/edit/${p.id}">Edit</a>${p.status === 'published' ? ` <a href="${postPath(p)}">View</a>` : ''}${can(u, 'delete', p, S) ? ` <button class="linkish danger" data-del="${p.id}">Delete</button>` : ''}</td></tr>`).join('')}</tbody></table>` : `<p class="empty">You have not written anything yet.</p>`}`;
  $app.onclick = async e => { const b = e.target.closest('[data-del]'); if (b && confirm('Delete this post?')) { await store.deletePost(b.dataset.del); toast('Deleted.'); mine(); } };
}

async function profileView() {
  const u = user();
  if (!u) { $app.innerHTML = `<p class="empty">Log in to edit your profile.</p>`; return; }
  const f = (name, label, hint = '', type = 'text') => `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(u[name] || '')}" maxlength="120">${hint ? `<p class="hint">${hint}</p>` : ''}</label>`;
  $app.innerHTML = `<div class="guide"><h1 class="page-title">Your profile</h1><p class="page-sub">Role: <b>${esc(roleLabel(u.role))}</b>${u.email ? ` · signed in as ${esc(u.email)}` : ''}</p>
    <form id="profile" class="two-col">
      <div>${f('penName', 'Pen name', 'Shown on your posts and comments. Keep it non-identifying so peer review stays anonymous.')}${f('firstName', 'First name')}${f('lastName', 'Last name')}</div>
      <div>${f('contactEmail', 'University email', 'Your university contact address, separate from your Google sign-in email.', 'email')}${u.registrationKind !== 'teacher' && u.role === 'student' ? f('studentId', 'University ID', 'Seen only by you and your module teachers.') : ''}${f('affiliation', 'School / university')}${f('website', 'Website or LinkedIn (optional)', '', 'url')}<label class="field">Short bio (optional)<textarea name="bio" maxlength="400" rows="3">${esc(u.bio || '')}</textarea></label></div>
      <div class="actions"><button class="btn primary">Save profile</button></div></form></div>`;
  document.getElementById('profile').onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    d.penName = d.penName.trim().replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 24); if (!d.penName) return toast('Choose a pen name.', 'error');
    try { await store.saveProfile(u.uid, d); toast('Profile saved.'); renderHeader(); } catch (err) { toast(err.message, 'error'); }
  };
}

// ---------- lecturer area ----------
async function lecturer(tab = 'posts', moduleId = '') {
  const u = user();
  if (!u || rank(u.role) < 1) { $app.innerHTML = `<p class="empty">Instructor access required.</p>`; return; }
  tab = tab || 'posts';
  let [posts, users] = await Promise.all([store.mode === 'firebase' ? store.listAllPosts() : store.listPosts(), store.listUsers(moduleId)]);
  const teachingModules=store.mode==='firebase'?(await store.listModules()).filter(m=>u.role==='admin'||m.teacherIds.includes(u.uid)):[];
  if(moduleId) posts=posts.filter(p=>p.moduleId===moduleId);
  const who = Object.fromEntries(users.map(x => [x.uid, x]));
  const real = uid => { const x = who[uid]; return x ? `${esc([x.firstName, x.lastName].filter(Boolean).join(' ') || '—')}${x.studentId ? ` <span class="muted">${esc(x.studentId)}</span>` : ''}` : '<span class="muted">unknown</span>'; };
  const pending = posts.filter(p => p.status === 'pending');
  const tabs = `<div class="tabs"><a href="#/review/posts" class="${tab === 'posts' ? 'active' : ''}">All posts (${posts.length})</a><a href="#/review/queue" class="${tab === 'queue' ? 'active' : ''}">Review queue (${pending.length})</a><a href="#/review/comments" class="${tab === 'comments' ? 'active' : ''}">Comments</a><a href="#/review/roster" class="${tab === 'roster' ? 'active' : ''}">Roster (${users.length})</a></div>`;
  const stats = `<div class="stats"><div class="stat"><b>${posts.filter(p => p.status === 'published').length}</b><span>published</span></div><div class="stat"><b>${posts.filter(p => p.status === 'draft').length}</b><span>drafts</span></div><div class="stat"><b>${pending.length}</b><span>awaiting review</span></div><div class="stat"><b>${users.filter(x => x.role === 'student' || !x.role).length}</b><span>students</span></div><div class="stat"><b>${Math.round(posts.filter(p => p.status === 'published').reduce((s, p) => s + (p.wordCount ?? wordCount(p.body)), 0) / Math.max(1, posts.filter(p => p.status === 'published').length))}</b><span>avg words</span></div></div>`;
  let body = '';
  const row = p => `<tr><td>${p.featured ? '<span class="badge featured">★</span>' : ''}<a href="${p.status === 'published' ? postPath(p) : '#/edit/' + p.id}">${esc(p.title)}</a><br><span class="muted small">${esc(p.organisation || '')}</span></td><td><b>${esc(p.authorName)}</b><br><span class="small">${real(p.authorId)}</span></td><td><span class="badge ${p.status}">${p.status}</span></td><td>${p.wordCount ?? wordCount(p.body)}</td><td>${esc(catName(p.category))}</td><td>${fmtDate(p.publishedAt || p.updatedAt)}</td>
    <td class="actions"><a href="#/edit/${p.id}">Edit</a>${p.status !== 'published' ? ` <button class="linkish" data-act="publish" data-id="${p.id}">${p.status === 'pending' ? 'Approve' : 'Publish'}</button>` : ` <button class="linkish" data-act="unpublish" data-id="${p.id}">Unpublish</button>`} <button class="linkish" data-act="feature" data-id="${p.id}">${p.featured ? 'Unfeature' : 'Feature'}</button>${rank(u.role) >= 2 ? ` <button class="linkish danger" data-act="delete" data-id="${p.id}">Delete</button>` : ''}</td></tr>`;
  const table = list => list.length ? `<table class="list"><thead><tr><th>Post</th><th>Pen name / student</th><th>Status</th><th>Words</th><th>Megatrend</th><th>Date</th><th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>` : '<p class="empty">Nothing here.</p>';
  if (tab === 'posts') body = `<p class="actions"><button class="btn small" id="export-csv">Download CSV (posts + authors)</button><span class="muted small">For grading and for assigning peer reviews.</span></p>` + table([...posts].sort(by('updatedAt')));
  if (tab === 'queue') body = '<p class="muted">Posts submitted for review in your modules. Approval is controlled separately in each module’s settings.</p>' + table(pending);
  if (tab === 'comments') { const cs = (await store.recentComments(100)).filter(c=>posts.some(p=>p.id===c.postId)); const byId = Object.fromEntries(posts.map(p => [p.id, p])); body = cs.length ? cs.map(c => `<div class="comment"><div class="who"><b>${esc(c.authorName)}</b> <span class="small">(${real(c.authorId)})</span> · ${fmtDateTime(c.createdAt)} · on <a href="${byId[c.postId] ? postPath(byId[c.postId]) : '#'}">${esc(byId[c.postId]?.title || '?')}</a><button class="linkish danger small" data-del-comment="${c.id}">Delete</button></div><p>${esc(c.body)}</p></div>`).join('') : '<p class="empty">No comments yet.</p>'; }
  if (tab === 'roster') { const count = groupBy(posts, p => p.authorId); body = `<table class="list"><thead><tr><th>Pen name</th><th>Name</th><th>Student no.</th><th>E-mail</th><th>Programme</th><th>Role</th><th>Posts</th></tr></thead><tbody>${users.sort((a, b) => rank(b.role) - rank(a.role) || (a.penName || '').localeCompare(b.penName || '')).map(x => `<tr><td><b>${esc(x.penName || '—')}</b></td><td>${esc([x.firstName, x.lastName].filter(Boolean).join(' '))}</td><td>${esc(x.studentId || '')}</td><td>${esc(x.email || x.contactEmail || '')}</td><td>${esc(x.affiliation || '')}</td><td>${esc(roleLabel(x.role || 'student'))}</td><td>${(count[x.uid] || []).filter(p => p.status === 'published').length} / ${(count[x.uid] || []).length}</td></tr>`).join('')}</tbody></table>`; }
  $app.innerHTML = `<h1 class="page-title">Instructor area</h1><p class="page-sub">Review posts and rosters for your teaching modules.</p>${teachingModules.length?`<label class="field">Module<select id="review-module"><option value="">All my teaching modules</option>${teachingModules.map(m=>`<option value="${esc(m.id)}" ${moduleId===m.id?'selected':''}>${esc(m.title)}</option>`).join('')}</select></label>`:''}${stats}${tabs}${body}`;
  $app.querySelector('#review-module')?.addEventListener('change',e=>{location.hash='#/review/'+tab+(e.target.value?'?module='+e.target.value:'');});
  if(moduleId) $app.querySelectorAll('.tabs a').forEach(a=>a.href+='?module='+moduleId);
  $app.querySelector('#export-csv')?.addEventListener('click', () => {
    const esc2 = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['Title', 'URL', 'Pen name', 'First name', 'Last name', 'Student no.', 'E-mail', 'Status', 'Words', 'Megatrend', 'Organisation', 'Published']].concat(posts.map(p => { const x = who[p.authorId] || {}; return [p.title, location.origin + location.pathname + postPath(p), p.authorName, x.firstName, x.lastName, x.studentId, x.email || x.contactEmail, p.status, p.wordCount ?? wordCount(p.body), catName(p.category), p.organisation, p.publishedAt ? new Date(p.publishedAt).toISOString().slice(0, 10) : '']; }));
    const blob = new Blob([rows.map(r => r.map(esc2).join(',')).join('\n')], {type: 'text/csv'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ucd-blog-posts.csv'; a.click();
  });
  $app.onclick = async e => {
    const del = e.target.closest('[data-del-comment]'); if (del && confirm('Delete this comment?')) { await store.deleteComment(del.dataset.delComment); return lecturer(tab,moduleId); }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const p = posts.find(x => x.id === b.dataset.id); if (!p) return;
    try {
      if (b.dataset.act === 'delete') { if (!confirm(`Delete "${p.title}" permanently?`)) return; await store.deletePost(p.id); }
      if (b.dataset.act === 'publish') await store.savePost({...p, status: 'published'}, u);
      if (b.dataset.act === 'unpublish') await store.savePost({...p, status: 'draft'}, u);
      if (b.dataset.act === 'feature') await store.savePost({...p, featured: !p.featured}, u);
      toast('Updated.'); lecturer(tab,moduleId);
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ---------- admin area ----------
async function admin(tab = 'users') {
  const u = user();
  if (!u || rank(u.role) < 2) { $app.innerHTML = `<p class="empty">Admin access required.</p>`; return; }
  tab = tab || 'users';
  const tabs = `<div class="tabs"><a href="#/admin/users" class="${tab === 'users' ? 'active' : ''}">Users & roles</a><a href="#/invitations">Invite instructor</a><a href="#/my-modules">Manage modules</a><a href="#/admin/settings" class="${tab === 'settings' ? 'active' : ''}">Site settings</a><a href="#/admin/data" class="${tab === 'data' ? 'active' : ''}">Data & backend</a></div>`;
  let body = '';
  if (tab === 'users') {
    const users = (await store.listUsers()).sort((a, b) => rank(b.role) - rank(a.role) || (a.penName || '').localeCompare(b.penName || ''));
    body = `<p class="muted">Everyone who has signed in. Instructors get everything a student has plus the Instructor area; admins get everything plus this page.</p>
      <table class="list"><thead><tr><th>Pen name</th><th>Name</th><th>E-mail</th><th>Programme</th><th>Role</th></tr></thead><tbody>${users.map(x => `<tr><td><b>${esc(x.penName || '—')}</b></td><td>${esc([x.firstName, x.lastName].filter(Boolean).join(' '))}</td><td>${esc(x.email || x.contactEmail || '')}</td><td>${esc(x.affiliation || '')}</td><td><select data-role="${x.uid}" ${x.uid === u.uid ? 'disabled title="You cannot change your own role."' : ''}>${ROLES.map(r => `<option value="${r}" ${(x.role || 'student') === r ? 'selected' : ''}>${roleLabel(r)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>`;
  }
  if (tab === 'settings') {
    body = `<form id="settings" class="two-col">
      <div><label class="field">Blog title<input name="title" value="${esc(S.title)}" maxlength="120"></label>
      <label class="field">Tagline<input name="tagline" value="${esc(S.tagline)}" maxlength="160"></label>
      <label class="field">Module<input name="module" value="${esc(S.module)}" maxlength="120"></label>
      <label class="field">Challenge name<input name="challenge" value="${esc(S.challenge)}" maxlength="120"></label>
      <label class="field">Word target<span style="display:flex;gap:8px"><input name="minWords" type="number" value="${S.minWords}" min="0"><input name="maxWords" type="number" value="${S.maxWords}" min="0"></span></label>
      <label class="field">Deadline (optional)<input name="deadline" type="date" value="${esc(S.deadline || '')}"></label>
      <label class="check"><input type="checkbox" name="submissionsOpen" ${S.submissionsOpen ? 'checked' : ''}> Students can write and publish</label>
      <label class="check"><input type="checkbox" name="requireApproval" ${S.requireApproval ? 'checked' : ''}> Student posts need instructor approval before appearing</label>
      <label class="check"><input type="checkbox" name="allowComments" ${S.allowComments !== false ? 'checked' : ''}> Comments open</label></div>
      <div><label class="field">Megatrends / categories (one per line: <code>slug | Name</code>)<textarea name="categories" rows="7">${esc(S.categories.map(c => c.slug + ' | ' + c.name).join('\n'))}</textarea></label>
      <label class="field">Challenge brief (HTML, shown on “The challenge”)<textarea name="guide" rows="12">${esc(S.guide)}</textarea></label></div>
      <div class="actions"><button class="btn primary">Save settings</button></div></form>`;
  }
  if (tab === 'data') {
    body = `<div class="two-col"><div class="panel" style="border:1px solid var(--line);border-radius:8px;padding:14px"><h3>Backend</h3>
      <p>Mode: <b>${store.mode === 'firebase' ? 'Firebase (live)' : 'Local prototype'}</b></p>
      ${store.mode === 'local' ? `<p class="muted small">Posts, comments and accounts live in this browser's storage. To go live for the class, create the Firebase project and paste its config into <code>firebase-config.js</code>, then deploy <code>firestore.rules</code>. Steps in <code>_SETUP-FIREBASE.md</code>.</p>` : `<p class="muted small">Security rules live in <code>firestore.rules</code>; the admin is the verified e-mail named there.</p>`}
      </div><div class="panel" style="border:1px solid var(--line);border-radius:8px;padding:14px"><h3>Data</h3>
      <p class="actions"><button class="btn small" id="export-json">Download everything as JSON</button>${store.mode === 'local' ? `<button class="btn small danger" id="reset-demo">Reset sample data</button>` : ''}</p></div></div>`;
  }
  $app.innerHTML = `<h1 class="page-title">Admin area</h1><p class="page-sub">Everything an instructor can do, plus roles, site settings and the backend.</p>${tabs}${body}`;
  $app.querySelectorAll('[data-role]').forEach(sel => sel.onchange = async () => { try { await store.setRole(sel.dataset.role, sel.value); toast('Role updated.'); } catch (e) { toast(e.message, 'error'); } });
  $app.querySelector('#settings')?.addEventListener('submit', async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    const patch = {title: d.title.trim(), tagline: d.tagline.trim(), module: d.module.trim(), challenge: d.challenge.trim(), minWords: +d.minWords || 0, maxWords: +d.maxWords || 0, deadline: d.deadline || '', submissionsOpen: !!d.submissionsOpen, requireApproval: !!d.requireApproval, allowComments: !!d.allowComments, guide: d.guide,
      categories: d.categories.split('\n').map(l => l.split('|')).filter(a => a[0]?.trim()).map(a => ({slug: slugify(a[0]), name: (a[1] || a[0]).trim()}))};
    try { S = await store.saveSettings(patch); toast('Settings saved.'); renderHeader(); } catch (err) { toast(err.message, 'error'); }
  });
  $app.querySelector('#export-json')?.addEventListener('click', async () => { const blob = new Blob([JSON.stringify(await store.exportAll(), null, 2)], {type: 'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ucd-blog-export.json'; a.click(); });
  $app.querySelector('#reset-demo')?.addEventListener('click', async () => { if (confirm('Replace everything in this browser with the sample data?')) { await store.resetDemo(); S = store.settings(); toast('Sample data restored.'); location.hash = '#/'; render(); } });
}

// ---------- boot ----------
(async () => {
  try { await initStore(); S = store.settings(); }
  catch (e) { $app.innerHTML = `<p class="empty">The blog could not start: ${esc(e.message)}</p>`; return; }
  store.onChange(() => { S = store.settings(); renderHeader(); if (liveView !== 'editor') render(); });
  addEventListener('hashchange', render);
  render();
})();
