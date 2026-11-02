import {store} from './store.js';
import {esc, toast} from './util.js';
import {enabledProviders} from './firebase-config.js';
import {registrationProfile} from './registration.js';
import {route, navigate} from './router.js';
export const currentUser=()=>store.currentUser();
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
  el.innerHTML=`<label class="viewas">View as<select id="viewas"><option value="">Visitor (signed out)</option>${store.users().map(x=>`<option value="${x.uid}" ${u?.uid===x.uid?'selected':''}>${esc(fullName(x))} · ${esc(roleLabel(x.role))}</option>`).join('')}</select></label>${u?accountMenu(u):''}`;
  el.querySelector('#viewas').onchange=e=>store.viewAs(e.target.value);return;
 }
 el.innerHTML=u?accountMenu(u):'<button class="btn small" id="signin-btn">Log in</button> <button class="btn small" id="register-btn">Register with an invitation</button>';
 el.querySelector('#signin-btn')?.addEventListener('click',()=>openAuthModal('signin'));
 el.querySelector('#register-btn')?.addEventListener('click',()=>openAuthModal('register'));
}
// The signed-in person's own name and picture (Google's, when they signed in with Google).
// A student's alias is for the byline of their posts and comments, not for this control.
export const fullName=u=>[u?.firstName,u?.lastName].filter(Boolean).join(' ')||u?.displayName||u?.penName||u?.email||'Account';
export function avatarHtml(u,name=fullName(u)){return u?.photoURL?`<img class="avatar" src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">`:`<span class="avatar">${esc((name||'?')[0].toUpperCase())}</span>`;}
function accountMenu(u){const name=fullName(u);return `<details class="account-menu"><summary>${avatarHtml(u,name)} ${esc(name)} <small>${esc(roleLabel(u.role))}</small></summary><div class="menu">
 ${u.role==='student'&&u.penName?`<p class="small">Your posts and comments appear as <b>${esc(u.penName)}</b>.</p>`:''}<a href="/my-modules">My modules</a><a href="/write">Compose a post</a><a href="/mine">My posts</a><a href="/profile">Edit profile</a>
 ${store.mode==='firebase'&&!u.emailVerified?'<p class="small">Verify your sign-in email before participating.</p><button id="resend-verification">Resend verification email</button><button id="refresh-verification">I have verified my email</button>':''}
 ${u.role!=='student'?'<a href="/review">Instructor area</a>':''}${u.role==='admin'?'<a href="/admin">Admin area</a>':''}${store.mode==='firebase'?'<button id="signout">Sign out</button>':''}</div></details>`;}
 document.addEventListener('click',async e=>{
 try{
  if(e.target.id==='resend-verification'){await store.resendVerification();toast('Verification email sent.');}
  if(e.target.id==='refresh-verification')toast(await store.refreshVerification()?'Email verified. You can now accept your invitation.':'Open the verification link in your email first.');
  if(e.target.id==='signout'){await store.signOut();activeInvitation=null;navigate('/');toast('Signed out.');}
 }catch(err){toast(friendly(err));}
 const menu=document.querySelector('.account-menu[open]');if(menu&&!menu.contains(e.target))menu.removeAttribute('open');
});
export async function openAuthModal(view='signin',invitation=null){
 let m=document.getElementById('auth-modal');if(!m){m=document.createElement('dialog');m.id='auth-modal';document.body.append(m);m.addEventListener('click',e=>{if(e.target.closest('.close'))m.close();});}
 if(view==='register'&&!invitation&&!/^\/(invite|join)\//.test(route()))activeInvitation=null;
 if(invitation)activeInvitation=invitation;
 if(!activeInvitation){try{activeInvitation=await routeInvitation();}catch{}}
 const collecting=view==='register'||view==='complete',u=currentUser();
 if(collecting&&!activeInvitation){
  m.innerHTML=`<form method="dialog" class="auth-form"><button type="button" class="close" aria-label="Close">×</button><h2>Enter your invitation code</h2><p class="muted">Use the city name supplied by the platform admin or your module instructor.</p><label>Registration code<input name="registrationCode" required autocomplete="off" placeholder="e.g. Madrid-483"></label><button class="btn primary" value="submit">Continue</button><p class="auth-msg" aria-live="polite"></p></form>`;
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
  ${google&&view!=='reset'&&view!=='complete'?`${collecting?'<label>Gmail for Google sign-in (optional)<input name="googleEmail" type="email" autocomplete="off" placeholder="yourname@gmail.com"></label><p class="hint">Choose this account in the next window. No password below is needed when using Google.</p>':''}<button type="button" class="btn provider" data-provider="google.com">Continue with Google</button>`:''}
  ${view==='complete'?'<button class="btn primary" value="submit">Save profile and continue</button>':pw?`${view!=='reset'?'<div class="or">or with email and password</div>':''}${collecting?'':'<label>Email<input name="email" type="email" required autocomplete="username"></label>'}${view==='reset'?'':`<label>Password${collecting?' (for university email sign-in)':''}<input name="password" type="password" required minlength="8" autocomplete="${collecting?'new-password':'current-password'}"></label>`}<button class="btn primary" value="submit">${collecting?'Register with university email':view==='reset'?'Send reset email':'Log in'}</button><p class="muted small">${collecting?'Already registered? <a href="#" data-view="signin">Log in</a>':'Have an invitation? <a href="#" data-view="register">Register</a> · <a href="#" data-view="reset">Forgot password?</a>'}</p>`:''}
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
function friendly(e){const c=e?.code||'';if(c.includes('operation-not-allowed'))return 'This sign-in method is not enabled yet.';if(c.includes('popup-closed'))return 'The Google sign-in window was closed.';if(c.includes('email-already-in-use'))return 'This email already has an account. Log in instead.';if(c.includes('invalid-credential')||c.includes('wrong-password')||c.includes('user-not-found'))return 'Email or password not recognised.';if(c.includes('unauthorized-domain'))return 'This domain is not authorised for sign-in.';return e?.message||'Please try again.';}
