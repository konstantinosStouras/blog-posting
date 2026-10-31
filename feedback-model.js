// Pure, DOM-free rules for the Feedback button: what a submission may contain, how
// big each attachment may be, the ticket format, and the Markdown copy an admin
// downloads. feedback.js (the widget and the admin inbox) and both backends import
// these so the limits live in one place and are unit-tested in Node.
//
// Storage shape (Firestore and local mode alike):
//   feedback/{id}                  text, ticket, who, where, status, counts
//   feedback/{id}/attachments/{n}  one screenshot or voice note each, as a data URL
// Each attachment sits in its own document so a submission with several
// screenshots and a voice note never approaches Firestore's 1 MB document limit.
export const FEEDBACK_LIMITS = {
  text: 20000,          // characters of free text
  name: 200,
  email: 320,
  images: 5,            // screenshots per submission
  audio: 1,             // voice notes per submission
  attachmentBytes: 900 * 1024,   // base64 data URL length per attachment document
  imageEdge: 1400,      // longest screenshot edge after downscaling
  recordSeconds: 180,   // a voice note stops itself here
  recordBytes: 640 * 1024,       // raw recording bytes; ×4/3 as base64 stays under attachmentBytes
};
export const TICKET_PREFIX = 'BLOG';

// A short human-friendly reference, e.g. BLOG-261031-K3QP: date plus four random
// base-36 characters. The Firestore document id remains the primary key.
export function makeTicket(now = new Date(), random = Math.random) {
  const d = now instanceof Date ? now : new Date(now);
  const ymd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  let rand = '';
  while (rand.length < 4) rand += random().toString(36).slice(2).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${TICKET_PREFIX}-${ymd}-${rand.slice(0, 4)}`;
}
export const isTicket = s => new RegExp(`^${TICKET_PREFIX}-\\d{6}-[A-Z0-9]{4}$`).test(String(s || ''));
export const validEmail = s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '').trim());

// The recorder picks the first container the browser can produce. Chrome and
// Firefox record Opus in WebM; Safari records AAC in MP4.
export const RECORDER_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
export const pickRecorderMime = (supported = () => false) => RECORDER_MIMES.find(m => { try { return supported(m); } catch { return false; } }) || '';

// Recording stops itself before the voice note would outgrow one attachment
// document, whichever of the time and size limits is hit first.
export const recordingShouldStop = (bytes, seconds, limits = FEEDBACK_LIMITS) => bytes >= limits.recordBytes || seconds >= limits.recordSeconds;

export const formatSeconds = s => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
export const formatBytes = n => n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

// Checks one attachment as the widget adds it. Returns an error message or ''.
export function attachmentProblem(att, existing = [], limits = FEEDBACK_LIMITS) {
  if (!att || !['image', 'audio'].includes(att.kind)) return 'Only screenshots and voice notes can be attached.';
  if (typeof att.dataUrl !== 'string' || !att.dataUrl.startsWith(`data:${att.kind}/`)) return `That ${att.kind === 'image' ? 'screenshot' : 'recording'} could not be read.`;
  if (att.dataUrl.length > limits.attachmentBytes) return att.kind === 'image' ? 'That screenshot is too large even after compression. Try a smaller or cropped image.' : 'That recording is too long to send. Please record a shorter note.';
  const count = existing.filter(a => a.kind === att.kind).length;
  if (att.kind === 'image' && count >= limits.images) return `You can attach up to ${limits.images} screenshots.`;
  if (att.kind === 'audio' && count >= limits.audio) return 'One voice note per message. Remove the current recording to record again.';
  return '';
}

// Builds the parent document and its attachment documents from what the widget
// collected. Throws with a user-facing message when the submission is empty or
// over a limit. `context` is where the visitor was (route, page URL, browser).
export function buildFeedback({text = '', name = '', email = '', attachments = [], user = null, context = {}}, limits = FEEDBACK_LIMITS) {
  text = String(text || '').trim(); name = String(name || '').trim(); email = String(email || '').trim();
  if (!text && !attachments.length) throw Error('Please write a short note, add a screenshot or record a voice note.');
  if (text.length > limits.text) throw Error('Please shorten the description a little.');
  if (name.length > limits.name) throw Error('That name is too long.');
  if (email && (email.length > limits.email || !validEmail(email))) throw Error('That e-mail address does not look right.');
  const seen = [];
  for (const a of attachments) { const problem = attachmentProblem(a, seen, limits); if (problem) throw Error(problem); seen.push(a); }
  const images = attachments.filter(a => a.kind === 'image'), audio = attachments.filter(a => a.kind === 'audio');
  const doc = {
    text, name, email,
    uid: user?.uid || null,
    role: user?.role || 'visitor',
    ticket: makeTicket(),
    url: String(context.url || '').slice(0, 2000),
    route: String(context.route || '').slice(0, 300),
    ua: String(context.ua || '').slice(0, 1000),
    viewport: String(context.viewport || '').slice(0, 40),
    imageCount: images.length, audioCount: audio.length,
    status: 'new',
    createdAt: Date.now(),
  };
  const docs = attachments.map((a, i) => ({kind: a.kind, mime: String(a.mime || '').slice(0, 100), dataUrl: a.dataUrl, bytes: a.dataUrl.length, seconds: a.kind === 'audio' ? Math.round(a.seconds || 0) : 0, order: i}));
  return {doc, attachments: docs};
}

// The admin's offline copy of one submission: the same layout as the private
// lit-feedback-log mirror, so a ticket can be handed to an assistant as text.
export function feedbackMarkdown(entry, attachments = []) {
  const when = t => t ? new Date(t).toISOString() : '—';
  const who = [entry.name, entry.email ? `<${entry.email}>` : ''].filter(Boolean).join(' ') || 'anonymous';
  const lines = [`# Feedback — ${entry.ticket || entry.id}`, '', entry.text || '_(no message — attachments only)_', '', '---', '',
    `- **Ticket:** ${entry.ticket || '—'}`, `- **Status:** ${entry.status || 'new'}`, `- **From:** ${who}${entry.role && entry.role !== 'visitor' ? ` (${entry.role})` : ''}`,
    `- **Submitted:** ${when(entry.createdAt)}`, `- **On page:** ${entry.url || '—'}${entry.route ? ` (${entry.route})` : ''}`,
    `- **Signed-in UID:** ${entry.uid || '—'}`, `- **Browser:** ${entry.ua || '—'}${entry.viewport ? ` · ${entry.viewport}` : ''}`,
    `- **Screenshots:** ${entry.imageCount || 0}`, `- **Voice notes:** ${entry.audioCount || 0}`];
  attachments.forEach((a, i) => lines.push('', a.kind === 'image' ? `![screenshot-${i + 1}](${a.dataUrl})` : `Voice note ${formatSeconds(a.seconds)} (${a.mime || 'audio'}): ${a.dataUrl.slice(0, 60)}…`));
  if (entry.status === 'closed') lines.push('', '## Resolution', '', entry.resolution || '_(none recorded)_', '', `- **Resolved:** ${when(entry.closedAt)}`);
  return lines.join('\n') + '\n';
}

// The pre-composed reply the admin's mail client opens on "Mark complete".
export function replyMail(entry, resolution, siteTitle = 'UCD blog', siteUrl = 'https://www.stouras.com/ucd-blog/') {
  if (!validEmail(entry.email)) return null;
  const t = entry.ticket || entry.id;
  let orig = String(entry.text || '').trim() || '(attachments only)';
  if (orig.length > 1500) orig = orig.slice(0, 1500) + '…';
  const subject = `${siteTitle} — your feedback (ticket ${t}) is now closed`;
  const body = `Dear ${String(entry.name || '').trim() || 'reader'},\n\nThank you for your feedback on ${siteTitle} — ticket ${t} is now closed.\n\nHow it was acted on:\n${resolution || '(fill in)'}\n\n— — —\nYour original message:\n${orig}\n\nThanks again for helping improve the site!\n\nKonstantinos\n${siteUrl}`;
  // The address itself is not percent-encoded (RFC 6068): some clients would address the literal "user%40host".
  return {subject, body, href: `mailto:${String(entry.email).trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`};
}
