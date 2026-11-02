// Blogs, modules and invitations.
//   A BLOG is a public canvas plus the exercise written on it (brief, categories,
//   word target, outline, checklist, comments policy). It is owned by instructors.
//   A MODULE is a cohort: code, academic year, roster, invitations, deadline and
//   moderation settings. Every module posts to exactly one blog, and several
//   modules of the same instructor may share one blog canvas.
import {store, canReadBlog} from './store.js';
import {currentUser, openAuthModal, invitationRoute} from './auth.js';
import {renderWelcome, bindWelcome} from './welcome.js';
import {esc, toast, slugify, fmtDate, fmtDateTime, sanitize, pageHead} from './util.js';
import {PM_EXERCISE} from './seed.js';
import {route, navigate, publicUrl} from './router.js';

let app, canvas;
export function configurePlatform(target, renderCanvas) { app = target; canvas = renderCanvas; }
export const blogUrl = id => publicUrl('/' + encodeURIComponent(id));
const staff = u => u && ['admin', 'lecturer'].includes(u.role);
const instructs = (u, x) => !!u && !u.studentPreview && (u.role === 'admin' || (x?.teacherIds || []).includes(u.uid));   // a student preview hides the instructor's controls
const moduleLabel = m => [m.code, m.title].filter(Boolean).join(' ') + (m.academicYear ? ` (${m.academicYear})` : '');
const isTeaching = m => m.teaching;

