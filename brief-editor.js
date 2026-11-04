// The brief, edited in a sheet: the post editor's toolbar and writing surface
// (editor.js) in a dialog, so an instructor writes the brief as a student writes a
// post, with headings, lists, links, tables and images, and never sees its HTML.
// The same sheet serves Blog settings (where Save hands the HTML back to the form)
// and The brief page (where Save writes it to the blog at once).
import {mountEditor} from './editor.js';
import {esc, sanitize} from './util.js';

// The limit in firestore.rules (str('brief', 60000)): an image pasted into the brief is
// stored inside it as a data URL, so a few images reach it quickly.
export const BRIEF_MAX = 60000;

export const briefTooLong = html => String(html || '').length > BRIEF_MAX
  ? `The brief is too long for the blog (${Math.round(String(html).length / 1000)},000 of ${BRIEF_MAX / 1000},000 characters). Images are stored inside it, so remove an image or link to it instead.`
  : '';

// Opens the sheet over the page with the brief's HTML; `save(html)` is awaited with the
// edited HTML when the main button (`action`) is clicked (it may throw, and its message is
// shown in the sheet). Resolves once the sheet closes, true if the brief was handed to save.
export function editBrief({html = '', title = 'The brief', blogTitle = '', action = 'Save the brief', note = 'Shown to the blog’s members on “The brief” and linked from the editor.', save}) {
  return new Promise(resolve => {
    document.getElementById('brief-sheet')?.remove();
    const dialog = document.createElement('dialog'); dialog.className = 'sheet wide brief-sheet'; dialog.id = 'brief-sheet';
    dialog.innerHTML = `<form method="dialog" class="sheet-form" onsubmit="return false"><button type="button" class="close" data-close aria-label="Close">×</button>
      <h2>${esc(title)}</h2><p class="muted small">${esc(blogTitle)}${blogTitle ? ' · ' : ''}${esc(note)}</p>
      <div class="brief-editor" id="brief-editor"></div>
      <div class="actions sheet-actions"><button type="button" class="btn primary" id="brief-save">${esc(action)}</button><button type="button" class="btn ghost" data-close>Cancel</button><span class="status-line" id="brief-status" aria-live="polite"></span></div></form>`;
    document.body.append(dialog);
    let saved = false, dirty = false, busy = false;
    const api = mountEditor(dialog.querySelector('#brief-editor'), {html: sanitize(html), placeholder: 'Write the brief…', onChange: () => { dirty = true; }});
    const status = dialog.querySelector('#brief-status'), saveBtn = dialog.querySelector('#brief-save');
    const close = () => { if (dialog.open) dialog.close(); };
    dialog.addEventListener('close', () => { dialog.remove(); resolve(saved); });
    dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });   // Escape while saving
    dialog.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { if (busy) return; if (!dirty || confirm('Discard your changes to the brief?')) close(); });
    saveBtn.onclick = async () => {
      if (busy) return;
      const out = api.getHTML(), problem = briefTooLong(out);
      if (problem) { status.textContent = problem; return; }
      busy = true; saveBtn.disabled = true; status.textContent = '';
      try { await save(out); saved = true; close(); }
      catch (err) { status.textContent = err.message || String(err); }
      finally { busy = false; saveBtn.disabled = false; }
    };
    dialog.showModal();
    api.focus();
  });
}
