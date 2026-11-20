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
  const art = document.getElementById('welcome-art').content.firstElementChild.cloneNode(true);
  art.querySelector('[data-tagline]').textContent = S.tagline;
  return `<section class="welcome" aria-label="Welcome">${art.outerHTML}${card}</section>`;
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