// ---------- directory: every blog, with the modules writing on it ----------
export async function blogDirectory() {
  const u = currentUser();
  if (!u) { app.innerHTML = renderWelcome(); bindWelcome(app); return; }   // the front door: no blogs, posts or comments before signing in
  const [blogs, modules] = await Promise.all([store.listBlogs(), store.listModules()]);
  const card = b => { const ms = modules.filter(m => m.blogId === b.id); return `<article class="module-card"><p class="page-sub">${ms.length ? esc(ms.map(m => m.code || m.title).join(' · ')) : 'Blog'}</p><h2><a href="/${esc(b.id)}">${esc(b.title)}</a></h2><p>${esc(b.description || '')}</p><div class="actions"><a class="btn small" href="/${esc(b.id)}">Open blog</a>${instructs(u, b) ? `<a class="btn small" href="/blogs/edit/${esc(b.id)}">Blog settings</a>` : ''}</div></article>`; };
  // Each person sees the blogs they belong to; the admin sees them all.
  app.innerHTML = `<h1 class="page-title">${u.role === 'admin' ? 'Explore blogs' : 'My blogs'}</h1><p class="page-sub">${u.role === 'admin' ? 'Every blog on the platform, with the modules writing on it.' : 'The blogs your modules write on. Each blog is visible to its members and instructors only.'}</p>
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
    // Students: the blog(s) of the module(s) they belong to, and the way to write.
    target.innerHTML = `${pageHead('My modules', `Writing as <b>${esc(u.penName)}</b> · <a href="/profile">Edit profile</a>`, embedded)}
      ${mine.length ? `<div class="module-grid">${mine.map(m => { const b = blogOf(m.blogId); return `<article class="module-card"><p class="page-sub">${esc(m.code || 'Module')}${m.academicYear ? ' · ' + esc(m.academicYear) : ''}</p><h2>${esc(m.title)}</h2><p>${b ? `Posts go to the <a href="/${esc(b.id)}">${esc(b.title)}</a> blog.` : 'This module has no blog yet.'}${m.deadline ? ` Deadline <b>${fmtDate(m.deadline)}</b>.` : ''}</p><div class="actions">${b ? `<a class="btn primary" href="/write/${esc(m.id)}">Write your blog post</a><a class="btn" href="/${esc(b.id)}">Open blog</a><a class="btn small" href="/${esc(b.id)}/brief">The brief</a>` : ''}</div></article>`; }).join('')}</div>` : '<p class="empty">You have not joined a module yet. Enter the invitation code from your instructor.</p>'}
      <p class="actions"><a class="btn" href="/mine">My posts</a><button class="btn" id="platform-register">Enter an invitation code</button></p>`;
    target.querySelector('#platform-register')?.addEventListener('click', () => openAuthModal('register'));
    return;
  }
  const teaching = mine.filter(isTeaching), byBlog = new Map();
  for (const m of teaching) (byBlog.get(m.blogId || '') || byBlog.set(m.blogId || '', []).get(m.blogId || '')).push(m);
  const section = (blogId, ms) => { const b = blogOf(blogId); return `<section class="blog-group"><h2 class="group-title">${b ? `<a href="/${esc(b.id)}">${esc(b.title)}</a>` : 'Modules without a blog'}</h2>${b ? `<p class="actions small"><a href="/blogs/edit/${esc(b.id)}">Blog settings</a><a href="/${esc(b.id)}/brief">Brief</a><a href="/review?blog=${esc(b.id)}">Review posts</a><button class="linkish" data-copy="${esc(blogUrl(b.id))}">Copy public link</button></p>` : '<p class="muted small">Open each module’s settings to attach it to a blog.</p>'}
    <table class="list"><thead><tr><th>Module</th><th>Academic year</th><th>Deadline</th><th>Submissions</th><th></th></tr></thead><tbody>${ms.map(m => `<tr><td><b>${esc(m.code || '')}</b> ${esc(m.title)}</td><td>${esc(m.academicYear || '—')}</td><td>${m.deadline ? fmtDate(m.deadline) : '—'}</td><td>${m.submissionsOpen === false ? 'Closed' : 'Open'}${m.requireApproval ? ' · approval' : ''}</td><td class="actions"><a href="/modules/edit/${esc(m.id)}">Settings</a><a href="/modules/invite/${esc(m.id)}">Invite students</a><a href="/review/roster?module=${esc(m.id)}">Roster</a><a href="/review?module=${esc(m.id)}">Posts</a></td></tr>`).join('')}</tbody></table></section>`; };
  target.innerHTML = `${pageHead(embedded ? 'Manage modules' : 'My modules', 'Your teaching modules, grouped by the blog they write on.', embedded)}
    <p class="actions"><a class="btn primary" href="/modules/new">Create module</a><a class="btn" href="/blogs">Explore blogs</a><a class="btn" href="/review">Instructor area</a>${u.role === 'admin' ? '<a class="btn" href="/admin/invite">Invite instructor</a>' : ''}</p>
    ${teaching.length ? [...byBlog.entries()].map(([id, ms]) => section(id, ms)).join('') : '<p class="empty">Create your first module. You will choose a new blog for it, or reuse one of your existing blogs.</p>'}`;
  target.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Public link copied.'); } catch { prompt('Public blog link', b.dataset.copy); } });
}

// ---------- the public blog canvas ----------
export async function blogCanvas(id) {
  const u = currentUser();
  if (!(await canReadBlog(id))) { app.innerHTML = `<p class="empty">This blog is for the members of its modules and their instructors. ${u ? '<button class="btn primary" id="join-module">Enter invitation code</button>' : ''}</p>`; app.querySelector('#join-module')?.addEventListener('click', () => openAuthModal('register')); return; }
  const [blog, modules] = await Promise.all([store.getBlog(id), store.listModules()]);
  if (!blog) { app.innerHTML = '<p class="empty">Blog not found. <a href="/blogs">Explore blogs</a></p>'; return; }
  const onBlog = modules.filter(m => m.blogId === id);
  const [posts, mine] = await Promise.all([store.listPosts({status: 'published', blogId: id}), u ? store.listMyModules() : []]);
  const preview = u?.studentPreview;   // an instructor seeing the blog as a student of one module
  const myHere = preview ? [] : mine.filter(m => m.blogId === id), writing = preview ? onBlog.find(m => m.id === preview.moduleId) : myHere.find(m => !m.teaching) || myHere[0];
  const owner = instructs(u, blog) || myHere.some(isTeaching);
  app.innerHTML = `<p class="page-sub">${onBlog.length ? esc(onBlog.map(m => m.code || m.title).join(' · ')) : 'Blog'}</p><h1 class="page-title">${esc(blog.title)}</h1><p>${esc(blog.description || '')}</p>
    <p class="actions">${u ? writing ? `<a class="btn primary" href="/write/${esc(writing.id)}">Write your blog post</a>` : '<button class="btn primary" id="join-module">Enter invitation code</button>' : '<button class="btn primary" id="join-signin">Log in</button>'}${blog.brief ? `<a class="btn" href="/${esc(id)}/brief">The brief</a>` : ''}${owner ? `<a class="btn" href="/blogs/edit/${esc(id)}">Blog settings</a><a class="btn" href="/review?blog=${esc(id)}">Review posts</a>` : ''}<button class="btn small" id="copy-blog-link">Copy link</button></p>
    ${owner && onBlog.length ? `<p class="muted small">Modules on this blog: ${onBlog.map(m => `<a href="/modules/edit/${esc(m.id)}">${esc(moduleLabel(m))}</a>`).join(' · ')}</p>` : ''}
    <p class="muted small">Visible to the members of this blog's modules and their instructors.</p>${canvas(posts, {categories: blog.categories || [], categoryLabel: blog.categoryLabel || 'Category', modules: onBlog, blogs: [blog], emptyText: 'No posts here yet.'})}`;
  app.querySelector('#join-signin')?.addEventListener('click', () => openAuthModal());
  app.querySelector('#join-module')?.addEventListener('click', () => openAuthModal('register'));
  app.querySelector('#copy-blog-link').onclick = async () => { try { await navigator.clipboard.writeText(blogUrl(id)); toast('Link copied.'); } catch { prompt('Blog link', blogUrl(id)); } };
}

