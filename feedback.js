// The Feedback button (every page, every level of user, signed in or not) and the
// admin's Feedback inbox. Same idea as stouras.com/lit/feedback: the visitor
// describes what to improve, attaches screenshots that are compressed in the
// browser, and — new here — records a voice note; each submission gets a ticket
// number and lands in the `feedback` collection, which only the admin can read.
// Limits, validation and the ticket format live in feedback-model.js.
import {store} from './store.js';
import {currentUser, fullName} from './auth.js';
import {route} from './router.js';
import {esc, fmtDateTime, toast} from './util.js';
import {FEEDBACK_LIMITS as L, buildFeedback, attachmentProblem, pickRecorderMime, recordingShouldStop, formatSeconds, formatBytes, validEmail, feedbackMarkdown, replyMail} from './feedback-model.js';

const ICON = {
  bubble: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z"/><path d="M8.5 10.5h7M8.5 13.5h4"/></svg>',
  camera: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  mic: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg>',
};

// ---------- the floating button ----------
export function mountFeedbackButton() {
  if (document.getElementById('feedback-fab')) return;
  const b = document.createElement('button');
  b.id = 'feedback-fab'; b.type = 'button'; b.className = 'fb-fab';
  b.title = 'Send feedback about this site'; b.setAttribute('aria-label', 'Send feedback about this site');
  b.innerHTML = `${ICON.bubble}<span>Feedback</span>`;
  b.onclick = () => openFeedbackDialog();
  document.body.append(b);
}

// ---------- the dialog ----------
let dialog = null, attachments = [], recorder = null, busy = false;
const $ = sel => dialog.querySelector(sel);
const status = (msg = '', kind = '') => { const el = $('#fb-status'); if (el) { el.textContent = msg; el.className = 'fb-status ' + kind; } };

export function openFeedbackDialog() {
  if (!dialog) {
    dialog = document.createElement('dialog'); dialog.id = 'feedback-dialog'; dialog.className = 'fb-dialog';
    document.body.append(dialog);
    dialog.addEventListener('close', () => { if (recorder) { recorder.discard = true; stopRecording(); } attachments = []; });
    // A screenshot on the clipboard (Print Screen, Snipping Tool) pastes straight into the message.
    dialog.addEventListener('paste', e => {
      const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); addImages(files); }
    });
  }
  attachments = []; busy = false;
  drawForm();
  if (!dialog.open) dialog.showModal();
}

