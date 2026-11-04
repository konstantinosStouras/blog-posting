// Blogs, modules and invitations.
//   A BLOG is a public canvas plus the exercise written on it (brief, categories,
//   word target, outline, checklist, comments policy). It is owned by instructors.
//   A MODULE is a cohort: code, academic year, roster, invitations, deadline and
//   moderation settings. Every module posts to exactly one blog, and several
//   modules of the same instructor may share one blog canvas.
import {store, memberOfBlog} from './store.js';
import {currentUser, openAuthModal, invitationRoute} from './auth.js';
import {renderWelcome, bindWelcome} from './welcome.js';
import {esc, toast, slugify, fmtDate, fmtDateTime, sanitize, pageHead} from './util.js';
import {JOIN_CITIES, cityLabel, isRetiredStudentCode} from './invitation-codes.js';
import {DEFAULT_REPLY_RULES} from './seed.js';
import {route, navigate, publicUrl} from './router.js';
import {peerCardLine} from './peer-review.js';
import {editBrief} from './brief-editor.js';
import {enhance} from './blocks.js';

let app, canvas;
export function configurePlatform(target, renderCanvas) { app = target; canvas = renderCanvas; }
export const blogUrl = id => publicUrl('/' + encodeURIComponent(id));
const staff = u => u && ['admin', 'lecturer'].includes(u.role);
const instructs = (u, x) => !!u && !u.studentPreview && (u.role === 'admin' || (x?.teacherIds || []).includes(u.uid));   // a student preview hides the instructor's controls
const moduleLabel = m => [m.code, m.title].filter(Boolean).join(' ');
const isTeaching = m => m.teaching;

// ---------- directory: every blog, with the modules writing on it ----------
export async function blogDirectory() {
  const u = currentUser();
  if (!u) { app.innerHTML = renderWelcome(); bindWelcome(app); return; }   // the front door: no blogs, posts or comments before signing in
  const [blogs, modules, mine] = await Promise.all([store.listBlogs(), store.listModules(), store.listMyModules()]);
  // The whole card opens the blog (a cover link beneath the buttons, as on the post canvas), and lights up on hover (styles.css, .module-card.linked).
  const card = b => { const here = m => m.blogId === b.id, ms = instructs(u, b) || mine.some(m => here(m) && isTeaching(m)) ? modules.filter(here) : mine.filter(here); return `<article class="module-card linked"><a class="cover" href="/${esc(b.id)}" aria-hidden="true" tabindex="-1"></a><p class="page-sub">${ms.length ? esc(ms.map(m => m.code || m.title).join(' · ')) : 'Blog'}</p><h2><a href="/${esc(b.id)}">${esc(b.title)}</a></h2><p>${esc(b.description || '')}</p><div class="actions"><a class="btn small" href="/${esc(b.id)}">Open blog</a>${instructs(u, b) ? `<a class="btn small" href="/blogs/edit/${esc(b.id)}">Blog settings</a>` : ''}</div></article>`; };
  // Each person sees the blogs they belong to; the admin sees them all.
  app.innerHTML = `<h1 class="page-title">${u.role === 'admin' ? 'Explore blogs' : 'My blogs'}</h1><p class="page-sub">${u.role === 'admin' ? 'Every blog on the platform, with the modules writing on it.' : 'The blogs your modules write on, with the posts of your own module.'}</p>
    <p class="actions"><a class="btn" href="/my-modules">My modules</a>${staff(u) ? '<a class="btn primary" href="/modules/new">Create module</a>' : ''}${u.role === 'admin' ? '<a class="btn" href="/admin/invite">Invite instructor</a>' : ''}</p>
    ${blogs.length ? `<div class="module-grid">${blogs.map(card).join('')}</div>` : `<p class="empty">${u.role === 'admin' ? 'No blogs have been created yet.' : 'You are not a member of any blog yet. Enter your invitation code from <a href="/my-modules">My modules</a>.'}</p>`}`;
}

