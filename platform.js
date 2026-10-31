import {store} from './store.js';
import {currentUser, openAuthModal, invitationRoute} from './auth.js';
import {esc, toast, slugify, fmtDateTime} from './util.js';

let app, canvas;
export function configurePlatform(target, renderCanvas) { app = target; canvas = renderCanvas; }
export const moduleUrl = id => `${location.origin}${location.pathname}#/module/${encodeURIComponent(id)}`;
const staff = u => u && ['admin','lecturer'].includes(u.role);
const instructs = (u,m) => u && (u.role === 'admin' || m.teacherIds.includes(u.uid));
function moduleCard(m) {
  return `<article class="module-card"><p class="page-sub">${esc(m.code || 'Module')}</p><h2><a href="#/module/${esc(m.id)}">${esc(m.title)}</a></h2><p>${esc(m.description || '')}</p><p class="muted small">${esc(m.teacherName || '')}</p><div class="actions"><a class="btn small" href="#/module/${esc(m.id)}">Open public canvas</a>${instructs(currentUser(),m) ? `<a class="btn small" href="#/modules/edit/${esc(m.id)}">Manage module</a>` : ''}</div></article>`;
}
export async function moduleDirectory(mine = false) {
  const u = currentUser();
  if (mine && !u) { app.innerHTML = '<p class="empty">Sign in to see your modules.</p>'; openAuthModal(); return; }
  const modules = await (mine ? store.listMyModules() : store.listModules());
  app.innerHTML = `<h1 class="page-title">${mine ? 'My modules' : 'Explore module blogs'}</h1><p class="page-sub">${mine ? staff(u) ? 'Your teaching modules and their public canvases.' : 'Your modules, posts and discussions in one place.' : 'Every module has its own public canvas. Read without signing in; sign in to join, write and comment.'}</p>
    <p class="actions">${mine ? '<a class="btn" href="#/modules">Explore modules</a><a class="btn" href="#/mine">My posts</a><button class="btn" id="platform-register">Enter another invitation code</button>' : u ? '<a class="btn" href="#/my-modules">My modules</a>' : '<button class="btn" id="platform-signin">Log in</button><button class="btn primary" id="platform-register">Register with an invitation</button>'}${staff(u) ? '<a class="btn primary" href="#/modules/new">Create module</a>' : ''}${u?.role === 'admin' ? '<a class="btn" href="#/invitations">Invite instructor</a>' : ''}</p>
    ${modules.length ? `<div class="module-grid">${modules.map(moduleCard).join('')}</div>` : `<p class="empty">${mine ? staff(u) ? 'Create your first module to get a public canvas link.' : 'You have not joined a module yet. Explore modules to get started.' : 'No modules have been created yet.'}</p>`}`;
  app.querySelector('#platform-signin')?.addEventListener('click',()=>openAuthModal());
  app.querySelector('#platform-register')?.addEventListener('click',()=>openAuthModal('register'));
}

export async function moduleCanvas(id) {
  const m = await store.getModule(id), u = currentUser();
  if (!m) { app.innerHTML = '<p class="empty">Module not found. <a href="#/modules">Explore modules</a></p>'; return; }
  const posts = (await store.listPosts({status:'published',moduleId:id})).sort((a,b)=>(b.featured-a.featured)||(b.publishedAt-a.publishedAt));
  const joined = u && (await store.listMyModules()).some(x=>x.id===id);
  app.innerHTML = `<p class="page-sub">${esc(m.code)}${m.teacherName ? ' · '+esc(m.teacherName) : ''}</p><h1 class="page-title">${esc(m.title)}</h1><p>${esc(m.description || '')}</p>
    <p class="actions">${u ? joined ? `<a class="btn primary" href="#/write/${esc(id)}">Compose a blog post</a>` : '<button class="btn primary" id="join-module">Enter instructor invitation code</button>' : '<button class="btn primary" id="join-signin">Log in</button><button class="btn" id="join-module">Register with an invitation</button>'}${instructs(u,m) ? `<a class="btn" href="#/modules/edit/${esc(id)}">Module settings</a><a class="btn" href="#/modules/invite/${esc(id)}">Invite students</a><a class="btn" href="#/review?module=${esc(id)}">Review posts</a>` : ''}<button class="btn small" id="copy-module-link">Copy public link</button><a href="#/modules">All modules</a></p>
    <p class="muted small">This canvas and all published posts are publicly readable.</p>${canvas(posts)}`;
  app.querySelector('#join-signin')?.addEventListener('click',()=>openAuthModal());
  app.querySelector('#join-module')?.addEventListener('click',()=>openAuthModal('register'));
  app.querySelector('#copy-module-link').onclick = async()=>{try {await navigator.clipboard.writeText(moduleUrl(id));toast('Public link copied.');}catch {prompt('Public canvas link',moduleUrl(id));}};
}

