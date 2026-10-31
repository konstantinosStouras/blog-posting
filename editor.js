// The writing surface: contenteditable + a toolbar laid out like Substack's post
// editor (undo/redo · Style · B I S <> · link image quote · lists · More). Output is
// HTML, sanitised on every change, so what the student sees is what the post page
// renders. No Markdown to learn, no external editor library.
import {sanitize, shrinkImage, esc, toast} from './util.js';

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra}</svg>`;
const ICONS = {
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  bold: '<span class="glyph" style="font-weight:800">B</span>',
  italic: '<span class="glyph" style="font-style:italic;font-family:Georgia,serif">I</span>',
  strike: '<span class="glyph" style="text-decoration:line-through">S</span>',
  code: svg('<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>'),
  image: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-5-5L5 21"/>'),
  quote: svg('<path d="M10 7H6a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2v3l3-3V9a2 2 0 0 0-1-2Z"/><path d="M20 7h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2v3l3-3V9a2 2 0 0 0-1-2Z"/>'),
  ul: svg('<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>'),
  ol: svg('<path d="M10 6h11M10 12h11M10 18h11"/><text x="2" y="8" font-size="6.5" fill="currentColor" stroke="none" font-family="system-ui">1</text><text x="2" y="14" font-size="6.5" fill="currentColor" stroke="none" font-family="system-ui">2</text><text x="2" y="20" font-size="6.5" fill="currentColor" stroke="none" font-family="system-ui">3</text>'),
  table: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M9 5v14M15 5v14"/>'),
  chevron: svg('<path d="m6 9 6 6 6-6"/>').replace('width="20" height="20"', 'width="14" height="14"'),
};
const STYLES = [['P', 'Paragraph'], ['H2', 'Heading'], ['H3', 'Subheading'], ['BLOCKQUOTE', 'Quote'], ['PRE', 'Code block']];

export function mountEditor(container, {html = '', onChange = () => {}, placeholder = 'Start writing…', extras = []} = {}) {
  container.classList.add('editor');
  const btn = (cmd, title, icon) => `<button type="button" data-cmd="${cmd}" title="${esc(title)}" aria-label="${esc(title)}">${icon}</button>`;
  const more = [['table', 'Insert a table'], ['caption', 'Caption (not counted in the word count)'], ['hr', 'Divider'], ['clear', 'Clear formatting'], ...extras.map((x, i) => ['extra:' + i, x.label])];
  container.innerHTML = `<div class="toolbar" role="toolbar" aria-label="Formatting">
      ${btn('undo', 'Undo (Ctrl+Z)', ICONS.undo)}${btn('redo', 'Redo (Ctrl+Y)', ICONS.redo)}<span class="sep"></span>
      <div class="menu-wrap"><button type="button" class="menu-btn" data-menu="style" aria-haspopup="menu" aria-expanded="false">Style ${ICONS.chevron}</button><div class="menu" role="menu" hidden>${STYLES.map(([v, l]) => `<button type="button" role="menuitem" data-style="${v}">${l}</button>`).join('')}</div></div><span class="sep"></span>
      ${btn('bold', 'Bold (Ctrl+B)', ICONS.bold)}${btn('italic', 'Italic (Ctrl+I)', ICONS.italic)}${btn('strikeThrough', 'Strikethrough', ICONS.strike)}${btn('code', 'Code', ICONS.code)}<span class="sep"></span>
      ${btn('link', 'Link (Ctrl+K)', ICONS.link)}${btn('image', 'Insert image', ICONS.image)}${btn('quote', 'Quote', ICONS.quote)}<span class="sep"></span>
      ${btn('ul', 'Bulleted list', ICONS.ul)}${btn('ol', 'Numbered list', ICONS.ol)}<span class="sep"></span>
      <div class="menu-wrap"><button type="button" class="menu-btn" data-menu="more" aria-haspopup="menu" aria-expanded="false">More ${ICONS.chevron}</button><div class="menu" role="menu" hidden>${more.map(([c, l]) => `<button type="button" role="menuitem" data-cmd="${c}">${esc(l)}</button>`).join('')}</div></div>
    </div>
  <div class="surface" contenteditable="true" spellcheck="true" data-placeholder="${esc(placeholder)}"></div>
  <input type="file" accept="image/*" hidden>`;
  const surface = container.querySelector('.surface'), file = container.querySelector('input[type=file]');
  surface.innerHTML = sanitize(html);
  const changed = () => onChange(getHTML());
  const exec = (cmd, val = null) => { surface.focus(); document.execCommand(cmd, false, val); changed(); };
  const insertHTML = h => exec('insertHTML', h);
  const closeMenus = () => container.querySelectorAll('.menu-wrap').forEach(w => { w.querySelector('.menu').hidden = true; w.querySelector('.menu-btn').setAttribute('aria-expanded', 'false'); });
  const blockOf = () => { const n = getSelection().anchorNode, el = n?.nodeType === 1 ? n : n?.parentElement; return el && surface.contains(el) ? el.closest('p,h2,h3,blockquote,pre,li') : null; };

  container.querySelector('.toolbar').addEventListener('click', e => {
    const menuBtn = e.target.closest('.menu-btn');
    if (menuBtn) { const wrap = menuBtn.parentElement, open = wrap.querySelector('.menu').hidden; closeMenus(); if (open) { wrap.querySelector('.menu').hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); } return; }
    const styleBtn = e.target.closest('[data-style]');
    if (styleBtn) { closeMenus(); exec('formatBlock', styleBtn.dataset.style); return; }
    const b = e.target.closest('button[data-cmd]'); if (!b) return;
    closeMenus();
    const c = b.dataset.cmd;
    if (c === 'quote') exec('formatBlock', blockOf()?.tagName === 'BLOCKQUOTE' ? 'P' : 'BLOCKQUOTE');
    else if (c === 'code') { const sel = String(getSelection()); if (sel) insertHTML(`<code>${esc(sel)}</code>`); else exec('formatBlock', blockOf()?.tagName === 'PRE' ? 'P' : 'PRE'); }
    else if (c === 'ul') exec('insertUnorderedList');
    else if (c === 'ol') exec('insertOrderedList');
    else if (c === 'link') { const sel = String(getSelection()); const url = prompt('Link to (paste the full URL of your source):', 'https://'); if (url && /^https?:\/\//.test(url)) { if (sel) exec('createLink', url); else insertHTML(`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`); surface.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; }); } }
    else if (c === 'image') file.click();
    else if (c === 'table') insertHTML('<table><thead><tr><th>Column 1</th><th>Column 2</th><th>Column 3</th></tr></thead><tbody><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p class="caption">Table 1: caption</p><p><br></p>');
    else if (c === 'caption') { exec('formatBlock', 'P'); const p = blockOf(); if (p?.tagName === 'P') { p.classList.toggle('caption'); changed(); } }
    else if (c === 'hr') insertHTML('<hr><p><br></p>');
    else if (c === 'clear') { exec('removeFormat'); exec('formatBlock', 'P'); }
    else if (c.startsWith('extra:')) extras[+c.slice(6)]?.run(api);
    else exec(c);
  });
  document.addEventListener('click', e => { if (!container.contains(e.target)) closeMenus(); });
  file.onchange = async () => {
    const f = file.files[0]; file.value = ''; if (!f) return;
    try { const src = await shrinkImage(f, 1200); insertHTML(`<figure><img src="${src}" alt="${esc(f.name.replace(/\.[^.]+$/, ''))}"><figcaption>Figure: describe what this shows and cite the source</figcaption></figure><p><br></p>`); }
    catch (e) { toast(e.message, 'error'); }
  };
  surface.addEventListener('paste', e => {
    e.preventDefault();
    const h = e.clipboardData.getData('text/html'), t = e.clipboardData.getData('text/plain');
    if (h) { const clean = sanitize(h).replace(/ style="[^"]*"/g, '').replace(/<(\/?)(span|font|div)[^>]*>/g, (m, s, tag) => tag === 'div' ? (s ? '</p>' : '<p>') : ''); insertHTML(clean); }
    else insertHTML(esc(t).replace(/\r?\n\r?\n/g, '</p><p>').replace(/\r?\n/g, '<br>'));
  });
  surface.addEventListener('input', changed);
  surface.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); container.querySelector('[data-cmd=link]').click(); }
    if (e.key === 'Escape') closeMenus();
  });
  if (!surface.innerHTML.trim()) surface.innerHTML = '';

  function getHTML() { return sanitize(surface.innerHTML).replace(/<p><br><\/p>\s*$/g, ''); }
  const api = {getHTML, setHTML(h) { surface.innerHTML = sanitize(h); changed(); }, focus: () => surface.focus(), insertHTML, isEmpty: () => !surface.textContent.trim() && !surface.querySelector('img,table')};
  return api;
}

// A blog's outline template (see PM_EXERCISE in seed.js) with the student's own
// organisation and category filled in. Both placeholders are optional.
export const fillOutline = (template, org = 'the organisation', category = 'the category') =>
  String(template || '').replace(/\{organisation\}/g, esc(org)).replace(/\{category\}/g, esc(category));