// ---------- my modules: a student's way in, an instructor's control room ----------
export async function myModules(target = app, embedded = false) {
  const u = currentUser();
  if (!u) { target.innerHTML = '<p class="empty">Sign in to see your modules.</p>'; if (store.mode === 'firebase') openAuthModal(); return; }
  const [mine, blogs] = await Promise.all([store.listMyModules(), store.listBlogs()]);
  const blogOf = id => blogs.find(b => b.id === id);
  if (!staff(u)) {
    // Students: the blog(s) of the module(s) they belong to, the way to write, and their peer-review assignments.
    const peerMine = await store.listMyPeerReviews().catch(() => []);
    target.innerHTML = `${pageHead('My modules', `Writing as <b>${esc(u.penName)}</b> · <a href="/profile">Edit profile</a>`, embedded)}
      ${mine.length ? `<div class="module-grid">${mine.map(m => { const b = blogOf(m.blogId); return `<article class="module-card"><p class="page-sub">${esc(m.code || 'Module')}</p><h2>${esc(m.title)}</h2><p>${b ? `Posts go to the <a href="/${esc(b.id)}">${esc(b.title)}</a> blog.` : 'This module has no blog yet.'}${m.deadline ? ` Deadline <b>${fmtDate(m.deadline)}</b>.` : ''}${peerCardLine(peerMine, m)}</p><div class="actions">${b ? `<a class="btn primary" href="/write/${esc(m.id)}">Write your blog post</a><a class="btn" href="/${esc(b.id)}">Open blog</a><a class="btn small" href="/${esc(b.id)}/brief">The brief</a>` : ''}${m.brightspaceUrl ? `<a class="btn small" href="${esc(m.brightspaceUrl)}" target="_blank" rel="noopener">Brightspace</a>` : ''}</div></article>`; }).join('')}</div>` : '<p class="empty">You have not joined a module yet. Enter the invitation code from your instructor.</p>'}
      <p class="actions"><a class="btn" href="/mine">My posts</a><button class="btn" id="platform-register">Enter an invitation code</button></p>`;
    target.querySelector('#platform-register')?.addEventListener('click', () => openAuthModal('register'));
    return;
  }
  const teaching = mine.filter(isTeaching), byBlog = new Map();
  for (const m of teaching) (byBlog.get(m.blogId || '') || byBlog.set(m.blogId || '', []).get(m.blogId || '')).push(m);
  const section = (blogId, ms) => { const b = blogOf(blogId); return `<section class="blog-group"><h2 class="group-title">${b ? `<a href="/${esc(b.id)}">${esc(b.title)}</a>` : 'Modules without a blog'}</h2>${b ? `<p class="actions small"><a href="/blogs/edit/${esc(b.id)}">Blog settings</a><a href="/${esc(b.id)}/brief">Brief</a><a href="/instructor?blog=${esc(b.id)}">Review posts</a><button class="linkish" data-copy="${esc(blogUrl(b.id))}">Copy public link</button></p>` : '<p class="muted small">Open each module’s settings to attach it to a blog.</p>'}
    <table class="list"><thead><tr><th>Module</th><th>Deadline</th><th>Submissions</th><th></th></tr></thead><tbody>${ms.map(m => `<tr><td><b>${esc(m.code || '')}</b> ${esc(m.title)}</td><td>${m.deadline ? fmtDate(m.deadline) : '—'}</td><td>${m.submissionsOpen === false ? 'Closed' : 'Open'}${m.requireApproval ? ' · approval' : ''}</td><td class="actions"><a href="/modules/edit/${esc(m.id)}">Settings</a><a href="/modules/invite/${esc(m.id)}">Invite students</a><a href="/instructor?module=${esc(m.id)}">Roster</a><a href="/instructor?module=${esc(m.id)}">Posts</a><button class="linkish danger" data-delete-module="${esc(m.id)}" data-label="${esc(moduleLabel(m))}" title="Delete this module and its roster">Delete</button></td></tr>`).join('')}</tbody></table></section>`; };
  target.innerHTML = `${pageHead(embedded ? 'Manage modules' : 'My modules', 'Your teaching modules, grouped by the blog they write on.', embedded)}
    <p class="actions"><a class="btn primary" href="/modules/new">Create module</a><a class="btn" href="/blogs">Explore blogs</a><a class="btn" href="/instructor">Instructor area</a>${u.role === 'admin' ? '<a class="btn" href="/admin/invite">Invite instructor</a>' : ''}</p>
    ${teaching.length ? [...byBlog.entries()].map(([id, ms]) => section(id, ms)).join('') : '<p class="empty">Create your first module. You will choose a new blog for it, or reuse one of your existing blogs.</p>'}`;
  target.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Public link copied.'); } catch { prompt('Public blog link', b.dataset.copy); } });
  // Delete, at the end of each row: the same deletion as on the module's Settings page (a module with posts is refused there and here).
  target.querySelectorAll('[data-delete-module]').forEach(b => b.onclick = async () => {
    if (!confirm(`Delete the module ${b.dataset.label}? Its students lose their place in it and its invitation code stops working. This cannot be undone.`)) return;
    b.disabled = true;
    try { await store.deleteModule(b.dataset.deleteModule); toast('Module deleted.'); await myModules(target, embedded); }
    catch (err) { toast(err.message, 'error'); b.disabled = false; }
  });
}

// ---------- the blog's action row ----------
// Under the masthead of every page of a blog (its canvas, its brief and each of its posts), for a
// signed-in reader: Write your blog post (or Enter invitation code for a reader who belongs to no
// module on it), The brief, and for the blog's instructors Blog settings and Review posts. app.js
// renderHeader leaves the slot and calls this to fill it; a visitor gets no row.
export async function blogActions(id, el) {
  const u = currentUser();
  if (!u) return;
  const [blog, modules, mine] = await Promise.all([store.getBlog(id), store.listModules(), store.listMyModules()]);
  if (!blog || !el.isConnected) return;   // a later navigation has redrawn the header
  const onBlog = modules.filter(m => m.blogId === id), preview = u.studentPreview;   // an instructor seeing the blog as a student of one module
  const myHere = preview ? [] : mine.filter(m => m.blogId === id), writing = preview ? onBlog.find(m => m.id === preview.moduleId) : myHere.find(m => !m.teaching) || myHere[0];
  const owner = instructs(u, blog) || myHere.some(isTeaching);
  el.innerHTML = `${writing ? `<a class="btn primary" href="/write/${esc(writing.id)}">Write your blog post</a>` : '<button class="btn primary" id="join-module">Enter invitation code</button>'}${blog.brief && (owner || myHere.length || preview) ? `<a class="btn" href="/${esc(id)}/brief">The brief</a>` : ''}${owner ? `<a class="btn" href="/blogs/edit/${esc(id)}">Blog settings</a><a class="btn" href="/instructor?blog=${esc(id)}">Review posts</a>` : ''}`;
  el.hidden = false;
  el.querySelector('#join-module')?.addEventListener('click', () => openAuthModal('register'));
}

