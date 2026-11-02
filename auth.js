import {store, setStorePreview} from './store.js';
import {esc, toast} from './util.js';
import {enabledProviders} from './firebase-config.js';
import {registrationProfile} from './registration.js';
import {route, navigate} from './router.js';
// Staff previews, as in a learning platform's "View as Student": the admin's account
// menu offers "View as Instructor X" for each instructor, and on a blog canvas any
// instructor (or the admin) gets "View as Student". While a preview is on, the
// signed-in person is drawn as that instructor or as a student of that module, so
// the pages look exactly as they do to them; the × in the menu returns to their own
// view. It lives in this browser tab only, the backend still knows who they really
// are, and store.js refuses every write until the preview is closed.
//   {kind:'instructor', uid, name, moduleIds, blogIds}
//   {kind:'student', moduleId, blogId, label, back}   back: the instructor preview to return to, if any
const PREVIEW='ucd-blog.preview';
// The last account that signed in on this device, so the front door can offer
// "Continue as X" after a sign-out, the way social networks do. Name, picture, email
// and sign-in method only; it is cleared with "Forget this account".
const LAST='ucd-blog.lastAccount';
export const lastAccount=()=>{try{const a=JSON.parse(localStorage.getItem(LAST));return a&&a.name?a:null;}catch{return null;}};
export const rememberAccount=u=>{try{localStorage.setItem(LAST,JSON.stringify({name:fullName(u),photoURL:u.photoURL||'',email:u.email||'',provider:u.providerId||'password'}));}catch{}};
export const forgetAccount=()=>{try{localStorage.removeItem(LAST);}catch{}};
export const GOOGLE_ICON=`<svg class="gicon" viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.5c-.5 2.9-2.2 5.4-4.6 7.1l7.4 5.7c4.3-4 6.8-9.9 6.8-16.8z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>`;
export const googleButton=(id,label='Continue with Google')=>`<button type="button" class="btn google" ${id?`id="${id}"`:'data-provider="google.com"'}>${GOOGLE_ICON}<span>${label}</span></button>`;
export const preview=()=>{try{const p=JSON.parse(sessionStorage.getItem(PREVIEW));return p&&p.kind?p:null;}catch{return null;}};
export function setPreview(p){try{if(p)sessionStorage.setItem(PREVIEW,JSON.stringify(p));else sessionStorage.removeItem(PREVIEW);}catch{}setStorePreview(p||null);}
setStorePreview(preview());
export const currentUser=()=>{
 const u=store.currentUser();const p=u&&preview();
 if(!p||!['lecturer','admin'].includes(u.role))return u;
 if(p.kind==='instructor')return u.role==='admin'?{...u,uid:p.uid,role:'lecturer',managedModuleIds:p.moduleIds||[],managedBlogIds:p.blogIds||[],preview:p}:u;
 return {...u,role:'student',managedModuleIds:[],managedBlogIds:[],preview:p,studentPreview:p};
};
let activeInvitation=null;
export const roleLabel=role=>role==='lecturer'?'instructor':role;
export function invitationRoute(info){return `/${info.kind==='instructor'?'invite':'join'}/${info.inviteId}/${info.code}`;}
export const teacherInviteId=()=>route().match(/^\/invite\/([a-zA-Z0-9-]+)(?:\/[a-z]+(?:-[0-9]{3})?)?$/i)?.[1]||'';
async function routeInvitation(){
 const code=route().match(/^\/(?:invite|join)\/[a-zA-Z0-9-]+\/([a-z]+(?:-[0-9]{3})?)$/i)?.[1];
 return code?store.resolveRegistrationCode(code):null;
}
export function renderAccountControl(el){
 const u=currentUser();
 if(store.mode==='local'){
  el.innerHTML=`<label class="viewas">Sample account<select id="viewas"><option value="">Visitor (signed out)</option>${store.users().map(x=>`<option value="${x.uid}" ${store.currentUser()?.uid===x.uid?'selected':''}>${esc(fullName(x))} · ${esc(roleLabel(x.role))}</option>`).join('')}</select></label>${u?writeButton()+accountMenu(u):''}`;
  el.querySelector('#viewas').onchange=e=>{setPreview(null);store.viewAs(e.target.value);};
 } else {
  el.innerHTML=u?writeButton()+accountMenu(u):'<button class="btn small" id="signin-btn">Log in</button>';
  el.querySelector('#signin-btn')?.addEventListener('click',()=>openAuthModal('signin'));
 }
 if(u)previewOptions(u).then(html=>{const slot=el.querySelector('[data-preview-options]');if(slot&&html)slot.innerHTML=html;}).catch(()=>{});
 if(u&&store.mode==='firebase'&&!u.preview)rememberAccount(u);
}
// What the menu offers: the admin may view the site as any instructor; on a blog
// canvas, an instructor of one of its modules (or the admin) may view it as a student.
async function previewOptions(u){
 const p=u.preview||null;
 if(p?.kind==='student')return '';
 const out=[];
 const blogId=route().match(/^\/blog\/([a-z0-9-]+)/)?.[1];
 const modules=await store.listModules();
 if(blogId&&['lecturer','admin'].includes(u.role)){
  const m=modules.find(m=>m.blogId===blogId&&(m.teacherIds||[]).includes(u.uid))||(u.role==='admin'?modules.find(m=>m.blogId===blogId):null);
  if(m)out.push(`<button data-preview-student="${esc(m.id)}" data-blog="${esc(blogId)}" data-label="${esc([m.code,m.title].filter(Boolean).join(' '))}">View as Student</button>`);
 }
 if(u.role==='admin'&&!p){
  const [users,blogs]=await Promise.all([store.listUsers(),store.listBlogs()]);
  const teaches=x=>modules.some(m=>(m.teacherIds||[]).includes(x.uid))||blogs.some(b=>(b.teacherIds||[]).includes(x.uid));
  for(const x of users.filter(x=>x.uid!==u.uid&&(x.role==='lecturer'||teaches(x))).sort((a,b)=>fullName(a).localeCompare(fullName(b))))
   out.push(`<button data-preview-instructor="${esc(x.uid)}" data-name="${esc(fullName(x))}" data-modules="${esc(modules.filter(m=>(m.teacherIds||[]).includes(x.uid)).map(m=>m.id).join(','))}" data-blogs="${esc(blogs.filter(b=>(b.teacherIds||[]).includes(x.uid)).map(b=>b.id).join(','))}">View as Instructor ${esc(fullName(x))}</button>`);
 }
 return out.length?out.join('')+'<hr>':'';
}
// The signed-in person's own name and picture (Google's, when they signed in with Google).
// A student's alias is for the byline of their posts and comments, not for this control.
export const fullName=u=>[u?.firstName,u?.lastName].filter(Boolean).join(' ')||u?.displayName||u?.penName||u?.email||'Account';
export function avatarHtml(u,name=fullName(u)){return u?.photoURL?`<img class="avatar" src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">`:`<span class="avatar">${esc((name||'?')[0].toUpperCase())}</span>`;}
// "Write" is the one action that stays visible beside the avatar; everything else personal
// (modules, posts, profile, the instructor and admin areas, sign out) lives in the menu, so the
// site tabs under the rule can stay public: Explore blogs, All posts, search.
const writeButton=()=>`<a href="/write" class="btn primary small write-btn">Write</a>`;
function accountMenu(u){
 const name=fullName(u),p=u.preview,as=p?(p.kind==='student'?'Student':p.name):'';
 return `<details class="account-menu ${p?'previewing':''}"><summary aria-label="Account menu">${avatarHtml(u,name)} <span class="who">${esc(name)}<small>${p?'as '+esc(as):esc(roleLabel(u.role))}</small></span><span class="caret" aria-hidden="true"></span></summary><div class="menu">
 <div class="menu-who"><b>${esc(name)}</b><small>${p?esc(u.email||''):esc(roleLabel(u.role))+(u.email?' · '+esc(u.email):'')}</small></div>
 ${p?`<div class="preview-head"><b>Viewing as ${esc(as)}</b>${p.kind==='student'?`<span class="small">${esc(p.label)}</span>`:''}<button type="button" class="close-preview" data-exit-preview aria-label="Close the preview and return to your own view" title="Return to your own view">×</button></div>`:''}<div data-preview-options></div>
 ${u.role==='student'&&u.penName&&!p?`<p class="small">Your posts and comments appear as <b>${esc(u.penName)}</b>.</p>`:''}<a href="/my-modules">My modules</a><a href="/mine">My posts</a><a href="/profile">Edit profile</a>
 ${store.mode==='firebase'&&!u.emailVerified?'<p class="small">Verify your sign-in email before participating.</p><button id="resend-verification">Resend verification email</button><button id="refresh-verification">I have verified my email</button>':''}
 ${u.role!=='student'?`<hr><a href="/review">Instructor area</a>${u.role==='admin'?'<a href="/admin">Admin area</a>':''}`:''}${store.mode==='firebase'?'<hr><button id="signout">Sign out</button>':''}</div></details>`;}
 document.addEventListener('click',async e=>{
 try{
  if(e.target.id==='resend-verification'){await store.resendVerification();toast('Verification email sent.');}
  if(e.target.id==='refresh-verification')toast(await store.refreshVerification()?'Email verified. You can now accept your invitation.':'Open the verification link in your email first.');
  if(e.target.id==='signout'){setPreview(null);await store.signOut();activeInvitation=null;navigate('/');toast('Signed out.');}
  const st=e.target.closest('[data-preview-student]'),ins=e.target.closest('[data-preview-instructor]');
  if(st){const back=preview();setPreview({kind:'student',moduleId:st.dataset.previewStudent,blogId:st.dataset.blog,label:st.dataset.label,back:back?.kind==='instructor'?back:null});if(!navigate('/'+st.dataset.blog))dispatchEvent(new CustomEvent('routechange'));toast('Viewing as a student of '+st.dataset.label+'. Close the preview from the account menu.');}
  if(ins){setPreview({kind:'instructor',uid:ins.dataset.previewInstructor,name:ins.dataset.name,moduleIds:ins.dataset.modules.split(',').filter(Boolean),blogIds:ins.dataset.blogs.split(',').filter(Boolean)});if(!navigate('/my-modules'))dispatchEvent(new CustomEvent('routechange'));toast('Viewing as '+ins.dataset.name+'. Close the preview from the account menu.');}
  if(e.target.closest('[data-exit-preview]')){const p=preview();setPreview(p?.back||null);dispatchEvent(new CustomEvent('routechange'));}
 }catch(err){toast(friendly(err));}
 const menu=document.querySelector('.account-menu[open]');if(menu&&!menu.contains(e.target))menu.removeAttribute('open');
});
export async function openAuthModal(view='signin',invitation=null,opts={}){
 let m=document.getElementById('auth-modal');if(!m){m=document.createElement('dialog');m.id='auth-modal';document.body.append(m);m.addEventListener('click',e=>{if(e.target.closest('.close'))m.close();});}
 if(view==='register'&&!invitation&&!/^\/(invite|join)\//.test(route()))activeInvitation=null;
 if(invitation)activeInvitation=invitation;
 if(!activeInvitation){try{activeInvitation=await routeInvitation();}catch{}}
 const collecting=view==='register'||view==='complete',u=currentUser();
 if(collecting&&!activeInvitation){
  m.innerHTML=`<form method="dialog" class="auth-form"><button type="button" class="close" aria-label="Close">×</button><h2>Enter your invitation code</h2><p class="muted">Use the invitation code supplied by the platform admin or your module instructor.</p><label>Registration code<input name="registrationCode" required autocomplete="off" placeholder="Your invitation code"></label><button class="btn primary" value="submit">Continue</button><p class="auth-msg" aria-live="polite"></p></form>`;
  m.querySelector('form').onsubmit=async e=>{if(e.submitter?.value!=='submit')return;e.preventDefault();try{const data=Object.fromEntries(new FormData(e.target));const info=await store.resolveRegistrationCode(data.registrationCode);activeInvitation=info;navigate(invitationRoute(info));await openAuthModal(u?'complete':'register',info);}catch(err){m.querySelector('.auth-msg').textContent=friendly(err);}};
  if(!m.open)m.showModal();return;
 }
 const teacher=activeInvitation?.kind==='instructor'||(!collecting&&['lecturer','admin'].includes(u?.role));
 const google=enabledProviders.includes('google.com'),pw=enabledProviders.includes('password');
 const fields=collecting?`<label>Registration code<input name="registrationCode" readonly value="${esc(activeInvitation.code)}"></label>
  <label>First name<input name="firstName" required maxlength="80" autocomplete="given-name" value="${esc(u?.firstName||'')}"></label>
  <label>Last name<input name="lastName" required maxlength="80" autocomplete="family-name" value="${esc(u?.lastName||'')}"></label>
  <label>School / university<input name="affiliation" required maxlength="200" autocomplete="organization" value="${esc(u?.affiliation||'')}"></label>
  <label>University email<input name="universityEmail" type="email" required autocomplete="email" value="${esc(u?.contactEmail||'')}"></label>
  ${teacher?'':`<label>University ID number<input name="studentId" required maxlength="40" value="${esc(u?.studentId||'')}"></label>`}`:'';
 m.innerHTML=`<form method="dialog" class="auth-form"><button type="button" class="close" aria-label="Close">×</button>
  <h2>${view==='complete'?'Complete your profile':view==='register'?teacher?'Instructor registration':'Module student registration':view==='reset'?'Reset password':'Log in'}</h2>
  <p class="muted">${collecting?'Your invitation determines which space you can access. Your university details remain private to you and authorised teaching staff.':'Sign in with the same email or Google account you registered with.'}</p>${fields}
  ${google&&view!=='reset'&&view!=='complete'?`${collecting?'<p class="auth-step">Then choose how you will log in</p><label>Gmail for Google sign-in (optional)<input name="googleEmail" type="email" autocomplete="off" placeholder="yourname@gmail.com"></label><p class="hint">Choose this account in the next window. No password below is needed when using Google.</p>':''}${googleButton('',collecting?'Register with Google':'Continue with Google')}`:''}
  ${view==='complete'?'<button class="btn primary" value="submit">Save profile and continue</button>':pw?`${view!=='reset'?'<div class="or">or with email and password</div>':''}${collecting?'':`<label>Email<input name="email" type="email" required autocomplete="username" value="${esc(opts.email||'')}"></label>`}${view==='reset'?'':`<label>Password${collecting?' (for university email sign-in)':''}<input name="password" type="password" required minlength="8" autocomplete="${collecting?'new-password':'current-password'}"></label>`}<button class="btn primary" value="submit">${collecting?'Register with university email':view==='reset'?'Send reset email':'Log in'}</button><p class="muted small">${collecting?'Already registered? <a href="#" data-view="signin">Log in</a>':'New here? <a href="#" data-view="register">Register with your invitation code</a> · <a href="#" data-view="reset">Forgot password?</a>'}</p>`:''}
  <p class="auth-msg" aria-live="polite"></p></form>`;
 const msg=m.querySelector('.auth-msg');
 m.querySelectorAll('[data-view]').forEach(a=>a.onclick=e=>{e.preventDefault();openAuthModal(a.dataset.view,activeInvitation);});
 const finish=async()=>{
  const account=currentUser();
  if(account?.role!=='admin'&&(!account?.contactEmail||!account?.firstName||!account?.lastName||!account?.affiliation||(!teacher&&!['teacher','instructor'].includes(account?.registrationKind)&&!account?.studentId))){await openAuthModal('complete',activeInvitation);return;}
  m.close();toast('Signed in.');
  if(activeInvitation)navigate(invitationRoute(activeInvitation));else navigate('/');
 };
 m.querySelectorAll('[data-provider]').forEach(b=>b.onclick=async()=>{
  const form=m.querySelector('form'),data=Object.fromEntries(new FormData(form));
  if(collecting&&![...form.querySelectorAll('input:not([name=password])')].every(i=>i.reportValidity()))return;
  try{if(collecting)registrationProfile(data,teacher);b.disabled=true;await store.signIn(b.dataset.provider,data);if(collecting)await store.completeRegistration(data,teacher);await finish();}catch(err){msg.textContent=friendly(err);}finally{b.disabled=false;}
 });
 m.querySelector('form').onsubmit=async e=>{
  if(e.submitter?.value!=='submit')return;e.preventDefault();const data=Object.fromEntries(new FormData(e.target));
  try{
   if(view==='register'){await store.register(data,teacher);m.close();navigate(invitationRoute(activeInvitation));toast('Account created. Verify your university email, then accept your invitation.');return;}
   if(view==='complete'){await store.completeRegistration(data,teacher);await finish();return;}
   if(view==='reset'){await store.resetPassword(data.email);msg.textContent='Password reset email sent.';return;}
   await store.signIn('password',data);await finish();
  }catch(err){msg.textContent=friendly(err);}
 };
 if(!m.open)m.showModal();
}
// "Continue" on the front door for the account remembered on this device: Google signs in
// straight away with that address as the hint; an email account gets the log-in form with
// its address filled in. A profile that is still incomplete goes to the completion form.
export async function continueAs(acc){
 if(store.mode!=='firebase'){toast('Pick a sample account at the top right.');return;}
 if(acc.provider!=='google.com'){await openAuthModal('signin',null,{email:acc.email});return;}
 try{await store.signIn('google.com',{googleEmail:acc.email});}catch(err){toast(friendly(err),'error');return;}
 const a=currentUser(),teacher=['lecturer','admin'].includes(a?.role)||['teacher','instructor'].includes(a?.registrationKind);
 if(a?.role!=='admin'&&(!a?.contactEmail||!a?.firstName||!a?.lastName||!a?.affiliation||(!teacher&&!a?.studentId))){await openAuthModal('complete');return;}
 toast('Signed in.');if(!navigate('/'))dispatchEvent(new CustomEvent('routechange'));
}
function friendly(e){const c=e?.code||'';if(c.includes('operation-not-allowed'))return 'This sign-in method is not enabled yet.';if(c.includes('popup-closed'))return 'The Google sign-in window was closed.';if(c.includes('email-already-in-use'))return 'This email already has an account. Log in instead.';if(c.includes('invalid-credential')||c.includes('wrong-password')||c.includes('user-not-found'))return 'Email or password not recognised.';if(c.includes('unauthorized-domain'))return 'This domain is not authorised for sign-in.';return e?.message||'Please try again.';}
