import test from 'node:test';
import assert from 'node:assert/strict';
import {rawMessage, graphMessage, gmailError, graphError, SENDERS, MS_SCOPES, GMAIL_SEND_SCOPE} from '../mail-model.js';

const decode = raw => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

test('the Gmail raw message carries the headers and the UTF-8 body, base64url-encoded', () => {
  const raw = rawMessage({from: 'k@ucd.ie', fromName: 'Konstantinos Stouras', to: 'a@ucdconnect.ie', toName: 'Aoife Ní Bhriain', subject: 'BMGT2017D: the 4 blog posts assigned to you for review', body: 'Dear Aoife,\n\n1. https://x/p1\n\nBest wishes,\nKostas'});
  assert.match(raw, /^[A-Za-z0-9_-]+$/);   // base64url, no padding
  const text = decode(raw), [head, bodyB64] = text.split('\r\n\r\n');
  assert.ok(head.includes('From: Konstantinos Stouras <k@ucd.ie>'));
  assert.ok(head.includes('To: =?UTF-8?B?') && head.includes('<a@ucdconnect.ie>'));   // the accented name is RFC 2047-encoded
  assert.ok(head.includes('Subject: BMGT2017D: the 4 blog posts assigned to you for review'));
  assert.ok(head.includes('Content-Type: text/plain; charset="UTF-8"') && head.includes('Content-Transfer-Encoding: base64'));
  assert.equal(Buffer.from(bodyB64.replace(/\r\n/g, ''), 'base64').toString('utf8'), 'Dear Aoife,\n\n1. https://x/p1\n\nBest wishes,\nKostas');
  assert.ok(decode(rawMessage({from: 'k@ucd.ie', to: 'a@b', subject: 'Ένα θέμα', body: 'x', replyTo: 'r@ucd.ie'})).includes('Subject: =?UTF-8?B?'));
  assert.ok(decode(rawMessage({from: 'k@ucd.ie', to: 'a@b', subject: 's', body: 'x', replyTo: 'r@ucd.ie'})).includes('Reply-To: r@ucd.ie'));
});

test('the Graph message names the sender only when it is not the mailbox itself', () => {
  const own = graphMessage({own: 'K@ucd.ie', from: 'k@ucd.ie', to: 'a@b', toName: 'A B', subject: 's', body: 'text'});
  assert.deepEqual(own, {message: {subject: 's', body: {contentType: 'Text', content: 'text'}, toRecipients: [{emailAddress: {address: 'a@b', name: 'A B'}}]}, saveToSentItems: true});
  const alias = graphMessage({own: 'k@ucd.ie', from: 'pm-module@ucd.ie', fromName: 'PM', to: 'a@b', subject: 's', body: 'text', replyTo: 'k@ucd.ie'});
  assert.deepEqual(alias.message.from, {emailAddress: {address: 'pm-module@ucd.ie', name: 'PM'}});
  assert.deepEqual(alias.message.replyTo, [{emailAddress: {address: 'k@ucd.ie'}}]);
});

test('the errors are readable and the senders are the two accounts', () => {
  assert.match(gmailError(401), /expired/);
  assert.match(gmailError(403, 'Gmail API has not been used in project 513789063041 before or it is disabled.'), /not enabled .*console\.cloud\.google\.com/);
  assert.match(gmailError(403, 'Insufficient Permission'), /refused to send: Insufficient Permission/);
  assert.match(gmailError(500, 'Backend Error'), /Gmail error 500: Backend Error/);
  assert.match(graphError(401), /expired/);
  assert.match(graphError(403, 'ErrorSendAsDenied'), /send as that address/);
  assert.match(graphError(429), /Microsoft 365 error 429/);
  assert.deepEqual(Object.keys(SENDERS), ['microsoft', 'google']);
  assert.ok(MS_SCOPES.includes('Mail.Send') && /gmail\.send$/.test(GMAIL_SEND_SCOPE));
});