// ---------- the public blog canvas ----------
// Anyone with the link may open a blog's page, signed in or not, whatever module they belong to:
// the masthead, the menu and the canvas of every published post on the blog, each of which they
// may open and read. Which module a post was written in, and that several modules may write on
// one canvas, is the business of the modules' instructors, the blog's owners and the admin: a
// student (or a visitor) sees no module facet, no module on a card and none on a post. The brief
// and the comments are for the module's members; a signed-in reader who belongs to no module on
// the blog is offered the invitation code instead of the Write button.
export async function blogCanvas(id) {
  const u = currentUser();
  const [blog, modules] = await Promise.all([store.getBlog(id), store.listModules()]);
  if (!blog) { app.innerHTML = '<p class="empty">Blog not found. <a href="/blogs">Explore blogs</a></p>'; return; }
  const onBlog = modules.filter(m => m.blogId === id);
  if (!u) {
    // The posts alone, with nothing above them: no module line, no brief, no button row. Until the
    // rules that open published posts to visitors are deployed, the read fails and the page says so.
    const posts = await store.listPosts({status: 'published', blogId: id}).catch(e => { console.warn('visitor posts', e); return null; });
    app.innerHTML = posts ? canvas(posts, {categories: blog.categories || [], categoryLabel: blog.categoryLabel || 'Category', modules: onBlog, blogs: [blog], emptyText: 'No posts here yet.'})
      : `<section class="coming-soon" aria-label="Posts"><h2>Coming soon</h2><p>Posts by this blog’s students will appear here as they are published.</p></section>`;
    return;
  }
  const [posts, mine] = await Promise.all([store.listPosts({status: 'published', blogId: id}), store.listMyModules()]);
  const preview = u?.studentPreview;   // an instructor seeing the blog as a student of one module
  const myHere = preview ? [] : mine.filter(m => m.blogId === id), writing = preview ? onBlog.find(m => m.id === preview.moduleId) : myHere.find(m => !m.teaching) || myHere[0];
  const owner = instructs(u, blog) || myHere.some(isTeaching);
  // The action row (Write your blog post, The brief, …) is the header's, drawn by blogActions above.
  // The module line above the canvas is the owner's: a student sees no module here, not even their own.
  app.innerHTML = `${owner ? `<p class="page-sub">${esc(onBlog.map(m => m.code || m.title).filter(Boolean).join(' · ') || 'Blog')}</p>` : ''}
    ${owner && onBlog.length ? `<p class="muted small">Modules on this blog: ${onBlog.map(m => `<a href="/modules/edit/${esc(m.id)}">${esc(moduleLabel(m))}</a>`).join(' · ')}</p>` : ''}
    <p class="muted small">${owner ? 'Published posts are public and every module’s students see them all; each module’s discussion is its own, and the instructors on this blog see everything.' : 'Published posts are public. The discussion under each post is for its author’s classmates and their instructors.'}</p>${canvas(posts, {categories: blog.categories || [], categoryLabel: blog.categoryLabel || 'Category', modules: onBlog, blogs: [blog], emptyText: 'No posts here yet.'})}`;
}

// Old `/module/<id>` links land on the module's blog.
export async function moduleRedirect(id) {
  const m = await store.getModule(id), u = currentUser();
  if (!m) { app.innerHTML = '<p class="empty">Module not found. <a href="/blogs">Explore blogs</a></p>'; return; }
  if (m.blogId) { const r = route(), q = new URLSearchParams(r.includes('?') ? r.slice(r.indexOf('?') + 1) : ''); if (!q.get('module') && instructs(u, m)) q.set('module', id); navigate('/' + m.blogId + (q.size ? '?' + q.toString() : ''), {replace: true}); return; }   // the module filter is the instructor's; a student lands on the whole canvas
  app.innerHTML = `<p class="page-sub">${esc(m.code || '')}</p><h1 class="page-title">${esc(m.title)}</h1><p class="empty">This module’s blog is not set up yet.${instructs(u, m) ? ` <a href="/modules/edit/${esc(id)}">Attach it to a blog</a>.` : ''}</p>`;
}