// Old `/module/<id>` links land on the module's blog.
export async function moduleRedirect(id) {
  const m = await store.getModule(id), u = currentUser();
  if (!m) { app.innerHTML = '<p class="empty">Module not found. <a href="/blogs">Explore blogs</a></p>'; return; }
  if (m.blogId) { const r = route(), q = new URLSearchParams(r.includes('?') ? r.slice(r.indexOf('?') + 1) : ''); if (!q.get('module')) q.set('module', id); navigate('/' + m.blogId + '?' + q.toString(), {replace: true}); return; }
  app.innerHTML = `<p class="page-sub">${esc(m.code || '')}</p><h1 class="page-title">${esc(m.title)}</h1><p class="empty">This module’s blog is not set up yet.${instructs(u, m) ? ` <a href="/modules/edit/${esc(id)}">Attach it to a blog</a>.` : ''}</p>`;
}

// ---------- the brief: a blog's exercise, with the reader's own deadlines ----------
export async function briefPage(id) {
  const u = currentUser();
  if (!(await canReadBlog(id))) { app.innerHTML = '<p class="empty">This brief is for the members of its blog.</p>'; return; }
  const [blog, modules, mine] = await Promise.all([store.getBlog(id), store.listModules(), u ? store.listMyModules() : []]);
  if (!blog) { app.innerHTML = '<p class="empty">Blog not found.</p>'; return; }
  const preview = u?.studentPreview, myHere = preview ? modules.filter(m => m.id === preview.moduleId && m.blogId === id) : mine.filter(m => m.blogId === id && !m.teaching), cohort = myHere[0] || null;
  const words = blog.minWords && blog.maxWords ? `${blog.minWords}–${blog.maxWords} words` : blog.maxWords ? `up to ${blog.maxWords} words` : '';
  app.innerHTML = `<div class="guide"><p class="page-sub crumb"><a href="/${esc(id)}">${esc(blog.title)}</a></p><h1 class="page-title">The brief</h1>
    ${blog.brief ? `<div class="body">${sanitize(blog.brief)}</div>` : '<p class="muted">The instructor has not written a brief for this blog yet.</p>'}
    <h2 class="page-title" style="font-size:20px;margin-top:30px">How publishing works here</h2>
    <ol class="steps">
      <li><b>Log in.</b> Your posts and comments appear under an <b>alias</b> generated at random when your account was created, with the date of publication; your instructor alone sees who is behind it.</li>
      <li><b>Write</b> your post in the editor: a title, a subtitle and the text, with hyperlinks to your sources, images and tables.${words ? ` The word meter follows the ${words} target (tables and captions are not counted).` : ''}</li>
      <li><b>Save a draft</b> as often as you like. Drafts are private to you and your instructor.</li>
      <li><b>Publish</b> when you are done.${cohort?.requireApproval ? ' Your instructor checks each post before it appears on the blog.' : ' Your post appears on the blog immediately and its address never changes.'}</li>
      <li><b>Discuss.</b> Read the other posts on this blog and answer the open questions they raise in the comments.</li>
    </ol>
    ${myHere.filter(m => m.deadline).map(m => `<div class="notice">${esc(moduleLabel(m))}: deadline <b>${fmtDate(m.deadline)}</b>${m.submissionsOpen === false ? ' — submissions are now closed.' : ''}</div>`).join('')}
    ${cohort ? `<p><a class="btn primary" href="/write/${esc(cohort.id)}">Start writing</a></p>` : u ? '' : '<p><button class="btn primary" id="brief-signin">Log in</button></p>'}
    <p class="muted small">Modules writing on this blog: ${esc(modules.filter(m => m.blogId === id).map(moduleLabel).join(' · ') || 'none yet')}.</p></div>`;
  app.querySelector('#brief-signin')?.addEventListener('click', () => openAuthModal());
}

