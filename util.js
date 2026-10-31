// Small shared helpers. No framework: every view is a template string rendered into #app.
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'post';
export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
export const fmtDate = t => t ? new Date(t).toLocaleDateString('en-IE', {day: 'numeric', month: 'long', year: 'numeric'}) : '';
export const fmtDateTime = t => t ? new Date(t).toLocaleString('en-IE', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : '';
export const monthKey = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
export const monthName = k => new Date(k + '-01T00:00:00').toLocaleDateString('en-IE', {month: 'long', year: 'numeric'});
export const postPath = p => `#/${monthKey(p.publishedAt || p.createdAt).replace('-', '/')}/${p.slug}`;

// Everything a student writes is sanitised BOTH when saved and when rendered.
export function sanitize(html) {
  if (!window.DOMPurify) return esc(html);
  return DOMPurify.sanitize(String(html ?? ''), {USE_PROFILES: {html: true}, ADD_ATTR: ['target', 'rel'], FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input']});
}
export function toDom(html) { const d = document.createElement('div'); d.innerHTML = sanitize(html); return d; }
export const plainText = html => (toDom(html).textContent || '').replace(/\s+/g, ' ').trim();

// The study guide counts words EXCLUDING tables, captions, appendices and links used.
export function wordCount(html) {
  const d = toDom(html);
  d.querySelectorAll('table, figcaption, .caption, .appendix').forEach(n => n.remove());
  return (d.textContent || '').trim().split(/\s+/).filter(w => /[A-Za-z0-9Ͱ-Ͽ一-鿿]/.test(w)).length;
}
export function excerptOf(html, n = 180) {
  const t = plainText(html);
  return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t;
}
export const readingTime = words => Math.max(1, Math.round(words / 220)) + ' min read';

// Images are stored inline as resized JPEG data URLs (same approach as wearwell),
// so no Storage bucket, no extra rules and no orphaned files. ~1200px wide, under ~500KB.
export function shrinkImage(file, max = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) return reject(Error('Please choose an image file.'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let q = quality, out = c.toDataURL('image/jpeg', q);
      while (out.length > 520000 && q > 0.4) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      if (out.length > 520000) return reject(Error('That image is too large even after resizing. Please pick a smaller one.'));
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(Error('That file could not be read as an image.')); };
    img.src = url;
  });
}

export const by = (key, dir = -1) => (a, b) => ((a[key] ?? 0) > (b[key] ?? 0) ? 1 : (a[key] ?? 0) < (b[key] ?? 0) ? -1 : 0) * dir;
export const groupBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); (m[k] ||= []).push(x); return m; }, {});
export function toast(msg, kind = '') {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.append(t); }
  t.textContent = msg; t.className = 'show ' + kind;
  clearTimeout(t._h); t._h = setTimeout(() => t.className = '', 3500);
}