// ---------- the brief: a blog's exercise, with the reader's own deadlines ----------
// For the blog's members and instructors only: unlike the canvas, a visitor is asked to log in.
export async function briefPage(id) {
  const u = currentUser();
  if (!u) { app.innerHTML = '<p class="empty">This brief is for the members of its blog. <button class="btn primary" id="brief-signin">Log in</button></p>'; app.querySelector('#brief-signin').addEventListener('click', () => openAuthModal()); return; }
  if (!(await memberOfBlog(id))) { app.innerHTML = '<p class="empty">This brief is for the members of its blog.</p>'; return; }
  const [blog, modules, mine] = await Promise.all([store.getBlog(id), store.listModules(), u ? store.listMyModules() : []]);
  if (!blog) { app.innerHTML = '<p class="empty">Blog not found.</p>'; return; }
  const preview = u?.studentPreview, myHere = preview ? modules.filter(m => m.id === preview.moduleId && m.blogId === id) : mine.filter(m => m.blogId === id && !m.teaching), cohort = myHere[0] || null;
  const words = blog.minWords && blog.maxWords ? `${blog.minWords}–${blog.maxWords} words` : blog.maxWords ? `up to ${blog.maxWords} words` : '';
  const editable = instructs(u, blog);   // the blog's instructors and the admin edit the brief here, in the post editor's sheet (brief-editor.js); a student preview reads it as a student
  app.innerHTML = `<div class="guide"><p class="page-sub crumb"><a href="/${esc(id)}">${esc(blog.title)}</a></p><h1 class="page-title">The brief</h1>
    ${editable ? '<p class="actions brief-tools"><button type="button" class="btn small" id="brief-edit">Edit the brief</button></p>' : ''}
    ${blog.brief ? `<div class="body brief-body">${sanitize(blog.brief)}</div>` : `<p class="muted">${editable ? 'There is no brief yet: <b>Edit the brief</b> opens the editor.' : 'The instructor has not written a brief for this blog yet.'}</p>`}
    <h2 class="page-title" style="font-size:20px;margin-top:30px">How publishing works here</h2>
    <ol class="steps">
      <li><b>Log in.</b> Your posts and comments appear under an <b>alias</b> generated at random when your account was created, with the date of publication; your instructor alone sees who is behind it.</li>
      <li><b>Write</b> your post in the editor: a title, a subtitle and the text, with hyperlinks to your sources, images and tables.${words ? ` The word meter follows the ${words} target (tables and captions are not counted).` : ''}</li>
      <li><b>Save a draft</b> as often as you like. Drafts are private to you and your instructor.</li>
      <li><b>Publish</b> when you are done.${cohort?.requireApproval ? ' Your instructor checks each post before it appears on the blog.' : ' Your post appears on the blog immediately and its address never changes.'}</li>
      <li><b>Discuss.</b> Read the other posts from your module and answer the open questions they raise in the comments. A published post is public, and the discussion under it is for the students of its module and their instructors.</li>
    </ol>
    ${myHere.filter(m => m.deadline || m.brightspaceUrl).map(m => `<div class="notice">${esc(moduleLabel(m))}${m.deadline ? `: deadline <b>${fmtDate(m.deadline)}</b>` : ''}${m.submissionsOpen === false ? ' — submissions are now closed.' : ''}${m.brightspaceUrl ? ` · <a href="${esc(m.brightspaceUrl)}" target="_blank" rel="noopener">Module page on Brightspace</a>` : ''}</div>`).join('')}
    ${cohort ? `<p><a class="btn primary" href="/write/${esc(cohort.id)}">Start writing</a></p>` : ''}
    ${instructs(u, blog) || mine.some(m => m.blogId === id && isTeaching(m)) ? `<p class="muted small">Modules writing on this blog: ${esc(modules.filter(m => m.blogId === id).map(moduleLabel).join(' · ') || 'none yet')}.</p>` : ''}</div>`;
  enhance(app.querySelector('.brief-body'));   // code blocks, LaTeX and the other rich blocks of the editor render as on a post
  // Save writes the brief alone to the blog; the store's change notice then redraws this page with it.
  app.querySelector('#brief-edit')?.addEventListener('click', () => editBrief({html: blog.brief || '', blogTitle: blog.title, save: async html => { await store.saveBlog({id, brief: html}); toast('Brief saved.'); }}));
}