// ---------- module settings: cohort + which blog it writes on ----------
export async function manageModule(id) {
  const u = currentUser();
  if (!staff(u)) { app.innerHTML = '<p class="empty">Instructor access required.</p>'; return; }
  const [m, myBlogs] = await Promise.all([id ? store.getModule(id) : null, store.listMyBlogs()]);
  if (id && (!m || !instructs(u, m))) { app.innerHTML = '<p class="empty">You cannot manage this module.</p>'; return; }
  const existingBlogs = myBlogs.filter(b => b.id !== '');
  const chooseExisting = existingBlogs.length > 0 && (!m || !!m.blogId);
  app.innerHTML = `<div class="guide"><p class="page-sub crumb"><a href="/my-modules">My modules</a></p><h1 class="page-title">${m ? 'Module settings' : 'Create a module'}</h1><p class="page-sub">A module is one cohort: its students, deadline and moderation. Its posts appear on a blog that it may share with your other modules.</p>
    <form id="module-form">
    <div class="two-col"><label class="field">Module code<input name="code" maxlength="40" placeholder="e.g. BMGT45540" value="${esc(m?.code || '')}"></label>
    <label class="field">Academic year<input name="academicYear" required maxlength="20" placeholder="e.g. 2026/27" value="${esc(m?.academicYear || defaultAcademicYear())}"><p class="hint">Stamped on every post, so posts can be listed by module and year.</p></label></div>
    <label class="field">Module title<input name="title" required maxlength="160" placeholder="e.g. Managing Innovative Projects" value="${esc(m?.title || '')}"></label>
    <label class="field">Description for students (optional)<textarea name="description" maxlength="1200" rows="3">${esc(m?.description || '')}</textarea></label>
    <fieldset class="field blog-choice"><legend>Blog canvas</legend>
      ${existingBlogs.length ? `<label class="check"><input type="radio" name="blogMode" value="existing" ${chooseExisting ? 'checked' : ''}> Post to one of my existing blogs</label>
      <label class="field indent">Blog<select name="blogId">${existingBlogs.map(b => `<option value="${esc(b.id)}" ${m?.blogId === b.id ? 'selected' : ''}>${esc(b.title)}</option>`).join('')}</select></label>` : ''}
      <label class="check"><input type="radio" name="blogMode" value="new" ${chooseExisting ? '' : 'checked'}> Create a new, separate blog for this module</label>
      <div class="indent new-blog"><label class="field">Blog title<input name="blogTitle" maxlength="160" placeholder="e.g. Operations"></label>
      <label class="field">Public URL name<input name="blogUrl" minlength="2" maxlength="80" pattern="[a-z0-9][a-z0-9\\-]+" placeholder="e.g. operations"><p class="hint">${esc(publicUrl('/'))}<b>url-name</b> — lowercase letters, numbers and hyphens; fixed after creation. A few names belong to pages of the site (posts, blogs, admin…). The brief, categories and word target are set afterwards in Blog settings.</p></label></div>
    </fieldset>
    <label class="field">Deadline (optional)<input name="deadline" type="date" value="${esc(m?.deadline || '')}"><p class="hint">For information only: shown to students on their module card, in the brief and in your modules list. It does not lock anything. To stop students writing or publishing after it, untick <b>Students can write and publish</b> below.</p></label>
    <label class="check"><input type="checkbox" name="submissionsOpen" ${m?.submissionsOpen !== false ? 'checked' : ''}> Students can write and publish</label>
    <label class="check"><input type="checkbox" name="requireApproval" ${m?.requireApproval ? 'checked' : ''}> Review student posts before publication</label>
    <p class="actions"><button class="btn primary">${m ? 'Save module' : 'Create module'}</button><a class="btn" href="/my-modules">Cancel</a></p><p class="auth-msg" aria-live="polite"></p></form></div>`;
  const form = app.querySelector('form'), modeInputs = [...form.querySelectorAll('[name=blogMode]')];
  const sync = () => { const mode = form.querySelector('[name=blogMode]:checked')?.value || 'new'; form.querySelector('.new-blog').hidden = mode !== 'new'; const sel = form.querySelector('[name=blogId]'); if (sel) sel.closest('label').hidden = mode !== 'existing'; };
  modeInputs.forEach(i => i.onchange = sync); sync();
  const blogTitle = form.elements.namedItem('blogTitle'), blogUrlInput = form.elements.namedItem('blogUrl');
  blogTitle.addEventListener('input', () => { if (!blogUrlInput.dataset.edited) blogUrlInput.value = slugify(blogTitle.value).slice(0, 80); });
  blogUrlInput.addEventListener('input', () => blogUrlInput.dataset.edited = 'true');
  form.onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(form)), button = form.querySelector('button'); button.disabled = true;
    try {
      const data = {id: m?.id, title: d.title, code: d.code, academicYear: d.academicYear, description: d.description, deadline: d.deadline || '', submissionsOpen: !!d.submissionsOpen, requireApproval: !!d.requireApproval};
      if ((d.blogMode || 'new') === 'new') { if (!d.blogTitle?.trim() || !d.blogUrl?.trim()) throw Error('Give the new blog a title and a URL name.'); data.newBlog = {title: d.blogTitle.trim(), urlName: d.blogUrl.trim()}; }
      else data.blogId = d.blogId;
      const saved = await store.saveModule(data);
      toast(m ? 'Module saved.' : 'Module created.');
      navigate(m ? '/my-modules' : '/blogs/edit/' + saved.blogId);
    } catch (err) { form.querySelector('.auth-msg').textContent = err.message; } finally { button.disabled = false; }
  };
}
function defaultAcademicYear() { const d = new Date(), y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1; return `${y}/${String(y + 1).slice(2)}`; }