export async function manageModule(id) {
  const u = currentUser();
  if (!staff(u)) { app.innerHTML='<p class="empty">Instructor access required.</p>'; return; }
  const m = id ? await store.getModule(id) : null;
  if (id && (!m || !instructs(u,m))) { app.innerHTML='<p class="empty">You cannot manage this module.</p>'; return; }
  app.innerHTML=`<div class="guide"><h1 class="page-title">${m ? 'Manage module' : 'Create a module'}</h1><p class="page-sub">Each module has its own public blog canvas.</p>
    <form id="module-form"><label class="field">Module title<input name="title" required maxlength="160" value="${esc(m?.title || '')}"></label>
    <label class="field">Module code (optional)<input name="code" maxlength="40" placeholder="e.g. BMGT45540" value="${esc(m?.code || '')}"></label>
    ${m ? `<p>Public link: <a href="${esc(moduleUrl(id))}">${esc(moduleUrl(id))}</a></p>` : '<label class="field">Public URL name<input name="urlName" required minlength="2" maxlength="80" pattern="[a-z0-9][a-z0-9-]+" placeholder="e.g. managing-innovative-projects"><p class="hint">Use lowercase letters, numbers and hyphens. This stays fixed after creation.</p></label>'}
    <label class="field">Description<textarea name="description" maxlength="1200" rows="4">${esc(m?.description || '')}</textarea></label>
    <label class="check"><input type="checkbox" name="submissionsOpen" ${m?.submissionsOpen !== false ? 'checked' : ''}> Students can submit posts</label>
    <label class="check"><input type="checkbox" name="requireApproval" ${m?.requireApproval ? 'checked' : ''}> Review student posts before publication</label>
    <label class="check"><input type="checkbox" name="allowComments" ${m?.allowComments !== false ? 'checked' : ''}> Allow comments on published posts</label>
    <p class="actions"><button class="btn primary">${m ? 'Save module' : 'Create public canvas'}</button><a class="btn" href="#/my-modules">Cancel</a></p><p class="auth-msg" aria-live="polite"></p></form></div>`;
  const form=app.querySelector('form');
  const titleInput=form.elements.namedItem('title'),urlInput=form.elements.namedItem('urlName');
  if (!m) titleInput.addEventListener('input',()=>{if(!urlInput.dataset.edited) urlInput.value=slugify(titleInput.value).slice(0,80);});
  urlInput?.addEventListener('input',()=>urlInput.dataset.edited='true');
  form.onsubmit=async e=>{e.preventDefault(); const d=Object.fromEntries(new FormData(form)), button=form.querySelector('button');button.disabled=true;
    try {const saved=await store.saveModule({id:m?.id,title:d.title,code:d.code,description:d.description,...(!m?{id:undefined,urlName:d.urlName}:{}),submissionsOpen:!!d.submissionsOpen,requireApproval:!!d.requireApproval,allowComments:!!d.allowComments});toast('Module saved.');location.hash='#/module/'+saved.id;}catch(err){form.querySelector('.auth-msg').textContent=err.message;}finally{button.disabled=false;}};
}

export async function invitationsPage() {
  if(currentUser()?.role!=='admin'){app.innerHTML='<p class="empty">Admin access required.</p>';return;}
  const invites=await store.listTeacherInvites();
  app.innerHTML=`<h1 class="page-title">Invite an instructor</h1><p class="page-sub">Generate a city code and invitation link for one instructor. It expires after seven days and is tied to the email addresses below.</p>
    <form id="invite-form" class="guide"><label class="field">Instructor’s university email<input type="email" name="universityEmail" required maxlength="200"></label><label class="field">Instructor’s Gmail for Google sign-in (optional)<input type="email" name="gmail" maxlength="200"></label><button class="btn primary">Generate city code and invitation</button><p class="auth-msg" aria-live="polite"></p></form>
    <div id="new-invite" aria-live="polite"></div><h2>Invitations</h2><table class="list"><thead><tr><th>University email</th><th>City code</th><th>Status</th><th>Expires</th><th></th></tr></thead><tbody>${invites.map(i=>`<tr><td>${esc(i.ucdEmail)}</td><td>${esc(i.code||'—')}</td><td>${i.revoked?'Revoked':i.acceptedBy?'Accepted':i.expiresAt<Date.now()?'Expired':'Pending'}</td><td>${fmtDateTime(i.expiresAt)}</td><td>${!i.acceptedBy&&!i.revoked?`<button class="linkish" data-revoke="${esc(i.id)}">Revoke</button>`:''}</td></tr>`).join('')}</tbody></table>`;
  app.querySelector('#invite-form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button');b.disabled=true;try{const invite=await store.createTeacherInvite(Object.fromEntries(new FormData(f)));await invitationsPage();const url=`${location.origin}${location.pathname}${invitationRoute({kind:'instructor',inviteId:invite.id,code:invite.code.toLowerCase()})}`;app.querySelector('#new-invite').innerHTML=`<div class="notice ok"><b>City code: ${esc(invite.code)}</b><label class="field">Instructor registration link<input readonly value="${esc(url)}" onclick="this.select()"></label><p class="small">The code is prefilled by this link. Share it only with the invited instructor.</p></div>`;}catch(err){f.querySelector('.auth-msg').textContent=err.message;}finally{b.disabled=false;}};
  app.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=async()=>{try{await store.revokeTeacherInvite(b.dataset.revoke);await invitationsPage();}catch(e){toast(e.message,'error');}});
}