// ---------- module settings: cohort + which blog it writes on ----------
export async function manageModule(id) {
  const u = currentUser();
  if (!staff(u)) { app.innerHTML = '<p class="empty">Instructor access required.</p>'; return; }
  const [m, myBlogs] = await Promise.all([id ? store.getModule(id) : null, store.listMyBlogs()]);
  if (id && (!m || !instructs(u, m))) { app.innerHTML = '<p class="empty">You cannot manage this module.</p>'; return; }
  const existingBlogs = myBlogs.filter(b => b.id !== '');
  const chooseExisting = existingBlogs.length > 0 && (!m || !!m.blogId);
  app.innerHTML = `<div class="guide"><p class="page-sub crumb"><a href="/my-modules">My modules</a></p><h1 class="page-title">${m ? 'Module settings' : 'Create a module'}</h1><p class="page-sub">A module is a course you teach: its students and their deadline. Create it once and reuse it every year; each post is stamped with the academic year it was published in, so a blog can be filtered by year. Its posts appear on a blog that it may share with your other modules.</p>
    <form id="module-form">
    <label class="field">Module code<input name="code" maxlength="40" placeholder="e.g. BMGT45540" value="${esc(m?.code || '')}"></label>
    <label class="field">Module title<input name="title" required maxlength="160" placeholder="e.g. Managing Innovative Projects" value="${esc(m?.title || '')}"></label>
    <label class="field">Description for students (optional)<textarea name="description" maxlength="1200" rows="3">${esc(m?.description || '')}</textarea></label>
    <label class="field">Module Brightspace page URL (optional)<input name="brightspaceUrl" type="url" maxlength="300" placeholder="https://brightspace.ucd.ie/d2l/le/lessons/…" value="${esc(m?.brightspaceUrl || '')}"><p class="hint">Linked from the student's module card and the brief, so they can get back to Brightspace in one click.</p></label>
    <fieldset class="field blog-choice"><legend>Blog canvas</legend>
      ${existingBlogs.length ? `<label class="check"><input type="radio" name="blogMode" value="existing" ${chooseExisting ? 'checked' : ''}> Post to one of my existing blogs</label>
      <label class="field indent">Blog<select name="blogId">${existingBlogs.map(b => `<option value="${esc(b.id)}" ${m?.blogId === b.id ? 'selected' : ''}>${esc(b.title)}</option>`).join('')}</select></label>` : ''}
      <label class="check"><input type="radio" name="blogMode" value="new" ${chooseExisting ? '' : 'checked'}> Create a new, separate blog for this module</label>
      <div class="indent new-blog"><label class="field">Blog title<input name="blogTitle" maxlength="160" placeholder="e.g. Operations"></label>
      <label class="field">Public URL name<input name="blogUrl" minlength="2" maxlength="80" pattern="[a-z0-9][a-z0-9\\-]+" placeholder="e.g. operations"><p class="hint">${esc(publicUrl('/'))}<b>url-name</b> — lowercase letters, numbers and hyphens; fixed after creation. A few names belong to pages of the site (posts, blogs, admin…). The brief, categories and word target are set afterwards in Blog settings.</p></label></div>
    </fieldset>
    <label class="field">Deadline (optional)<input name="deadline" type="date" value="${esc(m?.deadline || '')}"><p class="hint">For information only: shown to students on their module card, in the brief and in your modules list. It does not lock anything. Students can write, publish and edit their posts until you untick <b>Students can write, publish and edit their posts</b> below, which you would normally do once the deadline has passed.</p></label>
    <label class="check"><input type="checkbox" name="submissionsOpen" ${m?.submissionsOpen !== false ? 'checked' : ''}> Students can write, publish and edit their posts</label>
    <p class="hint indent">Normally ticked until the deadline has passed. Untick to close submissions: students can still read the blog, but not write, edit or publish.</p>
    ${u.role === 'admin' ? `<fieldset class="field peer-option"><legend>Peer review of classmates’ posts</legend>
      <label class="check"><input type="checkbox" name="peerReview" ${m?.peerReview ? 'checked' : ''}> Students assess each other’s posts in this module</label>
      <p class="hint indent">Your option alone, off unless you turn it on for a given module and year. Once submissions are closed, assign the posts at <a href="/admin/peer${m ? '?module=' + esc(m.id) : ''}">Peer review</a>.</p>
      <label class="field indent">Peer review deadline<input name="peerDeadline" type="date" value="${esc(m?.peerDeadline || '')}"><p class="hint">Shown to students once their posts are assigned; assessments close at the end of that day, or when you close the round. For a new academic year, set both deadlines here, reopen submissions, and delete last year’s round before assigning again.</p></label></fieldset>` : ''}
    <p class="actions"><button class="btn primary">${m ? 'Save module' : 'Create module'}</button><a class="btn" href="/my-modules">Cancel</a></p><p class="auth-msg" aria-live="polite"></p></form>
    ${m ? `<section class="blog-group"><h2 class="group-title">Delete this module</h2><p class="hint">Removes the module and its roster; its invitation code is retired. The blog stays, as do the posts of any other module on it. A module with posts cannot be deleted: delete its posts from Review posts first, or keep the module and reuse it next year.</p><p class="actions"><button class="btn danger" id="delete-module">Delete module</button></p><p class="auth-msg" id="delete-msg" aria-live="polite"></p></section>` : ''}</div>`;
  app.querySelector('#delete-module')?.addEventListener('click', async e => {
    if (!confirm(`Delete the module ${moduleLabel(m)}? Its students lose their place in it and its invitation code stops working. This cannot be undone.`)) return;
    e.target.disabled = true;
    try { await store.deleteModule(m.id); toast('Module deleted.'); navigate('/my-modules'); }
    catch (err) { app.querySelector('#delete-msg').textContent = err.message; e.target.disabled = false; }
  });
  const form = app.querySelector('form'), modeInputs = [...form.querySelectorAll('[name=blogMode]')];
  const sync = () => { const mode = form.querySelector('[name=blogMode]:checked')?.value || 'new'; form.querySelector('.new-blog').hidden = mode !== 'new'; const sel = form.querySelector('[name=blogId]'); if (sel) sel.closest('label').hidden = mode !== 'existing'; };
  modeInputs.forEach(i => i.onchange = sync); sync();
  const blogTitle = form.elements.namedItem('blogTitle'), blogUrlInput = form.elements.namedItem('blogUrl');
  blogTitle.addEventListener('input', () => { if (!blogUrlInput.dataset.edited) blogUrlInput.value = slugify(blogTitle.value).slice(0, 80); });
  blogUrlInput.addEventListener('input', () => blogUrlInput.dataset.edited = 'true');
  form.onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(form)), button = form.querySelector('button'); button.disabled = true;
    try {
      const data = {id: m?.id, title: d.title, code: d.code, description: d.description, deadline: d.deadline || '', brightspaceUrl: d.brightspaceUrl || '', submissionsOpen: !!d.submissionsOpen, requireApproval: false};   // posts go live when a student publishes; there is no moderation step
      if (u.role === 'admin') { data.peerReview = !!d.peerReview; data.peerDeadline = d.peerDeadline || ''; }   // the peer-review option is the admin's alone; other instructors' saves leave it as it is
      if ((d.blogMode || 'new') === 'new') { if (!d.blogTitle?.trim() || !d.blogUrl?.trim()) throw Error('Give the new blog a title and a URL name.'); data.newBlog = {title: d.blogTitle.trim(), urlName: d.blogUrl.trim()}; }
      else data.blogId = d.blogId;
      const saved = await store.saveModule(data);
      toast(m ? 'Module saved.' : 'Module created.');
      navigate(m ? '/my-modules' : '/blogs/edit/' + saved.blogId);
    } catch (err) { form.querySelector('.auth-msg').textContent = err.message; } finally { button.disabled = false; }
  };
}

