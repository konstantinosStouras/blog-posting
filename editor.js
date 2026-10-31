// A small WYSIWYG editor for the compose screen: contenteditable + a toolbar.
// Output is HTML, sanitised on every change, so what the student sees is what
// the post page renders. No Markdown to learn, no external editor library.
import {sanitize, shrinkImage, esc, toast} from './util.js';

const TOOLS = [
  ['undo', '↶', 'Undo'], ['redo', '↷', 'Redo'], '|',
  ['h2', 'H2', 'Section heading'], ['h3', 'H3', 'Sub-heading'], ['p', '¶', 'Paragraph'], '|',
  ['bold', '<b>B</b>', 'Bold (Ctrl+B)'], ['italic', '<i>I</i>', 'Italic (Ctrl+I)'], ['underline', '<u>U</u>', 'Underline'], '|',
  ['link', '🔗', 'Insert a hyperlink to your source'], ['unlink', '⛓', 'Remove link'], '|',
  ['ul', '•≡', 'Bulleted list'], ['ol', '1≡', 'Numbered list'], ['quote', '❝', 'Quotation'], '|',
  ['image', '🖼', 'Insert an image (from your computer)'], ['table', '▦', 'Insert a table'], ['caption', 'cap', 'Caption (not counted in the word count)'], '|',
  ['clear', 'Tx', 'Clear formatting'],
];

export function mountEditor(container, {html = '', onChange = () => {}, placeholder = 'Start writing your post…'} = {}) {
  container.classList.add('editor');
  container.innerHTML = `<div class="toolbar" role="toolbar" aria-label="Formatting">${TOOLS.map(t => t === '|' ? '<span class="sep"></span>' : `<button type="button" data-cmd="${t[0]}" title="${esc(t[2])}" aria-label="${esc(t[2])}">${t[1]}</button>`).join('')}</div>
  <div class="surface" contenteditable="true" spellcheck="true" data-placeholder="${esc(placeholder)}"></div>
  <input type="file" accept="image/*" hidden>`;
  const surface = container.querySelector('.surface'), file = container.querySelector('input[type=file]');
  surface.innerHTML = sanitize(html);
  const changed = () => onChange(getHTML());
  const exec = (cmd, val = null) => { surface.focus(); document.execCommand(cmd, false, val); changed(); };
  const insertHTML = h => exec('insertHTML', h);

  container.querySelector('.toolbar').addEventListener('click', e => {
    const b = e.target.closest('button[data-cmd]'); if (!b) return;
    const c = b.dataset.cmd;
    if (c === 'h2' || c === 'h3' || c === 'p') exec('formatBlock', c.toUpperCase());
    else if (c === 'quote') exec('formatBlock', 'BLOCKQUOTE');
    else if (c === 'ul') exec('insertUnorderedList');
    else if (c === 'ol') exec('insertOrderedList');
    else if (c === 'link') { const sel = String(getSelection()); const url = prompt('Link to (paste the full URL of your source):', 'https://'); if (url && /^https?:\/\//.test(url)) { if (sel) exec('createLink', url); else insertHTML(`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`); surface.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; }); } }
    else if (c === 'unlink') exec('unlink');
    else if (c === 'image') file.click();
    else if (c === 'table') insertHTML('<table><thead><tr><th>Column 1</th><th>Column 2</th><th>Column 3</th></tr></thead><tbody><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p class="caption">Table 1: caption</p><p><br></p>');
    else if (c === 'caption') { exec('formatBlock', 'P'); const node = getSelection().anchorNode; const p = (node?.nodeType === 1 ? node : node?.parentElement)?.closest('p'); if (p && surface.contains(p)) { p.classList.toggle('caption'); changed(); } }
    else if (c === 'clear') exec('removeFormat');
    else exec(c);
  });
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
  surface.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); container.querySelector('[data-cmd=link]').click(); } });
  if (!surface.innerHTML.trim()) surface.innerHTML = '';

  function getHTML() { return sanitize(surface.innerHTML).replace(/<p><br><\/p>\s*$/g, ''); }
  return {getHTML, setHTML(h) { surface.innerHTML = sanitize(h); changed(); }, focus: () => surface.focus(), insertHTML};
}

// The five questions, as section headings the student fills in.
export const OUTLINE = (org = 'the organisation', trend = 'the megatrend') => `
<p><em>Introduce ${esc(org)} in a few sentences: what it does, where, and why it is worth studying in the context of ${esc(trend)}.</em></p>
<h2>Why ${esc(trend)} matters to ${esc(org)}'s management</h2><p></p>
<h2>How management will be affected</h2><p></p>
<h2>What management is doing now: the next two years and the decade ahead</h2><p></p>
<h2>What else management should do</h2><p></p>
<h2>Two questions remain open</h2><p><strong>Question 1:</strong> </p><p><strong>Question 2:</strong> </p>`;
