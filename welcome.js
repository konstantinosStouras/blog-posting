// The front door for a visitor who is not signed in, drawn above the blog directory.
// Like a social network's landing page: a sketch of a blog and a headline on the left;
// on the right, the ways in. Someone who signed in on this device before sees their
// name and picture with Continue; anyone else sees Log in and Create new account.
// Registration always goes through the invitation code and the registration form,
// which asks for the person's details before offering Google or a password.
import {store} from './store.js';
import {openAuthModal, continueAs, lastAccount, forgetAccount, avatarHtml, googleButton} from './auth.js';
import {enabledProviders} from './firebase-config.js';
import {esc, toast} from './util.js';

// A hand-drawn blog: a post card with a title, a picture and tags, a comment bubble,
// a like, a review tick and a pencil. Colours are the site's own.
const SKETCH = `<svg viewBox="0 0 540 380" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" font-family="'Libre Baskerville', Georgia, serif">
 <defs><filter id="wsh" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#1b1b1b" flood-opacity=".12"/></filter></defs>
 <g stroke="#1b1b1b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
  <!-- the post card -->
  <g transform="rotate(-3 270 190)" filter="url(#wsh)">
   <rect x="120" y="42" width="310" height="296" rx="14" fill="#fff"/>
   <rect x="142" y="64" width="78" height="9" rx="4" fill="#1f5fd1" stroke="none"/>
   <rect x="142" y="78" width="120" height="4" rx="2" fill="#c9d9f7" stroke="none"/>
   <path d="M142 92 H408" stroke-width="3"/>
   <rect x="142" y="104" width="238" height="12" rx="6" fill="#1b1b1b" stroke="none"/>
   <rect x="142" y="123" width="176" height="12" rx="6" fill="#1b1b1b" stroke="none"/>
   <!-- the picture -->
   <rect x="142" y="148" width="266" height="96" rx="8" fill="#f6f6f4"/>
   <circle cx="188" cy="178" r="13" fill="#e2541b" stroke="none"/>
   <path d="M150 236 L212 190 L246 220 L282 180 L334 232 L396 196" />
   <path d="M150 240 H404" stroke="#f6f6f4"/>
   <!-- the text -->
   <rect x="142" y="258" width="266" height="5" rx="2.5" fill="#bdbdbd" stroke="none"/>
   <rect x="142" y="270" width="236" height="5" rx="2.5" fill="#bdbdbd" stroke="none"/>
   <rect x="142" y="282" width="252" height="5" rx="2.5" fill="#bdbdbd" stroke="none"/>
   <rect x="142" y="294" width="150" height="5" rx="2.5" fill="#bdbdbd" stroke="none"/>
   <!-- the tags -->
   <g stroke="#e2541b" stroke-width="1.5" fill="#fff"><rect x="142" y="309" width="60" height="18" rx="9"/><rect x="208" y="309" width="74" height="18" rx="9"/><rect x="288" y="309" width="52" height="18" rx="9"/></g>
   <g fill="#e2541b" stroke="none" font-size="10" font-style="italic"><text x="152" y="322">#trend</text><text x="218" y="322">#innovation</text><text x="298" y="322">#esg</text></g>
  </g>
  <!-- the comment bubble -->
  <g transform="rotate(4 420 300)" filter="url(#wsh)">
   <path d="M352 262 h166 a12 12 0 0 1 12 12 v58 a12 12 0 0 1 -12 12 h-118 l-26 20 v-20 h-22 a12 12 0 0 1 -12 -12 v-58 a12 12 0 0 1 12 -12z" fill="#fff" stroke="#1f5fd1"/>
   <circle cx="372" cy="288" r="10" fill="#1f5fd1" stroke="none"/>
   <rect x="390" y="282" width="56" height="5" rx="2.5" fill="#1f5fd1" stroke="none"/>
   <rect x="390" y="296" width="124" height="5" rx="2.5" fill="#bdbdbd" stroke="none"/>
   <rect x="390" y="308" width="104" height="5" rx="2.5" fill="#bdbdbd" stroke="none"/>
   <rect x="390" y="320" width="70" height="5" rx="2.5" fill="#bdbdbd" stroke="none"/>
  </g>
  <!-- a like -->
  <g transform="rotate(8 452 92)" filter="url(#wsh)">
   <circle cx="452" cy="92" r="24" fill="#fff" stroke="#e2541b"/>
   <path d="M452 104 c-9 -7 -14 -12 -14 -18 a7 7 0 0 1 14 -3 a7 7 0 0 1 14 3 c0 6 -5 11 -14 18z" fill="#e2541b" stroke="none"/>
  </g>
  <!-- a review tick -->
  <g transform="rotate(-10 82 262)" filter="url(#wsh)">
   <circle cx="82" cy="262" r="24" fill="#fff" stroke="#1f8f4e"/>
   <path d="M70 262 l9 9 l16 -18" stroke="#1f8f4e" stroke-width="3.5"/>
  </g>
  <!-- the pencil -->
  <g transform="rotate(-40 76 110)" filter="url(#wsh)">
   <rect x="66" y="52" width="20" height="92" rx="2" fill="#e2541b" stroke="none"/>
   <rect x="66" y="52" width="20" height="14" rx="2" fill="#1f5fd1" stroke="none"/>
   <path d="M66 144 l10 22 l10 -22z" fill="#f3d9a4" stroke="none"/>
   <path d="M73 158 l3 8 l3 -8z" fill="#1b1b1b" stroke="none"/>
   <rect x="66" y="52" width="20" height="92" rx="2"/>
   <path d="M66 144 l10 22 l10 -22"/>
  </g>
 </g>
</svg>`;