// ---------- blog settings: the exercise ----------
const briefPreview = html => html ? `<div class="body">${sanitize(html)}</div>` : '<p class="muted">No brief yet.</p>';
export async function manageBlog(id) {
  const u = currentUser();
  const [b, modules] = await Promise.all([store.getBlog(id), store.listModules()]);
  if (!b || !instructs(u, b)) { app.innerHTML = '<p class="empty">Only this blog’s instructor can change its settings.</p>'; return; }
  const lines = arr => (arr || []).join('\n');
  app.innerHTML = `<div class="guide"><p class="page-sub crumb"><a href="/${esc(id)}">${esc(b.title)}</a></p><h1 class="page-title">Blog settings</h1><p class="page-sub">What every module writing on this blog shares: the brief, the categories, the word target and the comments policy. Public link: <a href="${esc(blogUrl(id))}">${esc(blogUrl(id))}</a></p>
    <form id="blog-form">
    <label class="field">Blog title<input name="title" required maxlength="160" value="${esc(b.title)}"></label>
    <label class="field">Description (shown above the canvas)<textarea name="description" maxlength="1200" rows="3">${esc(b.description || '')}</textarea></label>
    <div class="field brief-field"><span class="field-label">The brief (shown on “The brief” and linked from the editor)</span>
      <div class="brief-preview" id="brief-preview">${briefPreview(b.brief)}</div>
      <p class="actions"><button type="button" class="btn small" id="brief-edit">${b.brief ? 'Edit the brief' : 'Write the brief'}</button><span class="hint" id="brief-hint">Opens the editor. The brief is saved with the rest of the settings by <b>Save blog</b>.</span></p>
      <input type="hidden" name="brief" value="${esc(b.brief || '')}"></div>
    <div class="two-col">
      <div><label class="field">Category label<input name="categoryLabel" maxlength="40" placeholder="e.g. Megatrend" value="${esc(b.categoryLabel || '')}"></label>
      <label class="field">Categories (one per line: <code>slug | Name</code>; leave empty for none)<textarea name="categories" rows="7">${esc((b.categories || []).map(c => c.slug + ' | ' + c.name).join('\n'))}</textarea></label>
      <label class="field">Organisation field label (empty hides the field)<input name="organisationLabel" maxlength="60" placeholder="e.g. Organisation(s) studied" value="${esc(b.organisationLabel || '')}"></label></div>
      <div><label class="field">Word target (min and max; 0 for none)<span style="display:flex;gap:8px"><input name="minWords" type="number" min="0" value="${b.minWords || 0}"><input name="maxWords" type="number" min="0" value="${b.maxWords || 0}"></span></label>
      <label class="field">Checklist shown beside the editor (one item per line)<textarea name="checklist" rows="7">${esc(lines(b.checklist))}</textarea></label>
      <label class="check"><input type="checkbox" name="allowComments" ${b.allowComments !== false ? 'checked' : ''}> Allow comments on published posts</label></div>
    </div>
    <label class="field">Reply rules (shown under the comment box on every post of this blog; empty restores the default)<textarea name="replyRules" maxlength="1000" rows="3" placeholder="${esc(DEFAULT_REPLY_RULES)}">${esc(b.replyRules || '')}</textarea></label>
    <label class="field">Outline the student can insert (HTML; <code>{organisation}</code> and <code>{category}</code> are filled in)<textarea name="outline" rows="8">${esc(b.outline || '')}</textarea></label>
    <p class="actions"><button class="btn primary">Save blog</button><a class="btn" href="/${esc(id)}">Back to the blog</a></p><p class="auth-msg" aria-live="polite"></p></form>
    <h2 class="page-title" style="font-size:20px;margin-top:30px">Modules writing on this blog</h2>
    ${modules.filter(m => m.blogId === id).map(m => `<p>${esc(moduleLabel(m))}${instructs(u, m) ? ` · <a href="/modules/edit/${esc(m.id)}">Settings</a> · <a href="/modules/invite/${esc(m.id)}">Invite students</a>` : ''}</p>`).join('') || '<p class="muted">None yet. <a href="/modules/new">Create a module</a> and choose this blog.</p>'}</div>`;
  // The brief is edited in the post editor's sheet (brief-editor.js); Done puts the HTML in the hidden
  // field and the preview, and Save blog stores it with everything else, so a half-edited form is kept.
  app.querySelector('#brief-edit').onclick = () => {
    const field = app.querySelector('#blog-form').elements.brief;
    editBrief({html: field.value, blogTitle: b.title, action: 'Done', note: 'Click Done, then Save blog to keep the new brief.', save: html => {
      field.value = html; app.querySelector('#brief-preview').innerHTML = briefPreview(html); app.querySelector('#brief-edit').textContent = html ? 'Edit the brief' : 'Write the brief';
      app.querySelector('#brief-hint').innerHTML = '<b>Changed.</b> Click <b>Save blog</b> below to keep it.';
    }});
  };
  app.querySelector('#blog-form').onsubmit = async e => {
    e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f)), button = f.querySelector('button[type=submit], button:not([type])'); button.disabled = true;
    try {
      if (+d.minWords > +d.maxWords && +d.maxWords > 0) throw Error('The minimum word count cannot exceed the maximum.');
      await store.saveBlog({id, title: d.title.trim(), description: d.description.trim(), brief: d.brief, categoryLabel: d.categoryLabel.trim() || 'Category', organisationLabel: d.organisationLabel.trim(), minWords: +d.minWords || 0, maxWords: +d.maxWords || 0, outline: d.outline, allowComments: !!d.allowComments, replyRules: d.replyRules.trim(),
        categories: d.categories.split('\n').map(l => l.split('|')).filter(a => a[0]?.trim()).map(a => ({slug: slugify(a[0]), name: (a[1] || a[0]).trim()})).slice(0, 30),
        checklist: d.checklist.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 12)});
      toast('Blog saved.'); navigate('/' + id);
    } catch (err) { f.querySelector('.auth-msg').textContent = err.message; } finally { button.disabled = false; }
  };
}