function drawForm() {
  const u = currentUser();
  const signed = u ? `Signed in as <b>${esc(fullName(u))}</b>${u.email ? ` (${esc(u.email)})` : ''} — included so we can follow up.` : 'You are not signed in. Leave an e-mail if you would like a reply.';
  dialog.innerHTML = `<form method="dialog" class="fb-form" novalidate>
    <button type="button" class="close" aria-label="Close">×</button>
    <h2>Help improve this site</h2>
    <p class="muted small">Something wrong, confusing or missing? Write a note, add screenshots or record a voice note — any mix works. Every message reaches the maintainer with a ticket number.</p>
    <label class="field">What should improve?<textarea name="text" rows="5" maxlength="${L.text}" placeholder="e.g. On the writer page, the Publish button… / It would help if I could…"></textarea></label>
    <div class="fb-attach">
      <div class="fb-drop" id="fb-drop" tabindex="0" role="button" aria-label="Add screenshots">${ICON.camera}<b>Add screenshots</b><small>Drop, click to browse, or paste (Ctrl+V). Up to ${L.images}, compressed in your browser.</small></div>
      <input type="file" id="fb-file" accept="image/*" multiple hidden>
      <button type="button" class="fb-drop" id="fb-rec">${ICON.mic}<b>Record a voice note</b><small>Say it instead of typing. Up to ${formatSeconds(L.recordSeconds)}, stored with your message.</small></button>
    </div>
    <div class="fb-recorder" id="fb-recorder" hidden><span class="dot" aria-hidden="true"></span><span id="fb-rec-time">0:00</span><span class="muted small">Recording… press Stop when you are done.</span><button type="button" class="btn small" id="fb-rec-stop">Stop</button></div>
    <div class="fb-shots" id="fb-shots" aria-live="polite"></div>
    <div class="fb-who">
      <label class="field">Your name <span class="muted">(optional)</span><input name="name" maxlength="${L.name}" autocomplete="name" value="${esc(u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.penName || '' : '')}"></label>
      <label class="field">Your e-mail <span class="muted">(optional, for a reply)</span><input name="email" type="email" maxlength="${L.email}" autocomplete="email" value="${esc(u?.email || u?.contactEmail || '')}"></label>
    </div>
    <p class="muted small fb-signed">${signed}</p>
    <div class="actions"><button class="btn primary" value="send" id="fb-send">Send feedback</button><span class="fb-status" id="fb-status" aria-live="polite"></span></div>
  </form>`;
  const form = $('form'), drop = $('#fb-drop'), file = $('#fb-file');
  drop.onclick = () => file.click();
  drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
  file.onchange = () => { addImages([...file.files]); file.value = ''; };
  for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); });
  for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); });
  drop.addEventListener('drop', e => addImages([...(e.dataTransfer?.files || [])]));
  $('#fb-rec').onclick = startRecording;
  $('#fb-rec-stop').onclick = () => stopRecording();
  // Enter in the name or e-mail field submits the form; the close button is not a submit button, so it can never be the implicit submitter.
  form.onsubmit = e => { e.preventDefault(); send(form); };
  form.querySelector('.close').onclick = () => dialog.close();
  renderShots();
}

function drawDone(ticket, email) {
  dialog.innerHTML = `<div class="fb-done"><button type="button" class="close" aria-label="Close">×</button>
    <div class="ico" aria-hidden="true">🙏</div><h2>Thank you!</h2>
    <p>Your feedback has been received and will be read by the maintainer.</p>
    <p class="fb-ticket">Your reference is <code>${esc(ticket)}</code>. ${validEmail(email) ? `Any reply will go to <b>${esc(email)}</b>.` : 'Keep it if you would like to follow up; without an e-mail, a direct reply is not possible.'}</p>
    <div class="actions"><button type="button" class="btn" id="fb-again">Send another</button><button type="button" class="btn primary" id="fb-close">Done</button></div></div>`;
  $('.close').onclick = $('#fb-close').onclick = () => dialog.close();
  $('#fb-again').onclick = () => { attachments = []; drawForm(); };
}

// ---------- screenshots ----------
// Downscale and JPEG-compress in the browser, retrying at lower quality and then
// a smaller edge, so one screenshot always fits in one attachment document.
function compressScreenshot(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) return reject(Error('Only image files can be added as screenshots.'));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let out = '';
      for (const edge of [L.imageEdge, 1000, 720]) {
        const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * scale)); c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
        for (const q of [0.8, 0.68, 0.56, 0.44]) { out = c.toDataURL('image/jpeg', q); if (out.length <= 500 * 1024) break; }
        if (out.length <= L.attachmentBytes) break;
      }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(Error('That file could not be read as an image.')); };
    img.src = url;
  });
}
async function addImages(files) {
  files = files.filter(f => f.type.startsWith('image/'));
  if (!files.length) { status('Only image files can be added as screenshots.', 'err'); return; }
  status('Processing images…');
  for (const f of files) {
    try {
      const dataUrl = await compressScreenshot(f);
      const att = {kind: 'image', mime: 'image/jpeg', dataUrl, name: f.name || 'screenshot'};
      const problem = attachmentProblem(att, attachments);
      if (problem) { renderShots(); status(problem, 'err'); return; }
      attachments.push(att);
    } catch (e) { renderShots(); status(e.message, 'err'); return; }
  }
  renderShots(); status('');
}
function renderShots() {
  const box = $('#fb-shots'); if (!box) return;
  box.innerHTML = attachments.map((a, i) => a.kind === 'image'
    ? `<figure class="fb-shot"><img src="${a.dataUrl}" alt="Screenshot ${i + 1}"><button type="button" class="rm" data-i="${i}" aria-label="Remove screenshot">×</button><figcaption>${formatBytes(a.dataUrl.length)}</figcaption></figure>`
    : `<figure class="fb-shot audio"><audio controls src="${a.dataUrl}" preload="metadata"></audio><button type="button" class="rm" data-i="${i}" aria-label="Remove voice note">×</button><figcaption>Voice note · ${formatSeconds(a.seconds)} · ${formatBytes(a.dataUrl.length)}</figcaption></figure>`).join('');
  box.querySelectorAll('.rm').forEach(b => b.onclick = () => { attachments.splice(+b.dataset.i, 1); renderShots(); status(''); });
  const rec = $('#fb-rec'); if (rec) rec.disabled = attachments.some(a => a.kind === 'audio') || !!recorder;
}