export async function acceptInvitationPage(id,code='',kind='instructor') {
  const u=currentUser();
  let info;try{info=await store.resolveRegistrationCode(code);if(info.inviteId!==id||info.kind!==kind)throw Error('The invitation link and city code do not match.');}catch(e){app.innerHTML=`<p class="empty">${esc(e.message)} Use Register with an invitation to enter your city code.</p>`;return;}
  const module=kind==='student'?await store.getModule(info.moduleId):null;
  app.innerHTML=`<div class="guide"><h1 class="page-title">${kind==='instructor'?'Instructor invitation':esc(module?.title||'Module invitation')}</h1><p>City code: <b>${esc(info.code)}</b>. ${kind==='instructor'?'Use the university email or Gmail address your admin invited.':'This invitation gives you access to this module’s student space.'}</p>
    ${!u?'<p class="actions"><button class="btn primary" id="instructor-register">Register with this invitation</button><button class="btn" id="instructor-login">I already have an account</button></p>':`<p>Signed in as <b>${esc(u.email)}</b>.</p><p class="actions"><button class="btn" id="instructor-details">Complete profile</button><button class="btn primary" id="accept-invite">${kind==='instructor'?'Activate instructor access':'Enter module student space'}</button></p>${!u.emailVerified?'<p class="notice">Verify your sign-in email first. Use your account menu to resend the verification email and refresh verification.</p>':''}`}
    <p class="auth-msg" aria-live="polite"></p></div>`;
  app.querySelector('#instructor-register')?.addEventListener('click',()=>openAuthModal('register',info));
  app.querySelector('#instructor-login')?.addEventListener('click',()=>openAuthModal('signin',info));
  app.querySelector('#instructor-details')?.addEventListener('click',()=>openAuthModal('complete',info));
  app.querySelector('#accept-invite')?.addEventListener('click',async e=>{e.target.disabled=true;try{if(kind==='instructor'){await store.acceptTeacherInvite(id);toast('Instructor access activated.');location.hash='#/my-modules';}else{await store.joinModule(info.moduleId,id);toast('Module invitation accepted. You can compose your blog post.');location.hash='#/module/'+info.moduleId;}}catch(err){app.querySelector('.auth-msg').textContent=err.code==='permission-denied'?'Use the verified email address specified in your invitation.':err.message;e.target.disabled=false;}});
}

export async function studentInvitationsPage(moduleId){
 const m=await store.getModule(moduleId),u=currentUser();
 if(!m||!instructs(u,m)){app.innerHTML='<p class="empty">Only the module’s instructor or platform admin can invite students.</p>';return;}
 const invites=await store.listModuleInvites(moduleId);
 const link=i=>`${location.origin}${location.pathname}${invitationRoute({kind:'student',inviteId:i.id,code:i.code.toLowerCase()})}`;
 app.innerHTML=`<h1 class="page-title">Invite students</h1><p class="page-sub">${esc(m.title)}</p><p>Generate a city code and share its registration link with your students. The link prefills the code and connects students only to this module. Codes expire after 30 days and can be revoked.</p><button class="btn primary" id="create-student-invite">Generate student city code</button><p class="auth-msg" aria-live="polite"></p>${invites.map(i=>`<div class="notice"><b>City code: ${esc(i.code)}</b><p>${i.revoked?'Revoked':i.expiresAt<Date.now()?'Expired':'Active'} · Expires ${fmtDateTime(i.expiresAt)}</p><label class="field">Student registration link<input readonly value="${esc(link(i))}" onclick="this.select()"></label>${!i.revoked?`<button class="btn small" data-revoke-student="${esc(i.id)}">Revoke code</button>`:''}</div>`).join('')}<p><a href="#/module/${esc(moduleId)}">Back to public canvas</a></p>`;
 app.querySelector('#create-student-invite').onclick=async e=>{e.target.disabled=true;try{await store.createModuleInvite(moduleId);await studentInvitationsPage(moduleId);}catch(err){app.querySelector('.auth-msg').textContent=err.message;e.target.disabled=false;}};
 app.querySelectorAll('[data-revoke-student]').forEach(b=>b.onclick=async()=>{try{await store.revokeModuleInvite(b.dataset.revokeStudent);await studentInvitationsPage(moduleId);}catch(err){toast(err.message,'error');}});
}