// ---------- invitations (admin → instructor; instructor → students) ----------
export async function invitationsPage(target = app, embedded = false, {heading = true} = {}) {
  if(currentUser()?.role!=='admin'){target.innerHTML='<p class="empty">Admin access required.</p>';return;}
  const invites=await store.listTeacherInvites();
  target.innerHTML=`${heading ? pageHead('Invite an instructor', 'Generate an invitation code and invitation link for one instructor. It expires after seven days and is tied to the email addresses below.', embedded) : '<p class="section-sub">Generate an invitation code and invitation link for one instructor. It expires after seven days and is tied to the email addresses below.</p>'}
    <form id="invite-form" class="guide"><label class="field">Instructor’s university email<input type="email" name="universityEmail" required maxlength="200"></label><label class="field">Instructor’s Gmail for Google sign-in (optional)<input type="email" name="gmail" maxlength="200"></label><button class="btn primary">Generate invitation code and invitation</button><p class="auth-msg" aria-live="polite"></p></form>
    <div id="new-invite" aria-live="polite"></div><h2>Invitations</h2><table class="list"><thead><tr><th>University email</th><th>Invitation code</th><th>Status</th><th>Expires</th><th></th></tr></thead><tbody>${invites.map(i=>`<tr><td>${esc(i.ucdEmail)}</td><td>${esc(i.code||'—')}</td><td>${i.revoked?'Revoked':i.acceptedBy?'Accepted':i.expiresAt<Date.now()?'Expired':'Pending'}</td><td>${fmtDateTime(i.expiresAt)}</td><td>${!i.acceptedBy&&!i.revoked?`<button class="linkish" data-revoke="${esc(i.id)}">Revoke</button>`:''}</td></tr>`).join('')}</tbody></table>`;
  target.querySelector('#invite-form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button');b.disabled=true;try{const invite=await store.createTeacherInvite(Object.fromEntries(new FormData(f)));await invitationsPage(target, embedded, {heading});const url=publicUrl(invitationRoute({kind:'instructor',inviteId:invite.id,code:invite.code.toLowerCase()}));target.querySelector('#new-invite').innerHTML=`<div class="notice ok"><b>Invitation code: ${esc(invite.code)}</b><label class="field">Instructor registration link<input readonly value="${esc(url)}" onclick="this.select()"></label><p class="small">The code is prefilled by this link. Share it only with the invited instructor.</p></div>`;}catch(err){f.querySelector('.auth-msg').textContent=err.message;}finally{b.disabled=false;}};
  target.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=async()=>{try{await store.revokeTeacherInvite(b.dataset.revoke);await invitationsPage(target, embedded, {heading});}catch(e){toast(e.message,'error');}});
}

// An instructor's link carries the invitation id, a module's the blog's URL name: either must
// agree with the code, so a city's link pasted under another blog, or a retired link, goes nowhere.
export async function acceptInvitationPage(ref,code='',kind='instructor') {
  const u=currentUser();
  let info;try{info=await store.resolveRegistrationCode(code);if(info.kind!==kind||(kind==='instructor'?info.inviteId:info.blogId)!==ref)throw Error(kind==='student'?'This invitation link is not the one for this blog.':'The invitation link and invitation code do not match.');}catch(e){app.innerHTML=`<p class="empty">${esc(e.message)} ${kind==='student'?'Ask your instructor for the module’s current invitation link, or use Register to enter your invitation code.':'Use Register to enter your invitation code.'}</p>`;return;}
  const module=kind==='student'?await store.getModule(info.moduleId):null;
  const blog=module?.blogId?await store.getBlog(module.blogId):null;
  app.innerHTML=`<div class="guide"><h1 class="page-title">${kind==='instructor'?'Instructor invitation':esc(module?.title||'Module invitation')}</h1><p>Invitation code: <b>${esc(info.code)}</b>. ${kind==='instructor'?'Use the university email or Gmail address your admin invited.':`This invitation enrols you in ${esc(moduleLabel(module||{}))}${blog?`, which writes on the <b>${esc(blog.title)}</b> blog`:''}.`}</p>
    ${!u?'<p class="actions"><button class="btn primary" id="instructor-register">Register with this invitation</button><button class="btn" id="instructor-login">I already have an account</button></p>':`<p>Signed in as <b>${esc(u.email)}</b>.</p><p class="actions"><button class="btn" id="instructor-details">Complete profile</button><button class="btn primary" id="accept-invite">${kind==='instructor'?'Activate instructor access':'Join the module'}</button></p>${!u.emailVerified?'<p class="notice">Verify your sign-in email first. Use your account menu to resend the verification email and refresh verification.</p>':''}`}
    <p class="auth-msg" aria-live="polite"></p></div>`;
  app.querySelector('#instructor-register')?.addEventListener('click',()=>openAuthModal('register',info));
  app.querySelector('#instructor-login')?.addEventListener('click',()=>openAuthModal('signin',info));
  app.querySelector('#instructor-details')?.addEventListener('click',()=>openAuthModal('complete',info));
  app.querySelector('#accept-invite')?.addEventListener('click',async e=>{e.target.disabled=true;try{if(kind==='instructor'){await store.acceptTeacherInvite(info.inviteId);toast('Instructor access activated.');navigate('/my-modules');}else{await store.joinModule(info.moduleId,info.inviteId);toast('Welcome. You can now write your blog post.');navigate(blog?'/'+blog.id:'/my-modules');}}catch(err){app.querySelector('.auth-msg').textContent=err.code==='permission-denied'?'Use the verified email address specified in your invitation.':err.message;e.target.disabled=false;}});
}

