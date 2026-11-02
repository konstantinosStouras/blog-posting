// The writing surface: contenteditable + a toolbar laid out like Substack's post
// editor. Output is HTML, sanitised on every change, so what the student sees is
// what the post page renders. Rich blocks (code, LaTeX, charts, polls, footnotes,
// tables) are plain HTML with their source in data attributes; blocks.js renders
// them here and on the post page.
import {sanitize, shrinkImage, esc, toast, newId} from './util.js';
import {enhance, serialize, readPoll, writePoll, LANGUAGES, langName, SYMBOL_RE, INTERVALS, tvUrl, katex, renumberFootnotes} from './blocks.js';

const svg = (d, size = 20) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const lines = (w1, w2, w3, x = 3) => svg(`<path d="M${x} 6h${w1}M${x} 12h${w2}M${x} 18h${w3}"/>`);
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
  alignLeft: lines(18, 12, 18), alignCenter: svg('<path d="M3 6h18M7 12h10M3 18h18"/>'), alignRight: svg('<path d="M3 6h18M9 12h12M3 18h18"/>'), alignJustify: lines(18, 18, 18),
  textColor: svg('<path d="M6 17 12 4l6 13M8.5 12h7"/><path d="M4 21h16" stroke="#e0352b" stroke-width="2.6"/>'),
  highlight: svg('<path d="m10 15-4 4H3l2-5 9-9 4 4-8 6Z"/><path d="M4 21h16" stroke="#f5d90a" stroke-width="2.6"/>'),
  script: svg('<path d="M4 18 14 6M4 6l10 12"/><text x="15.5" y="10" font-size="7.5" fill="currentColor" stroke="none" font-family="system-ui">2</text>'),
  chevron: svg('<path d="m6 9 6 6 6-6"/>', 14),
  codeBlock: svg('<path d="M8 4H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1M16 4h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1"/>', 16),
  divider: svg('<path d="M4 12h16"/>', 16), chart: svg('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>', 16), footnote: svg('<path d="M12 3v6M8 5l8 4M16 5l-8 4"/>', 16),
  latex: svg('<path d="M18 5H6l6 7-6 7h12"/>', 16), poll: svg('<path d="M5 20V10M12 20V4M19 20v-6"/>', 16), table: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M9 5v14M15 5v14"/>', 16),
  caption: svg('<path d="M4 7h16M8 12h8M10 17h4"/>', 16), clear: svg('<path d="M4 20h16M6 16 15 7l3 3-9 9H6Z"/>', 16), outline: svg('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>', 16),
};
const STYLES = [['P', 'Normal text', '<span class="mi-t">¶</span>'], ['H2', 'Heading 1', '<span class="mi-t">H1</span>'], ['H3', 'Heading 2', '<span class="mi-t">H2</span>'], ['H4', 'Heading 3', '<span class="mi-t">H3</span>'], ['H5', 'Heading 4', '<span class="mi-t">H4</span>']];
const COLORS = [['default', 'Default', '#363737'], ['#e0352b', 'Red'], ['#f28c28', 'Orange'], ['#1f8f4e', 'Green'], ['#1f5fd1', 'Blue'], ['#7b3fe4', 'Purple'], ['#7a7a7a', 'Grey']];
const HILITES = [['none', 'No highlight', '#fff'], ['#fff176', 'Yellow'], ['#b9f6ca', 'Green'], ['#b3e5fc', 'Blue'], ['#ffd8b1', 'Orange'], ['#f8bbd0', 'Pink']];
const SCRIPTS = [['script:normal', 'Normal'], ['superscript', 'Superscript', '<span class="mi-t">x²</span>'], ['subscript', 'Subscript', '<span class="mi-t">x₂</span>']];
const QUOTES = [['blockquote', 'Block quote'], ['pullquote', 'Pull quote'], ['callout', 'Callout block']];
const ALIGNS = [['justifyLeft', 'Left', 'alignLeft'], ['justifyCenter', 'Center', 'alignCenter'], ['justifyRight', 'Right', 'alignRight'], ['justifyFull', 'Justify', 'alignJustify']];
const DURATIONS = [[1, '1 day'], [3, '3 days'], [7, '1 week'], [14, '2 weeks'], [30, '1 month'], [0, 'No time limit']];
const BLOCK_SEL = 'p,h1,h2,h3,h4,h5,h6,blockquote,pre,li,aside,div.math,div.tv-chart,div.poll,figure,table';

