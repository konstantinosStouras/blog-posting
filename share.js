// Sharing a post. The Share button opens a sheet (Substack-style): the post's card, then
// Copy link · LinkedIn · Email · WhatsApp · Facebook · More, where More lists the other
// networks and a WeChat QR code. The PDF button prints the article with a print layout
// (styles.css, body.printing-post): sans-serif, the link at the top of every page, the blog
// and link at the bottom left and "page / pages" at the bottom right.
import {esc, plainText, postPath, toast} from './util.js';
import {publicUrl} from './router.js';

// The platform's owner, credited (and tagged) in the LinkedIn text when the module does not
// carry its instructor's own LinkedIn address.
const OWNER = {name: 'Kostas Stouras', linkedin: 'https://www.linkedin.com/in/stouras/'};

const I = {
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1 0l2.8-2.8a5 5 0 0 0-7.1-7.1L11 4.9"/><path d="M14 11a5 5 0 0 0-7.1 0l-2.8 2.8a5 5 0 0 0 7.1 7.1L13 19.1"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  device: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12M7 9l5-5 5 5M5 15v4h14v-4"/></svg>',
  qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM19 14h2M14 19h2M19 19h2v2"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" fill="#0866FF" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="#25D366" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>',
};
// Brand marks that are not drawn above come from Simple Icons' CDN; a missing icon leaves the label.
const brand = (slug, color) => `<img src="https://cdn.simpleicons.org/${slug}/${color}" alt="" width="20" height="20" loading="lazy" onerror="this.remove()">`;

// Letters and digits in Unicode's bold sans-serif range: the only way to bold a title in a LinkedIn post.
const boldText = s => [...String(s)].map(c => { const o = c.codePointAt(0); return o >= 65 && o <= 90 ? String.fromCodePoint(0x1D5D4 + o - 65) : o >= 97 && o <= 122 ? String.fromCodePoint(0x1D5EE + o - 97) : o >= 48 && o <= 57 ? String.fromCodePoint(0x1D7EC + o - 48) : c; }).join('');
const firstParagraph = html => {
  const t = document.createElement('template'); t.innerHTML = String(html || '');
  for (const el of t.content.querySelectorAll('p, li, blockquote')) { const s = (el.textContent || '').trim().replace(/\s+/g, ' '); if (s.length > 40) return s.length > 320 ? s.slice(0, 320).replace(/\s+\S*$/, '') + '…' : s; }
  const s = plainText(html); return s.length > 320 ? s.slice(0, 320).replace(/\s+\S*$/, '') + '…' : s;
};
const open = url => window.open(url, '_blank', 'noopener');
const enc = encodeURIComponent;

// What each network receives. The LinkedIn text: title in bold, the first paragraph, then
// "Read my blog as part of the <module> UCD module of Prof. <instructor>" with the instructor's
// LinkedIn address (LinkedIn turns it into a link; typing @ before the name turns it into a tag).
export function shareTexts(p, {module = null} = {}) {
  const url = publicUrl(postPath(p)), title = p.title || 'Untitled', para = firstParagraph(p.body);
  const moduleName = module ? [module.code, module.title].filter(Boolean).join(' ') : '';
  const teacher = module?.teacherName || OWNER.name;
  const teacherLink = module?.teacherLinkedin || (teacher.split(/\s+/).pop() === OWNER.name.split(/\s+/).pop() ? OWNER.linkedin : '');
  const credit = `Read my blog${moduleName ? ` as part of the ${moduleName} UCD module` : ''} of Prof. ${teacher}${teacherLink ? ` (${teacherLink})` : ''}`;
  return {url, title, para, credit, linkedin: `${boldText(title)}\n\n${para}\n\n${credit}\n${url}`, short: `${title}\n${url}`};
}

// A comment shares as a link straight to it (the post's address plus #c-<id>).
function commentTexts(p, c, {module = null} = {}) {
  const t = shareTexts(p, {module}), url = t.url + '#c-' + c.id;
  const para = String(c.body || '').replace(/\s+/g, ' ').trim().slice(0, 280);
  const title = `${c.authorName || 'A reader'} on “${t.title}”`;
  return {...t, url, title, para, linkedin: `${para}\n\n— ${c.authorName || 'a reader'}, commenting on ${boldText(t.title)}\n${url}`, short: `${title}\n${url}`};
}