// ---------- blog settings: the exercise ----------
export async function manageBlog(id) {
  const u = currentUser();
  const [b, modules] = await Promise.all([store.getBlog(id), store.listModules()]);
  if (!b || !instructs(u, b)) { app.innerHTML = '<p class="empty">Only this blog’s instructor can change its settings.</p>'; return; }
  const lines = arr => (arr || []).join('\n');
  app.innerHTML = `<div class="guide"><p class="page-sub crumb"><a href="/${esc(id)}">${esc(b.title)}</a></p><h1 class="page-title">Blog settings</h1><p class="page-sub">What every module writing on this blog shares: the brief, the categories, the word target and the comments policy. Public link: <a href="${esc(blogUrl(id))}">${esc(blogUrl(id))}</a></p>
    <form id="blog-form">
    <label class="field">Blog title<input name="title" required maxlength="160" value="${esc(b.title)}"></label>
    <label class="field">Description (shown above the canvas)<textarea name="description" maxlength="1200" rows="3">${esc(b.description || '')}</textarea></label>
    <label class="field">The brief (HTML; shown on “The brief” and linked from the editor)<textarea name="brief" rows="12">${esc(b.brief || '')}</textarea></label>
    <div class="two-col">
      <div><label class="field">Category label<input name="categoryLabel" maxlength="40" placeholder="e.g. Megatrend" value="${esc(b.categoryLabel || '')}"></label>
      <label class="field">Categories (one per line: <code>slug | Name</code>; leave empty for none)<textarea name="categories" rows="7">${esc((b.categories || []).map(c => c.slug + ' | ' + c.name).join('\n'))}</textarea></label>
      <label class="field">Organisation field label (empty hides the field)<input name="organisationLabel" maxlength="60" placeholder="e.g. Organisation studied" value="${esc(b.organisationLabel || '')}"></label></div>
      <div><label class="field">Word target (min and max; 0 for none)<span style="display:flex;gap:8px"><input name="minWords" type="number" min="0" value="${b.minWords || 0}"><input name="maxWords" type="number" min="0" value="${b.maxWords || 0}"></span></label>
      <label class="field">Checklist shown beside the editor (one item per line)<textarea name="checklist" rows="7">${esc(lines(b.checklist))}</textarea></label>
      <label class="check"><input type="checkbox" name="allowComments" ${b.allowComments !== false ? 'checked' : ''}> Allow comments on published posts</label></div>
    </div>
    <label class="field">Outline the student can insert (HTML; <code>{organisation}</code> and <code>{category}</code> are filled in)<textarea name="outline" rows="8">${esc(b.outline || '')}</textarea></label>
    <p class="actions"><button class="btn primary">Save blog</button><a class="btn" href="/${esc(id)}">Back to the blog</a><button type="button" class="btn" id="fill-pm" title="Fills the form with the PM Challenge brief, the six megatrends, the 900–1,100 word target, the outline and the checklist. Nothing is saved until you press Save blog.">Fill in the PM Challenge exercise</button></p><p class="auth-msg" aria-live="polite"></p></form>
    <h2 class="page-title" style="font-size:20px;margin-top:30px">Modules writing on this blog</h2>
    ${modules.filter(m => m.blogId === id).map(m => `<p>${esc(moduleLabel(m))}${instructs(u, m) ? ` · <a href="/modules/edit/${esc(m.id)}">Settings</a> · <a href="/modules/invite/${esc(m.id)}">Invite students</a>` : ''}</p>`).join('') || '<p class="muted">None yet. <a href="/modules/new">Create a module</a> and choose this blog.</p>'}</div>`;
  // One click fills the maintainer's exercise (seed.js PM_EXERCISE); the form is still reviewed and saved by hand.
  app.querySelector('#fill-pm').onclick = () => {
    const f = app.querySelector('#blog-form'), set = (n, v) => { f.elements.namedItem(n).value = v; };
    set('brief', PM_EXERCISE.brief); set('categoryLabel', PM_EXERCISE.categoryLabel); set('categories', PM_EXERCISE.categories.map(c => c.slug + ' | ' + c.name).join('\n'));
    set('organisationLabel', PM_EXERCISE.organisationLabel); set('minWords', PM_EXERCISE.minWords); set('maxWords', PM_EXERCISE.maxWords); set('outline', PM_EXERCISE.outline); set('checklist', PM_EXERCISE.checklist.join('\n'));
    toast('PM Challenge exercise filled in. Review, then Save blog.');
  };
  app.querySelector('#blog-form').onsubmit = async e => {
    e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f)), button = f.querySelector('button'); button.disabled = true;
    try {
      if (+d.minWords > +d.maxWords && +d.maxWords > 0) throw Error('The minimum word count cannot exceed the maximum.');
      await store.saveBlog({id, title: d.title.trim(), description: d.description.trim(), brief: d.brief, categoryLabel: d.categoryLabel.trim() || 'Category', organisationLabel: d.organisationLabel.trim(), minWords: +d.minWords || 0, maxWords: +d.maxWords || 0, outline: d.outline, allowComments: !!d.allowComments,
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

export async function acceptInvitationPage(id,code='',kind='instructor') {
  const u=currentUser();
  let info;try{info=await store.resolveRegistrationCode(code);if(info.inviteId!==id||info.kind!==kind)throw Error('The invitation link and invitation code do not match.');}catch(e){app.innerHTML=`<p class="empty">${esc(e.message)} Use Register to enter your invitation code.</p>`;return;}
  const module=kind==='student'?await store.getModule(info.moduleId):null;
  const blog=module?.blogId?await store.getBlog(module.blogId):null;
  app.innerHTML=`<div class="guide"><h1 class="page-title">${kind==='instructor'?'Instructor invitation':esc(module?.title||'Module invitation')}</h1><p>Invitation code: <b>${esc(info.code)}</b>. ${kind==='instructor'?'Use the university email or Gmail address your admin invited.':`This invitation enrols you in ${esc(moduleLabel(module||{}))}${blog?`, which writes on the <b>${esc(blog.title)}</b> blog`:''}.`}</p>
    ${!u?'<p class="actions"><button class="btn primary" id="instructor-register">Register with this invitation</button><button class="btn" id="instructor-login">I already have an account</button></p>':`<p>Signed in as <b>${esc(u.email)}</b>.</p><p class="actions"><button class="btn" id="instructor-details">Complete profile</button><button class="btn primary" id="accept-invite">${kind==='instructor'?'Activate instructor access':'Join the module'}</button></p>${!u.emailVerified?'<p class="notice">Verify your sign-in email first. Use your account menu to resend the verification email and refresh verification.</p>':''}`}
    <p class="auth-msg" aria-live="polite"></p></div>`;
  app.querySelector('#instructor-register')?.addEventListener('click',()=>openAuthModal('register',info));
  app.querySelector('#instructor-login')?.addEventListener('click',()=>openAuthModal('signin',info));
  app.querySelector('#instructor-details')?.addEventListener('click',()=>openAuthModal('complete',info));
  app.querySelector('#accept-invite')?.addEventListener('click',async e=>{e.target.disabled=true;try{if(kind==='instructor'){await store.acceptTeacherInvite(id);toast('Instructor access activated.');navigate('/my-modules');}else{await store.joinModule(info.moduleId,id);toast('Welcome. You can now write your blog post.');navigate(blog?'/'+blog.id:'/my-modules');}}catch(err){app.querySelector('.auth-msg').textContent=err.code==='permission-denied'?'Use the verified email address specified in your invitation.':err.message;e.target.disabled=false;}});
}

export async function studentInvitationsPage(moduleId){
 const m=await store.getModule(moduleId),u=currentUser();
 if(!m||!instructs(u,m)){app.innerHTML='<p class="empty">Only the module’s instructor or platform admin can invite students.</p>';return;}
 const invites=await store.listModuleInvites(moduleId);
 const link=i=>publicUrl(invitationRoute({kind:'student',inviteId:i.id,code:i.code.toLowerCase()}));
 app.innerHTML=`<p class="page-sub crumb"><a href="/my-modules">My modules</a></p><h1 class="page-title">Invite students</h1><p class="page-sub">${esc(moduleLabel(m))}</p><p>Generate an invitation code and share its registration link with your students. The link prefills the code and connects students only to this module. Codes expire after 30 days and can be revoked.</p><label class="field">Student university email (optional)<input id="student-invite-email" type="email" maxlength="200" placeholder="Leave blank for a shared class link"><p class="hint">Enter an email to track a named invitation as pending. Names and university IDs are collected during registration.</p></label><button class="btn primary" id="create-student-invite">Generate student invitation code</button><a class="btn" href="/review/roster?module=${esc(moduleId)}">View roster & invitations</a><p class="auth-msg" aria-live="polite"></p>${invites.map(i=>`<div class="notice"><b>Invitation code: ${esc(i.code)}</b><p>${i.recipientEmail?'Invited university email: '+esc(i.recipientEmail):'Shared class link'} · ${i.revoked?'Revoked':i.expiresAt<Date.now()?'Expired':'Active'} · Expires ${fmtDateTime(i.expiresAt)}</p><label class="field">Student registration link<input readonly value="${esc(link(i))}" onclick="this.select()"></label>${!i.revoked?`<button class="btn small" data-revoke-student="${esc(i.id)}">Revoke code</button>`:''}</div>`).join('')}<p><a href="/my-modules">Back to my modules</a></p>`;
 app.querySelector('#create-student-invite').onclick=async e=>{e.target.disabled=true;try{const email=app.querySelector('#student-invite-email');if(!email.reportValidity())return;await store.createModuleInvite(moduleId,email.value);await studentInvitationsPage(moduleId);}catch(err){app.querySelector('.auth-msg').textContent=err.message;}finally{e.target.disabled=false;}};
 app.querySelectorAll('[data-revoke-student]').forEach(b=>b.onclick=async()=>{try{await store.revokeModuleInvite(b.dataset.revokeStudent);await studentInvitationsPage(moduleId);}catch(err){toast(err.message,'error');}});
}