document.addEventListener('click', e => { for (const c of document.querySelectorAll('.editor')) if (!c.contains(e.target)) c.closeMenus?.(); });

export function mountEditor(container, {html = '', onChange = () => {}, placeholder = 'Start writing…', extras = []} = {}) {
  container.classList.add('editor');
  const btn = (cmd, title, icon) => `<button type="button" data-cmd="${cmd}" title="${esc(title)}" aria-label="${esc(title)}">${icon}</button>`;
  const menu = (id, label, items, cls = '') => `<div class="menu-wrap"><button type="button" class="menu-btn ${cls}" data-menu="${id}" aria-haspopup="menu" aria-expanded="false" title="${esc({align: 'Alignment', quote: 'Quote', color: 'Text colour', hilite: 'Highlight', script: 'Superscript & subscript'}[id] || id[0].toUpperCase() + id.slice(1))}">${label} ${ICONS.chevron}</button><div class="menu" role="menu" hidden>${items.map(([cmd, text, icon]) => `<button type="button" role="menuitem" data-cmd="${cmd}">${icon ? `<span class="mi">${ICONS[icon] || icon}</span>` : ''}${esc(text)}</button>`).join('')}</div></div>`;
  const more = [['codeblock', 'Code block', 'codeBlock'], ['hr', 'Divider', 'divider'], ['chart', 'Financial chart', 'chart'], ['footnote', 'Footnote', 'footnote'], ['latex', 'LaTeX', 'latex'], ['poll', 'Poll', 'poll'], ['caption', 'Caption / legend', 'caption'], ['clear', 'Clear formatting', 'clear'], ...extras.map((x, i) => ['extra:' + i, x.label, 'outline'])];
  container.innerHTML = `<div class="toolbar" role="toolbar" aria-label="Formatting">
      ${btn('undo', 'Undo (Ctrl+Z)', ICONS.undo)}${btn('redo', 'Redo (Ctrl+Y)', ICONS.redo)}<span class="sep"></span>
      ${menu('style', 'Style', STYLES.map(([v, l, i]) => ['style:' + v, l, i]))}<span class="sep"></span>
      ${btn('bold', 'Bold (Ctrl+B)', ICONS.bold)}${btn('italic', 'Italic (Ctrl+I)', ICONS.italic)}${btn('strikeThrough', 'Strikethrough', ICONS.strike)}${btn('code', 'Code', ICONS.code)}${menu('color', ICONS.textColor, COLORS.map(([v, l, c]) => ['color:' + v, l, `<span class="dot" style="background:${c || v}"></span>`]), 'icon-only')}${menu('hilite', ICONS.highlight, HILITES.map(([v, l, c]) => ['hilite:' + v, l, `<span class="dot" style="background:${c || v};border-color:#ccc"></span>`]), 'icon-only')}${menu('script', ICONS.script, SCRIPTS, 'icon-only')}<span class="sep"></span>
      <div class="menu-wrap">${btn('link', 'Link (Ctrl+K)', ICONS.link)}<div class="link-pop" hidden><b>Create a link</b><input class="lk-text" placeholder="Enter text…" maxlength="200"><input class="lk-url" placeholder="Enter URL…" type="url" maxlength="2000"><div class="actions"><button type="button" class="btn accent small" data-link-ok>Link</button><button type="button" class="btn small" data-link-cancel>Cancel</button><button type="button" class="linkish danger small" data-link-remove hidden>Remove link</button></div></div></div>
      ${btn('image', 'Insert image', ICONS.image)}${menu('quote', ICONS.quote, QUOTES.map(([v, l]) => ['quote:' + v, l]), 'icon-only')}<span class="sep"></span>
      ${btn('insertUnorderedList', 'Bulleted list', ICONS.ul)}${btn('insertOrderedList', 'Numbered list', ICONS.ol)}${menu('align', ICONS.alignLeft, ALIGNS.map(([v, l, i]) => [v, l, i]), 'icon-only')}<span class="sep"></span>
      ${menu('more', 'More', more)}
    </div>
  <div class="surface" contenteditable="true" spellcheck="true" data-placeholder="${esc(placeholder)}"></div>
  <input type="file" accept="image/*" hidden>`;
  const surface = container.querySelector('.surface'), file = container.querySelector('input[type=file]'), toolbar = container.querySelector('.toolbar');
  const pinFootnotes = () => { const n = surface.querySelector('section.footnotes'); if (n && n !== surface.lastElementChild) surface.append(n); };
  const changed = () => { pinFootnotes(); onChange(getHTML()); };
  const exec = (cmd, val = null) => { surface.focus(); document.execCommand(cmd, false, val); changed(); };
  const insertHTML = h => { exec('insertHTML', h); enhance(surface, {editor: true}).then(changed); };
  const closeMenus = () => container.querySelectorAll('.menu-wrap').forEach(w => { const m = w.querySelector('.menu, .link-pop'); if (m) m.hidden = true; w.querySelector('.menu-btn')?.setAttribute('aria-expanded', 'false'); });
  const sel = () => getSelection();
  const nodeEl = n => n ? (n.nodeType === 1 ? n : n.parentElement) : null;
  const blockOf = () => { const el = nodeEl(sel().anchorNode); return el && surface.contains(el) && el !== surface ? el.closest(BLOCK_SEL) : null; };
  const inside = (selector) => { const el = nodeEl(sel().anchorNode); return el && surface.contains(el) ? el.closest(selector) : null; };
  let savedRange = null;
  const saveRange = () => { const s = sel(); if (s.rangeCount && surface.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); };
  const restoreRange = () => { if (savedRange) { const s = sel(); s.removeAllRanges(); s.addRange(savedRange); } surface.focus(); };
  const placeCaret = (el, atEnd = false) => { const r = document.createRange(); r.selectNodeContents(el); r.collapse(!atEnd); const s = sel(); s.removeAllRanges(); s.addRange(r); };
  const insertBlockAfterCurrent = (node) => {
    // Widgets go between blocks, never inside a paragraph; a fresh paragraph follows.
    let b = blockOf(); while (b && b.parentElement !== surface) b = b.parentElement.closest(BLOCK_SEL) || b.parentElement;
    const after = document.createElement('p'); after.innerHTML = '<br>';
    const notes = surface.querySelector('section.footnotes');
    if (b && (b === notes || notes?.contains(b))) { notes.before(node, after); placeCaret(after); return node; }
    if (b && b.parentElement === surface) { b.after(node, after); if (!b.textContent.trim() && !b.querySelector('img,table,.math,.tv-chart,.poll') && b.tagName === 'P') b.remove(); }
    else surface.append(node, after);
    placeCaret(after); return node;
  };
  surface.innerHTML = sanitize(html);
  try { document.execCommand('styleWithCSS', false, true); document.execCommand('defaultParagraphSeparator', false, 'p'); } catch {}
  const ensureParagraph = () => { if (!surface.firstElementChild && !surface.textContent.trim()) { surface.innerHTML = '<p><br></p>'; placeCaret(surface.firstElementChild); } };
  pinFootnotes(); enhance(surface, {editor: true});

  // ---------- toolbar ----------
  toolbar.addEventListener('mousedown', e => { if (e.target.closest('button') && !e.target.closest('.link-pop')) e.preventDefault(); });   // keep the text selection
  toolbar.addEventListener('click', e => {
    const menuBtn = e.target.closest('.menu-btn');
    if (menuBtn) { const wrap = menuBtn.parentElement, m = wrap.querySelector('.menu'), open = m.hidden; closeMenus(); if (open) { m.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); } return; }
    if (e.target.closest('.link-pop')) return;
    const b = e.target.closest('button[data-cmd]'); if (!b) return;
    closeMenus();
    run(b.dataset.cmd);
  });
  container.closeMenus = closeMenus;   // the module-level listener below closes menus on outside clicks
  function run(c) {
    if (c.startsWith('style:')) { exec('formatBlock', c.slice(6)); return; }
    if (c.startsWith('color:')) { const v = c.slice(6); exec('foreColor', v === 'default' ? 'inherit' : v); return; }
    if (c.startsWith('hilite:')) { const v = c.slice(7); exec('hiliteColor', v === 'none' ? 'transparent' : v); return; }
    if (c === 'script:normal') { if (document.queryCommandState('superscript')) exec('superscript'); if (document.queryCommandState('subscript')) exec('subscript'); return; }
    if (c.startsWith('quote:')) { quote(c.slice(6)); return; }
    if (c.startsWith('extra:')) { extras[+c.slice(6)]?.run(api); return; }
    switch (c) {
      case 'code': { const t = String(sel()); if (t) insertHTML(`<code>${esc(t)}</code>`); else exec('formatBlock', blockOf()?.tagName === 'PRE' ? 'P' : 'PRE'); break; }
      case 'link': openLinkPop(); break;
      case 'image': file.click(); break;
      case 'codeblock': { const pre = document.createElement('pre'); pre.dataset.lang = 'auto'; pre.innerHTML = '<code>\n</code>'; insertBlockAfterCurrent(pre); enhance(surface, {editor: true}).then(() => { placeCaret(pre.querySelector('code')); changed(); }); break; }
      case 'hr': insertHTML('<hr><p><br></p>'); break;
      case 'chart': chartDialog(); break;
      case 'footnote': footnote(); break;
      case 'latex': { const el = document.createElement('div'); el.className = 'math'; el.dataset.tex = ''; insertBlockAfterCurrent(el); enhance(surface, {editor: true}).then(() => { changed(); latexDialog(el, true); }); break; }
      case 'poll': { const el = document.createElement('div'); el.className = 'poll'; el.dataset.poll = writePoll({id: newId(), q: 'New poll', options: ['Option 1', 'Option 2'], days: 7, hide: false}); insertBlockAfterCurrent(el); enhance(surface, {editor: true}).then(() => { changed(); pollDialog(el, true); }); break; }
      case 'caption': {
        const fig = inside('figure') || blockOf()?.previousElementSibling?.closest?.('figure');
        if (fig) { let cap = fig.querySelector('figcaption'); if (!cap) { cap = document.createElement('figcaption'); cap.textContent = 'Figure: describe what this shows and cite the source'; fig.append(cap); } placeCaret(cap, true); const r = document.createRange(); r.selectNodeContents(cap); const ss = sel(); ss.removeAllRanges(); ss.addRange(r); changed(); break; }
        exec('formatBlock', 'P'); const p = blockOf(); if (p?.tagName === 'P') { p.classList.toggle('caption'); changed(); } break; }
      case 'clear': { exec('removeFormat'); const as = inside('aside.callout'); if (as) as.replaceWith(...as.childNodes); const bq = inside('blockquote'); if (bq) unwrapQuote(bq); else exec('formatBlock', 'P'); break; }
      case 'justifyLeft': case 'justifyCenter': case 'justifyRight': case 'justifyFull': exec(c); break;
      default: exec(c);
    }
  }
  // Quotes: block quote (bar), pull quote (centred italic), callout (grey card).
  // Chrome's formatBlock P is a no-op inside a blockquote, so switching a quote off unwraps it explicitly.
  function unwrapQuote(bq) {
    const blocks = [...bq.children].filter(n => /^(P|H[1-6]|UL|OL|PRE|DIV|FIGURE|TABLE)$/.test(n.tagName));
    if (!blocks.length) { const p = document.createElement('p'); p.append(...bq.childNodes); bq.replaceWith(p); placeCaret(p, true); }
    else { bq.replaceWith(...bq.childNodes); placeCaret(blocks[blocks.length - 1], true); }
    changed();
  }
  function quote(kind) {
    const cur = blockOf(); if (!cur) { exec('formatBlock', 'BLOCKQUOTE'); return; }
    const aside = cur.closest('aside.callout'), bq = cur.closest('blockquote');
    if (aside) { aside.replaceWith(...aside.childNodes); }
    if (bq && kind !== 'callout') {
      const wasPull = bq.classList.contains('pull');
      if (kind === 'blockquote') { if (wasPull) { bq.classList.remove('pull'); bq.removeAttribute('class'); delete bq.dataset.was; changed(); } else unwrapQuote(bq); return; }   // pull → plain, plain → off
      if (kind === 'pullquote') { if (wasPull) unwrapQuote(bq); else { bq.classList.add('pull'); bq.dataset.was = 'pull'; changed(); } return; }
    }
    if (kind === 'blockquote') { exec('formatBlock', 'BLOCKQUOTE'); blockOf()?.closest('blockquote')?.classList.remove('pull'); changed(); return; }
    if (kind === 'pullquote') { exec('formatBlock', 'BLOCKQUOTE'); const b = blockOf()?.closest('blockquote'); if (b) { b.classList.add('pull'); b.dataset.was = 'pull'; } changed(); return; }
    if (kind === 'callout') { if (aside) { changed(); return; } const target = cur.closest('blockquote') || cur; const a = document.createElement('aside'); a.className = 'callout'; target.replaceWith(a); a.append(target.tagName === 'BLOCKQUOTE' ? target : target); if (target.tagName === 'BLOCKQUOTE') { const p = document.createElement('p'); p.innerHTML = target.innerHTML; target.replaceWith(p); } placeCaret(a, true); changed(); }
  }
  // ---------- link popover ----------
  const pop = container.querySelector('.link-pop'), lkText = pop.querySelector('.lk-text'), lkUrl = pop.querySelector('.lk-url');
  function openLinkPop() {
    saveRange(); const a = inside('a');
    lkText.value = a ? a.textContent : String(sel()); lkUrl.value = a ? a.href : 'https://';
    pop.querySelector('[data-link-remove]').hidden = !a;
    pop.hidden = false; (lkText.value ? lkUrl : lkText).focus();
  }
  pop.querySelector('[data-link-cancel]').onclick = () => { pop.hidden = true; restoreRange(); };
  pop.querySelector('[data-link-remove]').onclick = () => { pop.hidden = true; restoreRange(); const a = inside('a'); if (a) { a.replaceWith(...a.childNodes); changed(); } };
  pop.querySelector('[data-link-ok]').onclick = applyLink;
  pop.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } if (e.key === 'Escape') { pop.hidden = true; restoreRange(); } });
  function applyLink() {
    let url = lkUrl.value.trim(); const text = lkText.value.trim();
    if (!/^https?:\/\//i.test(url)) { if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(url)) url = 'https://' + url; else { toast('Enter a full URL starting with https://', 'error'); lkUrl.focus(); return; } }
    pop.hidden = true; restoreRange();
    const a = inside('a');
    if (a) { a.href = url; if (text) a.textContent = text; a.target = '_blank'; a.rel = 'noopener'; changed(); return; }
    if (String(sel()) && (!text || text === String(sel()))) exec('createLink', url); else insertHTML(`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text || url)}</a>`);
    surface.querySelectorAll('a').forEach(x => { x.target = '_blank'; x.rel = 'noopener'; }); changed();
  }
  // ---------- footnotes ----------
  function footnote() {
    let section = surface.querySelector('section.footnotes');
    if (!section) { section = document.createElement('section'); section.className = 'footnotes'; section.innerHTML = '<hr><ol></ol>'; surface.append(section); }
    const n = surface.querySelectorAll('sup.fn').length + 1, before = new Set(surface.querySelectorAll('sup.fn a'));
    insertHTML(`<sup class="fn"><a href="#fn-${n}" id="fnref-${n}">${n}</a></sup>&nbsp;`);
    const li = document.createElement('li'); li.id = `fn-${n}`; li.textContent = 'Footnote text';
    // The input event has already renumbered the markers, so the new one is found by identity, not id: a note
    // inserted before existing markers takes the matching place in the list.
    const ol = section.querySelector('ol'), at = [...surface.querySelectorAll('sup.fn a')].findIndex(a => !before.has(a));
    ol.insertBefore(li, at >= 0 ? ol.children[at] || null : null);
    renumberFootnotes(surface, true); changed();
    const r = document.createRange(); r.selectNodeContents(li); const s = sel(); s.removeAllRanges(); s.addRange(r); li.scrollIntoView({block: 'center', behavior: 'smooth'});
  }
  // ---------- dialogs ----------
  function dialog(html, cls = '') {
    const d = document.createElement('dialog'); d.className = 'sheet small ' + cls; d.innerHTML = `<form method="dialog" class="sheet-form">${html}</form>`; document.body.append(d);
    const close = d.close.bind(d); d.onClosed = []; d.close = () => { if (d.open) close(); d.remove(); surface.focus(); const fns = d.onClosed.splice(0); fns.forEach(f => f()); };
    d.addEventListener('close', () => d.close());
    d.querySelector('form').addEventListener('submit', e => e.preventDefault());   // Enter in a lone text field would otherwise close the dialog without inserting
    d.querySelector('[value=cancel]')?.addEventListener('click', () => d.close());
    d.showModal(); return d;
  }
  const dialogFoot = (ok, remove = false) => `<div class="actions sheet-actions"><button type="button" class="btn accent" data-ok>${ok}</button><button type="button" class="btn" value="cancel">Cancel</button>${remove ? '<button type="button" class="linkish danger" data-remove>Remove</button>' : ''}</div>`;
  function removeWidget(el) { el.remove(); changed(); }

  function latexDialog(el, fresh = false) {
    let kept = false;
    const d = dialog(`<h2>Add LaTeX</h2><textarea class="tex-src" rows="5" placeholder="e.g. \\frac{a}{b} = \\sum_{i=1}^n x_i" spellcheck="false">${esc(el.dataset.tex || '')}</textarea><div class="tex-preview"><span class="muted small">Preview</span></div>${dialogFoot('Save', true)}`);
    const src = d.querySelector('.tex-src'), pv = d.querySelector('.tex-preview');
    const render = async () => { const K = await katex().catch(() => null); if (!K) { pv.textContent = src.value; return; } pv.innerHTML = ''; try { K.render(src.value || '\\text{…}', pv, {displayMode: true, throwOnError: false}); } catch { pv.textContent = src.value; } };
    src.addEventListener('input', render); render(); src.focus();
    d.querySelector('[data-ok]').onclick = () => { kept = true; el.dataset.tex = src.value.trim(); d.close(); enhance(surface, {editor: true}).then(changed); };
    d.querySelector('[data-remove]').onclick = () => { d.close(); removeWidget(el); };
    d.onClosed.push(() => { if (fresh && !kept && el.isConnected) removeWidget(el); });
  }
  function pollDialog(el, fresh = false) {
    let kept = false;
    const p = readPoll(el);
    const d = dialog(`<h2>Edit poll</h2><label class="field">Poll question<input class="poll-q" maxlength="300" placeholder="Enter your question…" value="${esc(p.q === 'New poll' ? '' : p.q)}"></label>
      <div class="field"><span>Poll options</span><div class="poll-opts">${(p.options.length ? p.options : ['', '']).map((o, i) => `<input maxlength="120" placeholder="Option ${i + 1}" value="${esc(o)}">`).join('')}</div><button type="button" class="linkish small" data-add-opt>+ Add option</button></div>
      <label class="field">Poll duration<select class="poll-days">${DURATIONS.map(([v, l]) => `<option value="${v}" ${p.days === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" class="poll-hide" ${p.hide ? 'checked' : ''}> Hide the total vote count from readers</label>${dialogFoot('Save', true)}`);
    const opts = d.querySelector('.poll-opts');
    d.querySelector('[data-add-opt]').onclick = () => { if (opts.children.length >= 10) return; const i = document.createElement('input'); i.maxLength = 120; i.placeholder = `Option ${opts.children.length + 1}`; opts.append(i); i.focus(); };
    d.querySelector('.poll-q').focus();
    d.querySelector('[data-ok]').onclick = () => {
      const q = d.querySelector('.poll-q').value.trim(), options = [...opts.querySelectorAll('input')].map(i => i.value.trim()).filter(Boolean);
      if (!q) return toast('Enter the poll question.', 'error'); if (options.length < 2) return toast('Give the poll at least two options.', 'error');
      kept = true; el.dataset.poll = writePoll({id: p.id, q, options, days: +d.querySelector('.poll-days').value, hide: d.querySelector('.poll-hide').checked});
      d.close(); enhance(surface, {editor: true}).then(changed);
    };
    d.querySelector('[data-remove]').onclick = () => { d.close(); removeWidget(el); };
    d.onClosed.push(() => { if (fresh && !kept && el.isConnected) removeWidget(el); });
  }
  function chartDialog(el = null) {
    const cur = el ? {symbol: el.dataset.symbol || 'AAPL', interval: el.dataset.interval || 'D'} : {symbol: 'AAPL', interval: 'D'};
    const d = dialog(`<h2>Financial chart</h2><p class="muted small">Live prices from TradingView. Enter a ticker (AAPL, MSFT, RYA, VOW3) or an exchange-qualified symbol (NASDAQ:AAPL, LSE:SHEL, ISEQ:RYA, FX:EURUSD, BITSTAMP:BTCUSD).</p>
      <div class="two-col"><label class="field">Symbol<input class="tv-symbol" maxlength="31" value="${esc(cur.symbol)}" placeholder="e.g. NASDAQ:AAPL"></label><label class="field">Interval<select class="tv-interval">${INTERVALS.map(([v, l]) => `<option value="${v}" ${cur.interval === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="tv-preview"><iframe title="Chart preview" src="${tvUrl(cur.symbol, cur.interval)}" frameborder="0"></iframe></div>${dialogFoot(el ? 'Save' : 'Insert', !!el)}`, 'wide');
    const sym = d.querySelector('.tv-symbol'), iv = d.querySelector('.tv-interval'), frame = d.querySelector('iframe');
    let t; const refresh = () => { clearTimeout(t); t = setTimeout(() => { const s = sym.value.trim().toUpperCase(); if (SYMBOL_RE.test(s)) frame.src = tvUrl(s, iv.value); }, 600); };
    sym.addEventListener('input', refresh); iv.addEventListener('change', refresh);
    d.querySelector('[data-ok]').onclick = () => {
      const s = sym.value.trim().toUpperCase(); if (!SYMBOL_RE.test(s)) return toast('Enter a symbol such as AAPL or NASDAQ:AAPL.', 'error');
      const node = el || document.createElement('div'); node.className = 'tv-chart'; node.dataset.symbol = s; node.dataset.interval = iv.value;
      d.close(); if (!el) insertBlockAfterCurrent(node); enhance(surface, {editor: true}).then(changed);
    };
    d.querySelector('[data-remove]')?.addEventListener('click', () => { d.close(); removeWidget(el); });
  }
  // ---------- widgets inside the surface ----------
  surface.addEventListener('click', e => {
    const pre = e.target.closest('.lang-tag');
    if (pre) { langMenu(pre.closest('pre'), pre); return; }
    const math = e.target.closest('.math'); if (math) { latexDialog(math); return; }
    const pollBtn = e.target.closest('[data-edit-poll]') || e.target.closest('.poll'); if (pollBtn) { pollDialog(e.target.closest('.poll')); return; }
    const chart = e.target.closest('.tv-chart'); if (chart && !e.target.closest('iframe')) { chartDialog(chart); }
  });
  function langMenu(pre, anchor) {
    document.querySelector('.lang-menu')?.remove();
    const m = document.createElement('div'); m.className = 'menu lang-menu'; m.innerHTML = LANGUAGES.map(([v, l]) => `<button type="button" data-lang="${v}">${l}${(pre.dataset.lang || 'auto') === v ? ' ✓' : ''}</button>`).join('') + '<button type="button" class="danger" data-lang="__remove">Remove code block</button>';
    const r = anchor.getBoundingClientRect(); m.style.position = 'fixed'; m.style.top = (r.bottom + 4) + 'px'; m.style.left = r.left + 'px'; m.style.maxHeight = '320px'; m.style.overflowY = 'auto'; m.style.zIndex = 60;
    document.body.append(m);
    m.onclick = e => { const b = e.target.closest('[data-lang]'); if (!b) return; m.remove(); if (b.dataset.lang === '__remove') { pre.remove(); changed(); return; } pre.dataset.lang = b.dataset.lang; enhance(surface, {editor: true}).then(changed); };
    setTimeout(() => document.addEventListener('click', function off(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', off); } }), 0);
  }
  // One path for every way an image can arrive: the toolbar picker, Ctrl+V of a screenshot, or a file dragged onto the post.
  async function insertImageFile(f) {
    try { const src = await shrinkImage(f, 1200); const name = /^image\.(png|jpe?g|gif|webp)$/i.test(f.name) ? '' : f.name.replace(/\.[^.]+$/, ''); const fig = document.createElement('figure'); fig.innerHTML = `<img src="${src}" alt="${esc(name)}"><figcaption>Figure: describe what this shows and cite the source</figcaption>`; insertBlockAfterCurrent(fig); const cap = fig.querySelector('figcaption'); const r = document.createRange(); r.selectNodeContents(cap); const ss = sel(); ss.removeAllRanges(); ss.addRange(r); changed(); }
    catch (e) { toast(e.message, 'error'); }
  }
  const imageFiles = dt => [...(dt?.files || [])].filter(f => /^image\//.test(f.type));
  file.onchange = () => { const f = file.files[0]; file.value = ''; if (f) insertImageFile(f); };
  surface.addEventListener('paste', e => {
    e.preventDefault();
    // A screenshot on the clipboard (Ctrl+V after Win+Shift+S, Snipping Tool, a copied image) comes as a file, not text.
    const imgs = imageFiles(e.clipboardData); if (imgs.length) { surface.focus(); (async () => { for (const f of imgs) await insertImageFile(f); })(); return; }
    const h = e.clipboardData.getData('text/html'), t = e.clipboardData.getData('text/plain');
    if (inside('pre')) { exec('insertText', t); return; }
    if (h) {
      // Google Docs wraps the clipboard in <b style="font-weight:normal"> and expresses bold and italic as span styles:
      // keep real emphasis as <strong>/<em>, drop the wrapper and every other style.
      const t = document.createElement('template'); t.innerHTML = sanitize(h);
      t.content.querySelectorAll('b[id^="docs-internal-guid"]').forEach(b => b.replaceWith(...b.childNodes));
      for (const el of t.content.querySelectorAll('span,font,b,i')) {
        const st = el.style, wrap = tag => { const x = document.createElement(tag); x.append(...el.childNodes); el.append(x); };
        if (/^(bold|bolder|[6-9]00)$/.test(st.fontWeight) || (el.tagName === 'B' && !/^(normal|lighter|[1-5]00)$/.test(st.fontWeight))) wrap('strong');
        if (st.fontStyle === 'italic' || el.tagName === 'I') wrap('em');
        if (/underline/.test(st.textDecoration)) wrap('u'); if (/line-through/.test(st.textDecoration)) wrap('s');
        el.replaceWith(...el.childNodes);
      }
      const clean = t.innerHTML.replace(/ style="[^"]*"/g, '').replace(/<(\/?)div[^>]*>/g, (m, s) => s ? '</p>' : '<p>'); insertHTML(clean);
    }
    else { const paras = t.split(/\r?\n\r?\n/).map(x => esc(x).replace(/\r?\n/g, '<br>')).filter(Boolean); insertHTML(paras.length > 1 ? '<p>' + paras.join('</p><p>') + '</p>' : paras[0] || ''); }
  });
  surface.addEventListener('dragover', e => { if (imageFiles(e.dataTransfer).length || [...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  surface.addEventListener('drop', e => {
    const imgs = imageFiles(e.dataTransfer); if (!imgs.length) return;
    e.preventDefault(); surface.focus();
    try { const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null; if (r) { const ss = sel(); ss.removeAllRanges(); ss.addRange(r); } } catch {}
    (async () => { for (const f of imgs) await insertImageFile(f); })();
  });
  surface.addEventListener('focus', ensureParagraph);
  surface.addEventListener('input', () => { if (!surface.firstElementChild && surface.textContent) { document.execCommand('formatBlock', false, 'P'); } renumberFootnotes(surface, true); changed(); });
  surface.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openLinkPop(); }
    if (e.key === 'Escape') closeMenus();
    if (e.key === 'Enter' && inside('pre') && !e.shiftKey) { e.preventDefault(); document.execCommand('insertText', false, '\n'); }
    if (e.key === 'Enter' && !e.shiftKey) { const cap = inside('figcaption'); if (cap) { e.preventDefault(); const p = document.createElement('p'); p.innerHTML = '<br>'; (cap.closest('figure') || cap).after(p); placeCaret(p); changed(); } }   // Enter leaves the caption instead of adding a second one
    if ((e.key === 'Backspace' || e.key === 'Delete') && sel().isCollapsed) {
      const b = blockOf(); const prev = e.key === 'Backspace' ? b?.previousElementSibling : b?.nextElementSibling;
      if (b && prev && prev.matches('.math,.tv-chart,.poll,figure')) {
        // Only when the caret touches the block boundary: the browser would otherwise merge the paragraph into the widget and delete it.
        let atEdge = !b.textContent.trim();
        if (!atEdge) try { const r = sel().getRangeAt(0), probe = document.createRange(); probe.selectNodeContents(b); if (e.key === 'Backspace') probe.setEnd(r.startContainer, r.startOffset); else probe.setStart(r.endContainer, r.endOffset); atEdge = !probe.toString().trim().length; } catch { atEdge = false; }
        if (atEdge) { e.preventDefault(); if (confirm('Remove this block?')) { prev.remove(); changed(); } }
      }
    }
  });
  if (!surface.innerHTML.trim()) surface.innerHTML = '';

  function getHTML() { return sanitize(serialize(surface)).replace(/<p><br><\/p>\s*$/g, ''); }
  const api = {getHTML, setHTML(h) { surface.innerHTML = sanitize(h); enhance(surface, {editor: true}).then(changed); }, focus: () => surface.focus(), insertHTML, isEmpty: () => !surface.textContent.trim() && !surface.querySelector('img,table,.math,.tv-chart,.poll'),
    // Appends at the end of the post (the outline), whereas insertHTML goes where the caret is.
    appendHTML(h) { if (api.isEmpty()) surface.innerHTML = ''; const t = document.createElement('template'); t.innerHTML = sanitize(h); const nodes = [...t.content.childNodes], notes = surface.querySelector('section.footnotes'); notes ? notes.before(...nodes) : surface.append(...nodes); const last = nodes.filter(n => n.nodeType === 1).pop(); if (last) placeCaret(last, true); enhance(surface, {editor: true}).then(changed); }};
  return api;
}

// A blog's outline template (see PM_EXERCISE in seed.js) with the student's own
// organisation and category filled in. Both placeholders are optional.
export const fillOutline = (template, org = 'the organisation', category = 'the category') =>
  String(template || '').replace(/\{organisation\}/g, esc(org)).replace(/\{category\}/g, esc(category));