// A module's invitation is one of eight cities: its link is the blog's address plus the city
// (/project-management/join/madrid) and its code the city, for every year's cohort, until the
// instructor chooses another city. One city serves one module at a time across the platform.
export async function studentInvitationsPage(moduleId){
 const m=await store.getModule(moduleId),u=currentUser();
 if(!m||!instructs(u,m)){app.innerHTML='<p class="empty">Only the module’s instructor or platform admin can invite students.</p>';return;}
 const [invites,cities]=await Promise.all([store.listModuleInvites(moduleId),store.joinCityStatus()]);
 const current=invites.find(i=>!i.revoked&&!isRetiredStudentCode(i)),retired=invites.filter(i=>!i.revoked&&isRetiredStudentCode(i));
 const link=i=>publicUrl(invitationRoute({kind:'student',blogId:i.blogId||m.blogId,code:i.code}));
 const options=JOIN_CITIES.map(c=>{const mine=c===current?.code,taken=!mine&&cities[c]&&cities[c].moduleId!==moduleId;return `<option value="${c}" ${mine||taken?'disabled':''}>${cityLabel(c)}${mine?' (the current code)':taken?' (in use by another module)':''}</option>`;}).join('');
 app.innerHTML=`<p class="page-sub crumb"><a href="/my-modules">My modules</a></p><h1 class="page-title">Invite students</h1><p class="page-sub">${esc(moduleLabel(m))}</p>
  <p>The module’s invitation is a city. Its link is the blog’s address plus the city and its code is the city: students open the link, or enter the code when they register, and land in this module only, so on a blog shared by several modules each module has its own city. The link stays the same for every year’s cohort until you choose another city here, which retires the old link at once; students already enrolled stay enrolled.</p>
  ${!m.blogId?'<p class="notice">Give the module a blog in its settings first: the invitation link is the blog’s address.</p>':current?`<div class="notice ok"><p><b>Invitation code: ${esc(current.code)}</b></p><label class="field">Student invitation link<input readonly value="${esc(link(current))}" onclick="this.select()"></label><p class="actions"><button class="btn small" data-copy="${esc(link(current))}">Copy link</button><button class="btn small" id="revoke-student-invite">Retire the link</button></p></div>`:'<p class="notice">This module has no invitation link yet. Choose a city below.</p>'}
  ${m.blogId?`<form id="city-form"><label class="field">${current?'Choose a different city':'City'}<select name="city"><option value="">Choose a city…</option>${options}</select><p class="hint">A city serves one module at a time across the platform; the greyed ones are taken.</p></label><p class="actions"><button class="btn primary">${current?'Switch to this city':'Create the invitation link'}</button><a class="btn" href="/instructor?module=${esc(moduleId)}">View roster</a></p><p class="auth-msg" aria-live="polite"></p></form>`:''}
  ${retired.length?`<p class="muted small">The codes from before 3 November 2026 (${retired.map(i=>esc(i.code)).join(', ')}) are retired and no longer accepted; choosing a city above revokes them.</p>`:''}
  <p><a href="/my-modules">Back to my modules</a></p>`;
 app.querySelector('#city-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button'),city=f.city.value;if(!city){f.querySelector('.auth-msg').textContent='Choose a city.';return;}b.disabled=true;try{await store.createModuleInvite(moduleId,city);toast(`The invitation code is now ${city}.`);await studentInvitationsPage(moduleId);}catch(err){f.querySelector('.auth-msg').textContent=err.message;b.disabled=false;}});
 app.querySelector('#revoke-student-invite')?.addEventListener('click',async()=>{if(!confirm('Retire this invitation link? Nobody can join with it until you choose a city again; students already enrolled stay.'))return;try{await store.revokeModuleInvite(current.id);toast('Invitation link retired.');await studentInvitationsPage(moduleId);}catch(err){toast(err.message,'error');}});
 app.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);toast('Link copied.');}catch{prompt('Student invitation link',b.dataset.copy);}});
}
