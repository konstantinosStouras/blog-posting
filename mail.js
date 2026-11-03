// Sending email from the signed-in admin's own mailbox, in the browser.
//
// The site has no mail server. Two routes, chosen by the admin: their Google account
// through the Gmail API (Firebase's own Google sign-in asks for the "send email on your
// behalf" scope and hands back a short-lived access token, never stored), or their
// Microsoft 365 account, the UCD address, through Microsoft Graph (a sign-in popup from
// the Microsoft library, loaded only then; the site must be registered once in Microsoft
// Entra, MICROSOFT_CLIENT_ID in firebase-config.js). Each letter is one request from the
// browser. In the local prototype nothing leaves the page: the demo connection pretends.
import {store} from './store.js';
import {publicUrl} from './router.js';
import {MICROSOFT_CLIENT_ID} from './firebase-config.js';
import {GMAIL_SEND_SCOPE, MS_SCOPES, SENDERS, rawMessage, graphMessage, gmailError, graphError} from './mail-model.js';
export {SENDERS};

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const MSAL_URL = 'https://cdn.jsdelivr.net/npm/@azure/msal-browser@4/lib/msal-browser.min.js';
let msal = null;

async function loadMsal() {
  if (window.msal?.PublicClientApplication) return window.msal;
  await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = MSAL_URL; s.onload = ok; s.onerror = () => fail(Error('Could not load the Microsoft sign-in library.')); document.head.append(s); });
  if (!window.msal?.PublicClientApplication) throw Error('The Microsoft sign-in library did not load.');
  return window.msal;
}

// A connection: {kind, accessToken, email, name}. The token lasts about an hour.
export async function connectSender(kind) {
  if (!SENDERS[kind]) throw Error('Choose Google or Microsoft 365.');
  const u = store.currentUser();
  if (!u) throw Error('Sign in first.');
  if (store.mode === 'local') { await new Promise(r => setTimeout(r, 200)); return {kind, accessToken: 'demo', email: u.email || 'demo@example.com', name: u.displayName || u.penName || 'Demo'}; }
  if (kind === 'google') { const g = await store.googleAccessToken([GMAIL_SEND_SCOPE]); return {kind, ...g}; }
  if (!MICROSOFT_CLIENT_ID) throw Error('The site is not registered with Microsoft yet: an app registration in Microsoft Entra gives a client ID to put in firebase-config.js (MICROSOFT_CLIENT_ID).');
  const m = await loadMsal();
  if (!msal) { msal = new m.PublicClientApplication({auth: {clientId: MICROSOFT_CLIENT_ID, authority: 'https://login.microsoftonline.com/common', redirectUri: publicUrl('/')}, cache: {cacheLocation: 'sessionStorage'}}); await msal.initialize(); }
  const res = await msal.loginPopup({scopes: MS_SCOPES, prompt: 'select_account'});
  const me = await fetch(GRAPH + '/me', {headers: {Authorization: 'Bearer ' + res.accessToken}}).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  return {kind, accessToken: res.accessToken, email: me.mail || me.userPrincipalName || res.account?.username || '', name: me.displayName || res.account?.name || ''};
}

// Sends one letter through the connection. Resolves to the provider's message id.
export async function sendMail(conn, {from = '', fromName = '', to, toName = '', subject, body, replyTo = ''}) {
  if (!conn) throw Error('Connect your mailbox first.');
  if (!to) throw Error('No email address for this student.');
  if (conn.accessToken === 'demo') { await new Promise(r => setTimeout(r, 250)); return 'demo-' + Date.now().toString(36); }
  const headers = {Authorization: `Bearer ${conn.accessToken}`, 'Content-Type': 'application/json'};
  if (conn.kind === 'google') {
    const res = await fetch(GMAIL_SEND_URL, {method: 'POST', headers, body: JSON.stringify({raw: rawMessage({from: from || conn.email, fromName: fromName || conn.name, to, toName, subject, body, replyTo})})});
    if (res.ok) return (await res.json()).id;
    throw Error(gmailError(res.status, await detailOf(res)));
  }
  const res = await fetch(GRAPH + '/me/sendMail', {method: 'POST', headers, body: JSON.stringify(graphMessage({from, fromName: fromName || conn.name, own: conn.email, to, toName, subject, body, replyTo}))});
  if (res.status === 202 || res.ok) return 'sent';
  throw Error(graphError(res.status, await detailOf(res)));
}
async function detailOf(res) { try { const j = await res.json(); return j.error?.message || j.error?.code || ''; } catch { return ''; } }
