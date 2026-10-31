// Account control in the header. LOCAL mode: a "View as" switcher (no sign-in at all).
// FIREBASE mode: a small sign-in / register modal (Google + e-mail/password), kept
// deliberately minimal so it can be swapped for the house account modal later.
import {store} from './store.js';
import {esc, toast} from './util.js';
import {enabledProviders} from './firebase-config.js';

export const currentUser = () => store.currentUser();

export function renderAccountControl(el) {
  const u = currentUser();
  if (store.mode === 'local') {
    const users = store.users();
    el.innerHTML = `<label class="viewas">View as
      <select id="viewas">
        <option value="">Visitor (signed out)</option>
        ${users.map(x => `<option value="${x.uid}" ${u && u.uid === x.uid ? 'selected' : ''}>${esc(x.penName)} · ${esc(x.role)}</option>`).join('')}
      </select></label>
      ${u ? accountMenu(u) : ''}`;
    el.querySelector('#viewas').onchange = e => store.viewAs(e.target.value);
    return;
  }
  el.innerHTML = u ? accountMenu(u) : `<button class="btn small" id="signin-btn">Log in</button> <button class="btn small" id="register-btn">Register</button>`;
  el.querySelector('#signin-btn')?.addEventListener('click', () => openAuthModal('signin'));
  el.querySelector('#register-btn')?.addEventListener('click', () => openAuthModal('register'));
}

function accountMenu(u) {
  return `<details class="account-menu"><summary><span class="avatar">${esc((u.penName || '?')[0].toUpperCase())}</span> ${esc(u.penName)} <small>${esc(u.role)}</small></summary>
  <div class="menu">
    <a href="#/write">Write a post</a>
    <a href="#/mine">My posts</a>
    <a href="#/profile">Edit profile</a>
    ${store.mode === 'firebase' && !u.emailVerified ? '<p class="small">Verify your e-mail before posting.</p><button id="resend-verification">Resend verification e-mail</button><button id="refresh-verification">I have verified my e-mail</button>' : ''}
    ${u.role !== 'student' ? '<a href="#/review">Lecturer area</a>' : ''}
    ${u.role === 'admin' ? '<a href="#/admin">Admin area</a>' : ''}
    ${store.mode === 'firebase' ? '<button id="signout">Sign out</button>' : ''}
  </div></details>`;
}
document.addEventListener('click', async e => {
  if (e.target.id === 'resend-verification' || e.target.id === 'refresh-verification') {
    try {
      if (e.target.id === 'resend-verification') { await store.resendVerification(); toast('Verification e-mail sent.'); }
      else toast(await store.refreshVerification() ? 'E-mail verified. You can now post.' : 'Please open the verification link in your e-mail first.');
    } catch (err) { toast(friendly(err)); }
  }
  if (e.target.id === 'signout') { await store.signOut(); location.hash = '#/'; toast('Signed out.'); }
  const open = document.querySelector('.account-menu[open]');
  if (open && !open.contains(e.target)) open.removeAttribute('open');
});

export function openAuthModal(view = 'signin') {
  let m = document.getElementById('auth-modal');
  if (!m) { m = document.createElement('dialog'); m.id = 'auth-modal'; document.body.append(m); }
  const google = enabledProviders.includes('google.com'), pw = enabledProviders.includes('password');
  m.innerHTML = `<form method="dialog" class="auth-form">
    <button class="close" value="cancel" formnovalidate aria-label="Close">×</button>
    <h2>${view === 'register' ? 'Create your account' : 'Log in'}</h2>
    <p class="muted">Use a non-identifying pen name: it is what classmates see on your posts and comments. Your real name is visible only to the lecturer.</p>
    ${google ? `<button type="button" class="btn provider" data-provider="google.com">Continue with Google</button>` : ''}
    ${pw ? `<div class="or">or with e-mail</div>
    ${view === 'register' ? `<label>First name<input name="firstName" required maxlength="80"></label><label>Last name<input name="lastName" required maxlength="80"></label><label>Pen name<input name="penName" required maxlength="24" pattern="[A-Za-z0-9_]+" title="Letters, digits and underscores"></label>` : ''}
    <label>E-mail<input name="email" type="email" required autocomplete="username"></label>
    <label>Password<input name="password" type="password" required minlength="8" autocomplete="${view === 'register' ? 'new-password' : 'current-password'}"></label>
    <button class="btn primary" value="submit">${view === 'register' ? 'Register' : 'Log in'}</button>
    <p class="muted small">${view === 'register' ? 'Already registered? <a href="#" data-view="signin">Log in</a>' : 'New here? <a href="#" data-view="register">Create an account</a> · <a href="#" data-view="reset">Forgot password?</a>'}</p>` : ''}
    <p class="auth-msg" aria-live="polite"></p>
  </form>`;
  const msg = m.querySelector('.auth-msg');
  m.querySelectorAll('[data-view]').forEach(a => a.onclick = e => { e.preventDefault(); openAuthModal(a.dataset.view); });
  m.querySelectorAll('[data-provider]').forEach(b => b.onclick = async () => { try { await store.signIn(b.dataset.provider); m.close(); toast('Signed in.'); } catch (e) { msg.textContent = friendly(e); } });
  m.querySelector('form').onsubmit = async e => {
    if (e.submitter?.value !== 'submit') return;
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      if (view === 'register') {
        await store.register(f);
        m.close(); toast('Account created. Check your e-mail to verify your address before posting.'); return;
      }
      else if (view === 'reset') { await store.resetPassword(f.email); msg.textContent = 'Password reset e-mail sent.'; return; }
      else await store.signIn('password', f);
      m.close(); toast('Signed in.');
    } catch (err) { msg.textContent = friendly(err); }
  };
  if (view === 'reset') { m.querySelector('[name=password]')?.closest('label').remove(); m.querySelector('.btn.primary').textContent = 'Send reset e-mail'; }
  if (!m.open) m.showModal();
}
function friendly(e) {
  const c = e?.code || '';
  if (c.includes('operation-not-allowed')) return 'That sign-in method is not switched on for this site yet.';
  if (c.includes('popup-closed')) return 'The sign-in window was closed before finishing.';
  if (c.includes('email-already-in-use')) return 'That e-mail already has an account. Log in instead.';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'E-mail or password not recognised.';
  if (c.includes('unauthorized-domain')) return 'This domain is not authorised in Firebase yet.';
  return e?.message || 'Something went wrong. Please try again.';
}
