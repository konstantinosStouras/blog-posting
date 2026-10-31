import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FEEDBACK_LIMITS, makeTicket, isTicket, buildFeedback, attachmentProblem, pickRecorderMime, recordingShouldStop, formatSeconds, feedbackMarkdown, replyMail} from '../feedback-model.js';

const img = (n = 1000) => ({kind: 'image', mime: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(n)});
const voice = (seconds = 42, n = 1000) => ({kind: 'audio', mime: 'audio/webm', dataUrl: 'data:audio/webm;base64,' + 'A'.repeat(n), seconds});

test('tickets carry the date and four random characters', () => {
  const t = makeTicket(new Date(2026, 9, 31), () => 0.123456789);
  assert.match(t, /^BLOG-261031-[A-Z0-9]{4}$/);
  assert.ok(isTicket(t)); assert.ok(!isTicket('LIT-261031-ABCD'));
});
test('a submission needs text or an attachment, and a signed-in author is recorded', () => {
  assert.throws(() => buildFeedback({text: '  '}), /write a short note/);
  assert.throws(() => buildFeedback({text: 'x'.repeat(FEEDBACK_LIMITS.text + 1)}), /shorten/);
  assert.throws(() => buildFeedback({text: 'ok', email: 'not-an-address'}), /e-mail/);
  const {doc, attachments} = buildFeedback({text: ' The Publish button is hidden on my phone. ', name: 'Ada', email: 'ada@ucd.ie', attachments: [img(), voice(30)], user: {uid: 'u1', role: 'student'}, context: {url: 'https://www.stouras.com/ucd-blog/#/write', route: '#/write', ua: 'UA', viewport: '390×844'}});
  assert.equal(doc.text, 'The Publish button is hidden on my phone.'); assert.equal(doc.uid, 'u1'); assert.equal(doc.role, 'student'); assert.equal(doc.status, 'new');
  assert.equal(doc.imageCount, 1); assert.equal(doc.audioCount, 1); assert.ok(isTicket(doc.ticket)); assert.equal(doc.route, '#/write');
  assert.deepEqual(attachments.map(a => [a.kind, a.order, a.seconds]), [['image', 0, 0], ['audio', 1, 30]]);
  const anon = buildFeedback({attachments: [img()]}).doc; assert.equal(anon.uid, null); assert.equal(anon.role, 'visitor');
});
test('attachments are bounded per kind and per document', () => {
  assert.equal(attachmentProblem(img(), []), '');
  assert.match(attachmentProblem(img(), Array(FEEDBACK_LIMITS.images).fill(img())), /up to 5 screenshots/);
  assert.match(attachmentProblem(voice(), [voice()]), /One voice note/);
  assert.match(attachmentProblem(img(FEEDBACK_LIMITS.attachmentBytes), []), /too large/);
  assert.match(attachmentProblem(voice(200, FEEDBACK_LIMITS.attachmentBytes), []), /too long/);
  assert.match(attachmentProblem({kind: 'image', dataUrl: 'data:audio/webm;base64,AA'}, []), /could not be read/);
  assert.match(attachmentProblem({kind: 'video', dataUrl: 'data:video/mp4;base64,AA'}, []), /Only screenshots and voice notes/);
  assert.throws(() => buildFeedback({attachments: [voice(), voice()]}), /One voice note/);
});
test('the recorder stops at the size or time limit, whichever comes first, and picks a supported container', () => {
  assert.equal(recordingShouldStop(1000, 10), false);
  assert.equal(recordingShouldStop(FEEDBACK_LIMITS.recordBytes, 10), true);
  assert.equal(recordingShouldStop(1000, FEEDBACK_LIMITS.recordSeconds), true);
  assert.ok(FEEDBACK_LIMITS.recordBytes * 4 / 3 + 40 < FEEDBACK_LIMITS.attachmentBytes, 'a full recording still fits one attachment document as base64');
  assert.equal(pickRecorderMime(m => m === 'audio/mp4'), 'audio/mp4');
  assert.equal(pickRecorderMime(m => m.startsWith('audio/webm')), 'audio/webm;codecs=opus');
  assert.equal(pickRecorderMime(() => { throw Error('no MediaRecorder'); }), '');
  assert.equal(formatSeconds(125), '2:05'); assert.equal(formatSeconds(), '0:00');
});
test('the Markdown copy and the reply e-mail follow the lit-feedback-log layout', () => {
  const entry = {id: 'abc', ticket: 'BLOG-261031-K3QP', text: 'Hello', name: 'Ada', email: 'ada@ucd.ie', role: 'student', uid: 'u1', url: 'https://x/#/write', route: '#/write', ua: 'UA', viewport: '390×844', imageCount: 1, audioCount: 1, status: 'closed', resolution: 'Fixed the button.', createdAt: Date.UTC(2026, 9, 31, 12), closedAt: Date.UTC(2026, 9, 31, 13)};
  const md = feedbackMarkdown(entry, [img(), voice(30)]);
  assert.match(md, /^# Feedback — BLOG-261031-K3QP/); assert.match(md, /\*\*From:\*\* Ada <ada@ucd.ie> \(student\)/); assert.match(md, /!\[screenshot-1\]\(data:image\/jpeg/); assert.match(md, /Voice note 0:30/); assert.match(md, /## Resolution\n\nFixed the button\./);
  const mail = replyMail(entry, 'Fixed the button.', 'UCD blog');
  assert.ok(mail.href.startsWith('mailto:ada@ucd.ie?subject=')); assert.match(mail.subject, /ticket BLOG-261031-K3QP\) is now closed/); assert.match(mail.body, /Dear Ada,/); assert.match(mail.body, /Fixed the button\./);
  assert.equal(replyMail({...entry, email: ''}, 'x'), null);
});