let sheet = null;
export function openShare(p, {blog = null, module = null, comment = null} = {}) {
  const t = comment ? commentTexts(p, comment, {module}) : shareTexts(p, {module});
  if (!sheet) { sheet = document.createElement('dialog'); sheet.className = 'sheet share-sheet'; document.body.appendChild(sheet); sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); }); }
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${enc(t.url)}`;
  const card = comment
    ? `<div class="share-card share-comment"><div class="share-comment-who"><span class="avatar">${esc((comment.authorName || '?')[0].toUpperCase())}</span><b>${esc(comment.authorName)}</b><span>${new Date(comment.createdAt).toLocaleDateString('en-IE', {day: 'numeric', month: 'short', year: 'numeric'})}</span></div><p>${esc(t.para)}${String(comment.body || '').length > 280 ? '…' : ''}</p></div>`
    : `<div class="share-card">${p.featuredImage ? `<img class="share-img" src="${esc(p.featuredImage)}" alt="">` : ''}<div class="share-card-foot"><span class="share-site"><img src="favicon-32.png" alt="" width="18" height="18">${esc(blog?.title || 'UCD blog')}</span><b>${esc(t.title)}</b></div></div>`;
  sheet.innerHTML = `<div class="sheet-form"><button type="button" class="close" data-close aria-label="Close">×</button><h2>${comment ? 'Share this comment' : 'Share this post'}</h2>
    ${card}
    <div class="share-row">
      <button type="button" data-net="copy">${I.link}<span>Copy link</span></button>
      <button type="button" data-net="linkedin">${I.linkedin}<span>LinkedIn</span></button>
      <button type="button" data-net="email">${I.mail}<span>Email</span></button>
      <button type="button" data-net="whatsapp">${I.whatsapp}<span>WhatsApp</span></button>
      <button type="button" data-net="facebook">${I.facebook}<span>Facebook</span></button>
      <button type="button" data-net="more" aria-expanded="false">${I.more}<span>More</span></button>
    </div>
    ${comment ? '<p class="hint">The link opens the post at this comment.</p>' : '<p class="hint">LinkedIn opens with the title, the first paragraph and the module credit filled in. To tag your instructor, type @ before their name in the post.</p>'}
    <div class="share-more" hidden>
      ${navigator.share ? `<button type="button" data-net="device">${I.device}Share via this device…</button>` : ''}
      <button type="button" data-net="x">${I.x}X</button>
      <button type="button" data-net="bluesky">${brand('bluesky', '0285FF')}Bluesky</button>
      <button type="button" data-net="threads">${brand('threads', '000000')}Threads</button>
      <button type="button" data-net="telegram">${brand('telegram', '26A5E4')}Telegram</button>
      <button type="button" data-net="reddit">${brand('reddit', 'FF4500')}Reddit</button>
      <button type="button" data-net="wechat">${brand('wechat', '07C160')}WeChat</button>
      <button type="button" data-net="qr">${I.qr}QR code</button>
    </div>
    <div class="share-qr" hidden><img src="${qr}" alt="QR code for this post" width="220" height="220"><p>Scan to open the post. In WeChat: Discover › Scan, then share it to a chat or Moments.</p></div>
  </div>`;
  sheet.querySelector('[data-close]').onclick = () => sheet.close();
  sheet.onclick = async e => {
    if (e.target === sheet) return sheet.close();
    const b = e.target.closest('[data-net]'); if (!b) return;
    const net = b.dataset.net, more = sheet.querySelector('.share-more'), qrBox = sheet.querySelector('.share-qr');
    if (net === 'more') { more.hidden = !more.hidden; b.setAttribute('aria-expanded', String(!more.hidden)); if (more.hidden) qrBox.hidden = true; return; }
    if (net === 'wechat' || net === 'qr') { qrBox.hidden = false; qrBox.scrollIntoView({block: 'nearest'}); return; }
    if (net === 'copy') { try { await navigator.clipboard.writeText(t.url); toast('Link copied.'); } catch { prompt(comment ? 'Link to this comment' : 'Link to this post', t.url); } return; }
    if (net === 'device') { try { await navigator.share({title: t.title, text: t.short, url: t.url}); } catch {} return; }
    const go = {
      linkedin: `https://www.linkedin.com/feed/?shareActive=true&text=${enc(t.linkedin)}`,
      email: `mailto:?subject=${enc(t.title)}&body=${enc(`${t.para}\n\n${t.credit}\n${t.url}`)}`,
      whatsapp: `https://wa.me/?text=${enc(t.short)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(t.url)}`,
      x: `https://twitter.com/intent/tweet?text=${enc(t.title)}&url=${enc(t.url)}`,
      bluesky: `https://bsky.app/intent/compose?text=${enc(t.short)}`,
      threads: `https://www.threads.net/intent/post?text=${enc(t.short)}`,
      telegram: `https://t.me/share/url?url=${enc(t.url)}&text=${enc(t.title)}`,
      reddit: `https://www.reddit.com/submit?url=${enc(t.url)}&title=${enc(t.title)}`,
    }[net];
    if (go) net === 'email' ? (location.href = go) : open(go);
  };
  if (!sheet.open) sheet.showModal();
}

// The PDF: the browser's print dialog (Save as PDF) over the article alone. The page's
// running head and foot are written here because they carry the post's address.
export function printPost(p, blog) {
  const url = publicUrl(postPath(p)), site = (blog?.title || 'UCD blog').replace(/["\\]/g, '');
  const style = document.createElement('style'); style.id = 'print-page';
  style.textContent = `@page { size: A4; margin: 22mm 18mm 24mm; @top-center { content: "${url}"; font: 8.5pt -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #888; } @bottom-left { content: "${site} · ${url}"; font: 8.5pt -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #666; } @bottom-right { content: counter(page) " / " counter(pages); font: 8.5pt -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #666; } }`;
  const title = document.title; document.title = p.title || 'Post';   // the suggested file name
  document.body.classList.add('printing-post'); document.head.appendChild(style);
  const done = () => { document.body.classList.remove('printing-post'); style.remove(); document.title = title; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}
