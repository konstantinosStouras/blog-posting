// The pure part of sending email from the admin's own mailbox (mail.js does the sign-in and
// the network): the two senders, the message formats of the Gmail API and of Microsoft
// Graph, and readable errors. Unit-tested.
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const MS_SCOPES = ['Mail.Send', 'User.Read'];
export const GMAIL_ENABLE_URL = 'https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=stouras-ucd-blog';
export const SENDERS = {
  microsoft: {name: 'Microsoft 365 account (UCD)', hint: 'Microsoft 365: your UCD mailbox, so the letters come from your university address. The site must be registered once as an app in Microsoft Entra (MICROSOFT_CLIENT_ID in firebase-config.js).'},
  google: {name: 'Google account', hint: 'Google: the Gmail account you sign in to the site with; the Gmail API must be enabled once in the site\'s Google Cloud project. To come from your UCD address this way, that address must be a verified "Send mail as" alias of the Gmail account.'},
};

// UTF-8 text → base64 (standard) and base64url, as the Gmail API wants.
export const b64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64url = s => b64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// A header value that may hold non-ASCII (a name, an accented subject): RFC 2047.
const header = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
const address = (email, name = '') => name ? `${header(name)} <${email}>` : email;

// The RFC 822 message, base64url-encoded, that the Gmail API takes as `raw`.
export function rawMessage({from, fromName = '', to, toName = '', subject, body, replyTo = ''}) {
  const head = [`From: ${address(from, fromName)}`, `To: ${address(to, toName)}`, replyTo ? `Reply-To: ${replyTo}` : '', `Subject: ${header(subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64'].filter(Boolean);
  return b64url(head.join('\r\n') + '\r\n\r\n' + b64(body).replace(/(.{76})/g, '$1\r\n'));
}
// The JSON body of Microsoft Graph's /me/sendMail. `from` only when it differs from the
// mailbox's own address (a shared mailbox or alias the account may send as).
export function graphMessage({from = '', fromName = '', own = '', to, toName = '', subject, body, replyTo = ''}) {
  const message = {subject, body: {contentType: 'Text', content: body}, toRecipients: [{emailAddress: toName ? {address: to, name: toName} : {address: to}}]};
  if (from && from.toLowerCase() !== String(own).toLowerCase()) message.from = {emailAddress: fromName ? {address: from, name: fromName} : {address: from}};
  if (replyTo) message.replyTo = [{emailAddress: {address: replyTo}}];
  return {message, saveToSentItems: true};
}
// What to tell the admin when a send fails.
export function gmailError(status, detail = '') {
  if (status === 401) return 'Your Google connection has expired: connect it again.';
  if (status === 403 && /not been used|is disabled|accessNotConfigured|has not been enabled/i.test(detail)) return 'The Gmail API is not enabled for the site\'s Google Cloud project yet: enable it once at ' + GMAIL_ENABLE_URL + ' and connect again.';
  if (status === 403) return 'Google refused to send: ' + (detail || 'the send-email permission was not granted.');
  return `Gmail error ${status}${detail ? ': ' + detail : ''}`;
}
export function graphError(status, detail = '') {
  if (status === 401) return 'Your Microsoft connection has expired: connect it again.';
  if (/SendAsDenied/i.test(detail)) return 'Microsoft 365 does not let this account send as that address: leave "Send as" empty to send from the connected mailbox.';
  if (status === 403) return 'Microsoft 365 refused to send: ' + (detail || 'the Mail.Send permission was not granted.');
  return `Microsoft 365 error ${status}${detail ? ': ' + detail : ''}`;
}