export function renderWelcome() {
  const S = store.settings(), acc = store.mode === 'firebase' ? lastAccount() : null;
  const google = enabledProviders.includes('google.com');
  const card = acc
    ? `<div class="welcome-card">${avatarHtml(acc, acc.name)}<p class="who-name">${esc(acc.name)}</p>${acc.email ? `<p class="who-mail">${esc(acc.email)}</p>` : ''}
        <button class="btn primary" id="welcome-continue">Continue</button>
        <button class="btn" id="welcome-other">Use another account</button><hr>
        <button class="btn outline" id="welcome-register">Create new account</button>
        <p class="muted small">Not you? <button class="linkish small" id="welcome-forget">Forget this account</button></p></div>`
    : `<div class="welcome-card"><h3>Log in to ${esc(S.title)}</h3>
        ${google ? googleButton('welcome-google') : ''}
        <button class="btn primary" id="welcome-email">Log in with email</button>
        <button class="linkish small" id="welcome-reset">Forgot password?</button><hr>
        <button class="btn outline" id="welcome-register">Create new account</button>
        <p class="muted small">Registration needs the invitation code from your instructor.</p></div>`;
  return `<section class="welcome" aria-label="Welcome"><div class="welcome-art">${SKETCH}
    <h2 class="welcome-title">Read, write and <span>review</span>.</h2>
    <p class="welcome-sub">${esc(S.tagline)}: posts on the megatrends shaping business and society. Your module's invitation lets you read, write and comment on its blog.</p></div>${card}</section>`;
}

export function bindWelcome(root) {
  const local = store.mode !== 'firebase';
  const needsLive = () => { toast('Sign-in exists only on the live platform. Pick a sample account at the top right.'); };
  const on = (id, fn) => root.querySelector('#' + id)?.addEventListener('click', fn);
  on('welcome-continue', () => continueAs(lastAccount() || {}));
  on('welcome-other', () => local ? needsLive() : openAuthModal('signin'));
  on('welcome-forget', () => { forgetAccount(); dispatchEvent(new CustomEvent('routechange')); });
  on('welcome-google', () => local ? needsLive() : continueAs({provider: 'google.com', email: ''}));
  on('welcome-email', () => local ? needsLive() : openAuthModal('signin'));
  on('welcome-reset', () => local ? needsLive() : openAuthModal('reset'));
  on('welcome-register', () => local ? needsLive() : openAuthModal('register'));
}