// ---------- voice notes ----------
const blobToDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(Error('The recording could not be read.')); r.readAsDataURL(blob); });
async function startRecording() {
  if (recorder) return;
  if (attachments.some(a => a.kind === 'audio')) { status('One voice note per message. Remove the current recording to record again.', 'err'); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { status('Voice recording is not supported in this browser. Please type your note instead.', 'err'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({audio: true}); }
  catch (e) { status(e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'Microphone access was blocked. Allow the microphone for this site in your browser and try again.' : 'No microphone could be used (' + e.message + ').', 'err'); return; }
  const mime = pickRecorderMime(m => MediaRecorder.isTypeSupported(m));
  let mr;
  try { mr = new MediaRecorder(stream, {...(mime ? {mimeType: mime} : {}), audioBitsPerSecond: 32000}); } catch { mr = new MediaRecorder(stream); }
  const rec = recorder = {mr, stream, chunks: [], bytes: 0, started: Date.now(), timer: null, discard: false};
  const elapsed = () => (Date.now() - rec.started) / 1000;
  mr.ondataavailable = e => { if (e.data?.size) { rec.chunks.push(e.data); rec.bytes += e.data.size; } if (mr.state === 'recording' && recordingShouldStop(rec.bytes, elapsed())) stopRecording(); };
  mr.onstop = async () => {
    clearInterval(rec.timer); stream.getTracks().forEach(t => t.stop());
    const seconds = elapsed(); recorder = null;
    const panel = $('#fb-recorder'); if (panel) panel.hidden = true;
    if (rec.discard) return;
    const blob = new Blob(rec.chunks, {type: mr.mimeType || mime || 'audio/webm'});
    if (!blob.size || seconds < 0.5) { status('Nothing was recorded. Check that your microphone works and try again.', 'err'); renderShots(); return; }
    try {
      const att = {kind: 'audio', mime: blob.type, dataUrl: await blobToDataUrl(blob), seconds, name: 'voice note'};
      const problem = attachmentProblem(att, attachments);
      if (problem) status(problem, 'err'); else { attachments.push(att); status(''); }
    } catch (e) { status(e.message, 'err'); }
    renderShots();
  };
  mr.start(1000);
  $('#fb-recorder').hidden = false; $('#fb-rec-time').textContent = '0:00'; status(''); renderShots();
  rec.timer = setInterval(() => { const t = $('#fb-rec-time'); if (t) t.textContent = formatSeconds(elapsed()); if (recordingShouldStop(rec.bytes, elapsed())) stopRecording(); }, 250);
}
function stopRecording() { if (recorder && recorder.mr.state !== 'inactive') recorder.mr.stop(); }

// ---------- send ----------
async function send(form) {
  if (busy) return;
  if (recorder) { status('Stop the recording first.', 'err'); return; }
  const fd = new FormData(form);
  let built;
  try {
    built = buildFeedback({text: fd.get('text'), name: fd.get('name'), email: fd.get('email'), attachments, user: currentUser(),
      context: {url: location.href, route: route(), ua: navigator.userAgent, viewport: `${innerWidth}×${innerHeight}`}});
  } catch (e) { status(e.message, 'err'); return; }
  busy = true; $('#fb-send').disabled = true; status('Sending…');
  try { const {ticket} = await store.submitFeedback(built.doc, built.attachments); attachments = []; drawDone(ticket, built.doc.email); }
  catch (e) { console.error(e); status('Could not send (' + (e.code || e.message) + '). Please try again in a moment.', 'err'); const b = $('#fb-send'); if (b) b.disabled = false; }
  finally { busy = false; }
}

// ---------- admin inbox ----------
// Visible at /admin/feedback. The Firestore rules are what keep the collection
// private; this page only draws what the admin is already allowed to read.
export async function renderFeedbackInbox(el) {
  el.innerHTML = '<p class="muted">Loading feedback…</p>';
  let items;
  try { items = await store.listFeedback(); } catch (e) { el.innerHTML = `<p class="empty">The inbox could not be loaded (${esc(e.code || e.message)}). Are the latest Firestore rules deployed?</p>`; return; }
  const cache = new Map();   // id -> attachments, fetched once per item
  const loadAtts = async id => { if (!cache.has(id)) cache.set(id, store.listFeedbackAttachments(id).catch(() => [])); return cache.get(id); };
  let view = 'open';
  const isClosed = x => x.status === 'closed';
  const draw = () => {
    const open = items.filter(x => !isClosed(x)).length, closed = items.length - open;
    const shown = items.filter(x => view === 'all' || (view === 'closed' ? isClosed(x) : !isClosed(x)));
    let html = `<div class="fb-inbox-head"><p class="muted">${items.length} submission${items.length === 1 ? '' : 's'} — ${open} open, ${closed} closed. Visitors send these with the Feedback button; only the admin can read them.</p>
      <div class="chips">${['open', 'closed', 'all'].map(v => `<a href="/admin/feedback" data-view="${v}" class="${view === v ? 'active' : ''}">${v[0].toUpperCase() + v.slice(1)}</a>`).join('')}</div></div>`;
    if (!shown.length) html += `<p class="empty">${items.length ? 'Nothing in this view.' : 'No feedback yet. When a visitor uses the Feedback button, it appears here.'}</p>`;
    let lastDay = '';
    for (const x of shown) {
      const day = x.createdAt ? new Date(x.createdAt).toLocaleDateString('en-IE', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}) : 'Date unknown';
      if (day !== lastDay) { html += `<h3 class="fb-day">${esc(day)}</h3>`; lastDay = day; }
      const who = [x.name ? `<b>${esc(x.name)}</b>` : '', validEmail(x.email) ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : ''].filter(Boolean).join(' · ') || '<i class="muted">anonymous (no e-mail, so no reply can be sent)</i>';
      const n = (x.imageCount || 0) + (x.audioCount || 0);
      const meta = [x.role && x.role !== 'visitor' ? `Role ${esc(x.role)}` : 'Not signed in', x.uid ? `UID <code>${esc(x.uid)}</code>` : '', x.route ? `Page <code>${esc(x.route)}</code>` : '', x.viewport ? `Viewport ${esc(x.viewport)}` : '', x.ua ? `Browser ${esc(String(x.ua).slice(0, 110))}${String(x.ua).length > 110 ? '…' : ''}` : '', `Doc <code>${esc(x.id)}</code>`].filter(Boolean);
      html += `<article class="fb-item ${isClosed(x) ? 'closed' : ''}" data-id="${esc(x.id)}">
        <div class="fb-item-top"><span class="fb-ticket">🎫 ${esc(x.ticket || x.id)}</span><span class="badge ${isClosed(x) ? 'published' : 'pending'}">${isClosed(x) ? 'Closed' : x.status === 'reopened' ? 'Reopened' : 'Open'}</span><span class="muted small fb-when">${esc(fmtDateTime(x.createdAt))}</span></div>
        <div class="small">From ${who}</div>
        ${n ? `<div class="fb-item-att" data-att="${esc(x.id)}"><span class="muted small">Loading ${n} attachment${n === 1 ? '' : 's'}…</span></div>` : ''}
        <div class="fb-item-msg ${x.text ? '' : 'empty'}">${x.text ? esc(x.text) : `(no message — ${x.audioCount ? 'voice note' : 'screenshots'} only)`}</div>
        ${isClosed(x) && x.resolution ? `<div class="fb-item-res"><b>Resolution:</b> ${esc(x.resolution)}${x.closedAt ? ` <span class="muted small">(${esc(fmtDateTime(x.closedAt))})</span>` : ''}</div>` : ''}
        <div class="muted small fb-item-meta">${meta.join(' · ')}</div>
        <div class="actions">${isClosed(x) ? '<button class="btn small" data-act="reopen">↩ Reopen</button>' : '<button class="btn small primary" data-act="complete">✓ Mark complete &amp; reply</button>'}<button class="btn small" data-act="download">Download .md</button><button class="btn small danger" data-act="delete">Delete</button></div>
      </article>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-view]').forEach(a => a.onclick = e => { e.preventDefault(); view = a.dataset.view; draw(); });
    el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => act(b.dataset.act, b.closest('.fb-item').dataset.id));
    el.querySelectorAll('[data-att]').forEach(async box => {
      const atts = await loadAtts(box.dataset.att);
      box.innerHTML = atts.map((a, i) => a.kind === 'image' ? `<img src="${a.dataUrl}" alt="Screenshot ${i + 1}" title="Click to enlarge" data-lb>` : `<span class="fb-audio"><audio controls src="${a.dataUrl}" preload="metadata"></audio><span class="muted small">${formatSeconds(a.seconds)}</span></span>`).join('') || '<span class="muted small">No attachments were stored.</span>';
      box.querySelectorAll('[data-lb]').forEach(img => img.onclick = () => lightbox(img.src));
    });
  };
  const act = async (what, id) => {
    const x = items.find(i => i.id === id); if (!x) return;
    try {
      if (what === 'complete') {
        const canReply = validEmail(x.email);
        const res = prompt(`How was this feedback acted on? (saved on the ticket${canReply ? ' and pre-filled into the reply e-mail' : ''})`, x.resolution || '');
        if (res === null) return;
        const patch = {status: 'closed', resolution: res.trim().slice(0, 4000), closedAt: Date.now()};
        await store.updateFeedback(id, patch); Object.assign(x, patch); draw();
        const mail = replyMail(x, patch.resolution, store.settings().title);
        if (mail) location.href = mail.href; else toast('Ticket closed. It was anonymous, so no reply can be sent.');
      }
      if (what === 'reopen') { await store.updateFeedback(id, {status: 'reopened'}); x.status = 'reopened'; draw(); }
      if (what === 'download') {
        const md = feedbackMarkdown(x, await loadAtts(id));
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md], {type: 'text/markdown'})); a.download = `${x.ticket || x.id}.md`; a.click();
      }
      if (what === 'delete') {
        if (!confirm(`Delete feedback ${x.ticket || id} and its attachments permanently?`)) return;
        await store.deleteFeedback(id); items = items.filter(i => i.id !== id); draw();
      }
    } catch (e) { toast(e.message, 'error'); }
  };
  draw();
}
function lightbox(src) {
  let lb = document.getElementById('fb-lightbox');
  if (!lb) { lb = document.createElement('div'); lb.id = 'fb-lightbox'; lb.className = 'fb-lightbox'; lb.innerHTML = '<img alt="Screenshot, enlarged">'; document.body.append(lb); lb.onclick = () => lb.classList.remove('show'); document.addEventListener('keydown', e => { if (e.key === 'Escape') lb.classList.remove('show'); }); }
  lb.querySelector('img').src = src; lb.classList.add('show');
}
