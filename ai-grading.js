// AI grading assistant: admin-only page at /admin/grading. The admin brings
// their own API key for each lab (kept in this browser only), picks a model and a
// reasoning effort, edits the grader persona, then grades the posts of the modules
// they teach. Each post's AI grade and feedback are stored privately (aiReviews)
// beside the admin's own final grade and feedback, and the table downloads as Excel
// in the layout of the old grading spreadsheet. Nothing here is shown to students
// or to other instructors; the Firestore rules enforce the same.
import {store} from './store.js';
import {currentUser} from './auth.js';
import {navigate, publicUrl} from './router.js';
import {esc, fmtDateTime, toast, postPath, wordCount, pageHead} from './util.js';
import {PROVIDERS, callProvider} from './ai-providers.js';
import {DEFAULT_GRADER, PLACEHOLDERS, buildReview, buildPolish, parseReview, gradingRows, GRADING_COLUMNS} from './ai-grading-model.js';
import {downloadExcelSheet} from './roster-export.js';
import {makeTablesSortable} from './sortable-tables.js';

const KEYS = 'ucd-blog.aiKeys', PREFS = 'ucd-blog.aiPrefs';
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// The local prototype has a demo grader so the whole workflow can be tried
// without a key: a deterministic grade and feedback from the post itself.
const DEMO = {name: 'Demo grader (no API, local prototype)', keyHint: '', console: '', models: [{id: 'demo', name: 'Demo'}], efforts: ['low', 'high'], defaultEffort: 'high'};
async function demoCall({user, system}) {
  await new Promise(r => setTimeout(r, 400));
  const text = user.slice(user.indexOf('Blog post:')), words = text.split(/\s+/).length, links = (text.match(/\(https?:\/\//g) || []).length;
  const grade = Math.round(Math.min(10, 4 + Math.min(3, words / 300) + Math.min(2, links * 0.5) + (/^## /m.test(text) ? 1 : 0)) * 10) / 10;
  const polish = /original feedback/.test(user);
  const reply = polish ? user.slice(user.lastIndexOf('"""\n', user.length - 5) + 4, -4).trim().replace(/\s*$/, ' (I would add that your post is a real pleasure to read, and the next version can be even stronger.)')
    : JSON.stringify({grade, summary: `Demo summary: the post is about ${words} words long with ${links} hyperlinked source${links === 1 ? '' : 's'}.`, feedback: `Demo feedback. Your post is clearly structured and ${links ? 'links to its sources' : 'would benefit from hyperlinked sources'}. In your next version, make the recommendations more concrete and close with sharper open questions for your classmates. (Persona in use: ${system.slice(0, 40)}…)`});
  return {text: reply, usage: {input: Math.round(user.length / 4), output: Math.round(reply.length / 4)}, stop: 'end_turn', model: 'demo'};
}

export async function renderGrading(target, {moduleId = '', embedded = false} = {}) {
  const u = currentUser();
  if (!u || u.role !== 'admin') { target.innerHTML = '<p class="empty">This page is private to the platform admin.</p>'; return; }
  const providers = {...PROVIDERS, ...(store.mode === 'local' ? {demo: DEMO} : {})};
  const keys = read(KEYS, {}), prefs = {provider: store.mode === 'local' ? 'demo' : 'anthropic', model: '', custom: '', effort: '', status: 'published', ...read(PREFS, {})};
  if (!providers[prefs.provider]) prefs.provider = Object.keys(providers)[0];
  const [allModules, blogs, saved] = await Promise.all([store.listModules(), store.listBlogs(), store.getGraderConfig()]);
  // The admin grades only the modules they teach themselves.
  const modules = allModules.filter(m => (m.teacherIds || []).includes(u.uid));
  if (moduleId && !modules.some(m => m.id === moduleId)) moduleId = '';
  const scope = moduleId ? modules.filter(m => m.id === moduleId) : modules;
  let grader = {...DEFAULT_GRADER, ...(saved || {})};
  const [allPosts, members, reviews] = await Promise.all([store.listAllPosts(), Promise.all(scope.map(m => store.listUsers(m.id))).then(a => [...new Map(a.flat().map(x => [x.uid, x])).values()]), store.listAiReviews(moduleId)]);
  const posts = allPosts.filter(p => scope.some(m => m.id === p.moduleId));
  const blogOf = p => blogs.find(b => b.id === p.blogId) || {}, moduleOf = p => modules.find(m => m.id === p.moduleId) || {};
  const categoryName = p => (blogOf(p).categories || []).find(c => c.slug === p.category)?.name || p.category || '';
  const postUrl = p => publicUrl(postPath(p));
  const rows = gradingRows({posts, users: members, reviews, modules, blogs, categoryName, postUrl, wordsOf: p => p.wordCount ?? wordCount(p.body || '')});
  const byId = new Map(rows.map(r => [r.postId, r]));

  const providerOptions = Object.entries(providers).map(([id, p]) => `<option value="${id}" ${id === prefs.provider ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  target.innerHTML = `${pageHead('AI grading', 'Private to the platform admin: grade and draft feedback for the posts of the modules you teach, with your own API keys.' + (embedded ? '' : ' <a href="/admin">Admin area</a>'), embedded)}
    <div class="notice info"><b>How this works.</b> Your API keys are kept in this browser only (never in the database) and are sent only to the lab that issued them. Each review sends the post text, the blog's brief and your grader persona to that lab's API from this browser; nothing is shown to students or other instructors. Check the lab's data-use terms before grading real student work.</div>
    <div class="grading-setup two-col">
      <div class="panel"><h3>1. Model</h3>
        <label class="field">AI lab<select id="ai-provider">${providerOptions}</select></label>
        <div id="ai-key-wrap"><label class="field">API key<input id="ai-key" type="password" autocomplete="off" spellcheck="false"><p class="hint" id="ai-key-status"></p></label>
        <p class="actions"><button type="button" class="btn small" id="ai-key-save">Save key in this browser</button><button type="button" class="btn small" id="ai-key-remove">Remove key</button><a class="small" id="ai-key-link" target="_blank" rel="noopener">Get a key</a></p></div>
        <label class="field">Model<select id="ai-model"></select></label>
        <label class="field" id="ai-custom-wrap" hidden>Model id<input id="ai-custom" placeholder="exact model id from the lab's documentation"></label>
        <label class="field">Reasoning effort<select id="ai-effort"></select><p class="hint">Higher effort thinks longer and costs more. Fable 5.1 at high effort can take a minute or more per post.</p></label>
      </div>
      <div class="panel"><h3>2. Grader persona and instructions</h3>
        <p class="muted small" id="g-status">${saved ? 'Saved ' + esc(fmtDateTime(saved.updatedAt)) + '.' : 'Using the default persona (the prompts from the grading spreadsheet).'} Applies to every blog; the blog's own brief is inserted as <code>{brief}</code>.</p>
        <details><summary>Edit the persona, the grading instructions and the feedback-polishing prompt</summary>
          <label class="field">Persona (system prompt)<textarea id="g-persona" rows="5">${esc(grader.persona)}</textarea></label>
          <label class="field">How to grade (sent with every post, before the post text)<textarea id="g-instructions" rows="16">${esc(grader.instructions)}</textarea></label>
          <label class="field">Polish my feedback (rewrites your own draft)<textarea id="g-polish" rows="8">${esc(grader.polish)}</textarea></label>
          <p class="hint">Placeholders: ${PLACEHOLDERS.map(p => `<code>${esc(p)}</code>`).join(' ')}. The reply format (a JSON object with grade, summary and feedback) is fixed by the code.</p>
          <p class="actions"><button type="button" class="btn small primary" id="g-save">Save grader</button><button type="button" class="btn small" id="g-reset">Restore defaults</button></p>
        </details>
      </div>
    </div>
    <div class="review-filters" style="margin-top:18px"><label class="field">Module<select id="grading-module"><option value="">All modules I teach (${modules.length})</option>${modules.map(m => `<option value="${esc(m.id)}" ${m.id === moduleId ? 'selected' : ''}>${esc([m.code, m.title].filter(Boolean).join(' '))}${m.academicYear ? ' (' + esc(m.academicYear) + ')' : ''}</option>`).join('')}</select></label>
      <label class="field">Posts<select id="grading-status"><option value="published" ${prefs.status === 'published' ? 'selected' : ''}>Published only</option><option value="all" ${prefs.status === 'all' ? 'selected' : ''}>All, including drafts and pending</option></select></label>
      <label class="field">Search<input id="grading-search" type="search" placeholder="Student, ID, email, pen name or title"></label></div>
    <p class="actions"><button type="button" class="btn primary" id="grade-missing"></button><button type="button" class="btn" id="grade-all"></button><button type="button" class="btn danger" id="grade-stop" hidden>Stop</button><button type="button" class="btn" id="grade-excel">Download Excel</button><span id="grade-progress" class="muted small"></span></p>
    <div class="table-scroll grading-table" id="grading-table"></div>`;
  const $ = id => target.querySelector('#' + id);

  // ---- model selection (persisted in this browser) ----
  const selection = () => { const id = $('ai-provider').value, p = providers[id]; const model = $('ai-model').value === '__custom' ? $('ai-custom').value.trim() : $('ai-model').value; return {provider: id, name: p.name, apiKey: keys[id] || '', model, effort: $('ai-effort').value}; };
  function paintProvider() {
    const id = $('ai-provider').value, p = providers[id], known = p.models.some(m => m.id === prefs.model) || !prefs.model;
    $('ai-key-wrap').hidden = id === 'demo';
    $('ai-key').value = ''; $('ai-key').placeholder = keys[id] ? 'Key saved in this browser (enter a new one to replace it)' : p.keyHint;
    $('ai-key-status').textContent = keys[id] ? `${p.name} key saved in this browser.` : `No ${p.name} key saved yet.`;
    $('ai-key-link').href = p.console || '#'; $('ai-key-link').hidden = !p.console;
    $('ai-model').innerHTML = p.models.map(m => `<option value="${esc(m.id)}" ${m.id === prefs.model ? 'selected' : ''}>${esc(m.name)} <span class="muted">(${esc(m.id)})</span></option>`).join('') + (id === 'demo' ? '' : `<option value="__custom" ${!known ? 'selected' : ''}>Other model id…</option>`);
    $('ai-custom-wrap').hidden = known; $('ai-custom').value = known ? '' : prefs.model;
    $('ai-effort').innerHTML = p.efforts.map(e => `<option value="${e}" ${(p.efforts.includes(prefs.effort) ? prefs.effort : p.defaultEffort) === e ? 'selected' : ''}>${e}</option>`).join('');
  }
  const remember = () => { const s = selection(); Object.assign(prefs, {provider: s.provider, model: s.model, effort: s.effort}); write(PREFS, prefs); };
  paintProvider();
  $('ai-provider').onchange = () => { prefs.model = ''; prefs.effort = ''; paintProvider(); remember(); };
  $('ai-model').onchange = () => { $('ai-custom-wrap').hidden = $('ai-model').value !== '__custom'; if ($('ai-model').value === '__custom') $('ai-custom').focus(); remember(); };
  $('ai-custom').onchange = remember; $('ai-effort').onchange = remember;
  $('ai-key-save').onclick = () => { const v = $('ai-key').value.trim(); if (!v) return toast('Paste the API key first.', 'error'); keys[$('ai-provider').value] = v; write(KEYS, keys); paintProvider(); toast('Key saved in this browser.'); };
  $('ai-key-remove').onclick = () => { delete keys[$('ai-provider').value]; write(KEYS, keys); paintProvider(); toast('Key removed from this browser.'); };

  // ---- grader persona ----
  $('g-save').onclick = async () => { try { grader = {...grader, ...(await store.saveGraderConfig({persona: $('g-persona').value, instructions: $('g-instructions').value, polish: $('g-polish').value}))}; $('g-status').textContent = `Saved ${fmtDateTime(grader.updatedAt)}.`; toast('Grader saved.'); } catch (e) { toast(e.message, 'error'); } };
  $('g-reset').onclick = () => { if (!confirm('Replace the three texts with the default prompts? They are not saved until you click Save grader.')) return; $('g-persona').value = DEFAULT_GRADER.persona; $('g-instructions').value = DEFAULT_GRADER.instructions; $('g-polish').value = DEFAULT_GRADER.polish; };

  // ---- the table ----
  let stop = false, running = false;   // one batch at a time: a repaint of the table must not re-enable the batch buttons mid-run
  const visible = () => { const q = $('grading-search').value.trim().toLowerCase(), st = $('grading-status').value; return rows.filter(r => (st === 'all' || r.status === 'published') && (!q || [r.firstName, r.lastName, r.studentId, r.email, r.penName, r.title, r.organisation].join(' ').toLowerCase().includes(q))); };
  const grade = v => v == null || v === '' ? '—' : Number(v).toFixed(1);
  const aiCells = r => `<td data-sort-value="${r.aiGrade ?? ''}"><span class="ai-grade">${grade(r.aiGrade)}</span>${r.aiModel ? `<br><span class="muted small">${esc(r.aiModel)}<br>${esc(fmtDateTime(r.aiReviewedAt))}</span>` : ''}${r.aiError ? `<br><span class="ai-error">${esc(r.aiError)}</span>` : ''}</td>
    <td><div class="ai-text">${r.aiSummary ? `<span class="summary">${esc(r.aiSummary)}</span>` : ''}${esc(r.aiFeedback) || '<span class="muted">Not graded yet.</span>'}</div>${r.aiFeedback ? `<p class="actions small"><button type="button" class="linkish" data-copy-ai="${r.postId}">Copy</button><button type="button" class="linkish" data-use-ai="${r.postId}">Use as final feedback</button></p>` : ''}</td>`;
  const rowHtml = r => `<tr data-post="${r.postId}"><td><b>${esc([r.firstName, r.lastName].filter(Boolean).join(' ') || '—')}</b><br><span class="muted small">${esc(r.moduleTitle)}${r.academicYear ? ' · ' + esc(r.academicYear) : ''}</span></td><td>${esc(r.studentId || '—')}</td><td>${esc(r.email || '—')}</td><td>${esc(r.penName || '—')}</td>
    <td>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>` : `<a href="/edit/${esc(r.postId)}">${esc(r.title)}</a>`}<br><span class="muted small">${esc(r.organisation)}${r.category ? ' · ' + esc(r.category) : ''} · ${r.words} words · <span class="badge ${esc(r.status)}">${esc(r.status)}</span></span></td>
    ${aiCells(r)}
    <td data-sort-value="${esc(String(r.finalGrade))}"><input class="final-grade" data-final-grade="${r.postId}" value="${esc(String(r.finalGrade))}" maxlength="20" aria-label="Final grade"></td>
    <td><textarea class="final-text" data-final-text="${r.postId}" rows="5" aria-label="Final feedback" placeholder="Your final feedback for the student">${esc(r.finalFeedback)}</textarea><p class="actions small"><button type="button" class="linkish" data-polish="${r.postId}">Polish with AI</button><button type="button" class="linkish" data-copy-final="${r.postId}">Copy</button><span class="muted small" data-final-status="${r.postId}">${r.finalEditedAt ? 'Saved ' + esc(fmtDateTime(r.finalEditedAt)) : ''}</span></p></td>
    <td class="actions"><button type="button" class="btn small ${r.aiGrade == null ? 'primary' : ''}" data-grade="${r.postId}">${r.aiFeedback ? 'Re-grade' : 'Grade'}</button></td></tr>`;
  function drawTable() {
    const list = visible();
    $('grading-table').innerHTML = `<table class="list"><thead><tr><th>Student</th><th>University ID</th><th>University email</th><th>Pen name</th><th>Post</th><th>AI grade</th><th>AI feedback</th><th>Final grade</th><th>Final feedback</th><th></th></tr></thead><tbody>${list.map(rowHtml).join('') || `<tr><td colspan="10">${rows.length ? 'No posts match.' : modules.length ? 'No posts in these modules yet.' : 'You are not a teacher on any module. Add yourself as an instructor to a module to grade its posts.'}</td></tr>`}</tbody></table>`;
    makeTablesSortable($('grading-table'));
    const missing = list.filter(r => r.aiGrade == null && r.status === 'published' || (r.aiGrade == null && $('grading-status').value === 'all'));
    $('grade-missing').textContent = `Grade ${missing.length} ungraded post${missing.length === 1 ? '' : 's'}`; $('grade-missing').disabled = running || !missing.length;
    $('grade-all').textContent = `Re-grade all ${list.length}`; $('grade-all').disabled = running || !list.length;
  }
  const paintAi = r => { const tr = $('grading-table').querySelector(`tr[data-post="${r.postId}"]`); if (!tr) return; const cells = tr.querySelectorAll('td'); const t = document.createElement('template'); t.innerHTML = `<tr>${aiCells(r)}</tr>`; const [gradeCell, feedbackCell] = t.content.querySelectorAll('td'); cells[5].replaceWith(gradeCell); cells[6].replaceWith(feedbackCell); const b = tr.querySelector('[data-grade]'); b.textContent = r.aiFeedback ? 'Re-grade' : 'Grade'; b.classList.toggle('primary', r.aiGrade == null); };
  drawTable();
  $('grading-search').oninput = drawTable; $('grading-status').onchange = () => { prefs.status = $('grading-status').value; write(PREFS, prefs); drawTable(); };
  $('grading-module').onchange = e => { navigate('/admin/grading' + (e.target.value ? '?module=' + e.target.value : '')); };

  // ---- reviewing ----
  const ident = r => ({postId: r.postId, moduleId: r.post.moduleId || '', blogId: r.post.blogId || '', authorId: r.authorId || ''});
  const call = (s, opts) => s.provider === 'demo' ? demoCall(opts) : callProvider(s.provider, {apiKey: s.apiKey, model: s.model, effort: s.effort, ...opts});
  const ready = () => { const s = selection(); if (!s.model) { toast('Choose a model, or type a model id.', 'error'); return null; } if (s.provider !== 'demo' && !s.apiKey) { toast(`Save your ${s.name} API key first.`, 'error'); return null; } return s; };
  async function reviewOne(r, s) {
    const tr = $('grading-table').querySelector(`tr[data-post="${r.postId}"]`); tr?.classList.add('row-busy');
    try {
      const built = buildReview({grader, post: r.post, blog: blogOf(r.post), module: moduleOf(r.post), categoryName: categoryName(r.post)});
      const out = await call(s, {system: built.system, user: built.user, schema: built.schema});
      if (['max_tokens', 'incomplete', 'MAX_TOKENS', 'length'].includes(out.stop)) throw Error('The reply was cut short at the token limit; lower the effort or try another model.');
      if (!out.text) throw Error(`The model returned no text${out.stop ? ` (${out.stop})` : ''}.`);
      const parsed = parseReview(out.text);
      const review = {...ident(r), provider: s.provider, model: s.model, effort: s.effort, grade: parsed.grade, summary: parsed.summary.slice(0, 4000), feedback: parsed.feedback.slice(0, 20000), raw: parsed.raw.slice(0, 40000), error: '', usage: out.usage, reviewedAt: Date.now(), inputChars: built.text.length};
      const savedReview = await store.saveAiReview(r.postId, review);
      Object.assign(r, {review: savedReview, aiGrade: savedReview.grade ?? null, aiSummary: savedReview.summary || '', aiFeedback: savedReview.feedback || '', aiModel: [s.provider, s.model, s.effort].join(' · '), aiReviewedAt: savedReview.reviewedAt, aiError: ''});
      if (parsed.grade == null) toast('The reply had no numeric grade; the text was kept as feedback.', 'error');
    } catch (e) { r.aiError = e.message; await store.saveAiReview(r.postId, {...ident(r), error: String(e.message).slice(0, 2000)}).catch(() => {}); throw e; }
    finally { tr?.classList.remove('row-busy'); paintAi(r); }
  }
  async function reviewMany(list) {
    if (running) return toast('A batch is already running. Stop it first.', 'error');
    const s = ready(); if (!s || !list.length) return;
    if (!confirm(`Send ${list.length} post${list.length === 1 ? '' : 's'} to ${s.name} (${s.model}, ${s.effort} effort)? Each post is one request billed to your key.`)) return;
    stop = false; running = true; $('grade-stop').hidden = false; $('grade-missing').disabled = $('grade-all').disabled = true;
    let done = 0, failed = 0;
    try {
      for (const r of list) {
        if (stop) break;
        $('grade-progress').textContent = `Reviewing ${done + failed + 1} of ${list.length}: ${r.title}…`;
        try { await reviewOne(r, s); done++; } catch (e) { failed++; console.warn(e); }
        await new Promise(res => setTimeout(res, 300));
      }
    } finally { running = false; }
    $('grade-progress').textContent = `${done} reviewed${failed ? `, ${failed} failed` : ''}${stop ? ' (stopped)' : ''}.`;
    $('grade-stop').hidden = true; drawTable();
  }
  $('grade-missing').onclick = () => reviewMany(visible().filter(r => r.aiGrade == null));
  $('grade-all').onclick = () => reviewMany(visible());
  $('grade-stop').onclick = () => { stop = true; $('grade-stop').disabled = true; setTimeout(() => $('grade-stop').disabled = false, 1000); };

  // ---- final grade and feedback (the instructor's own, saved on change) ----
  async function saveFinal(r, patch) {
    const status = target.querySelector(`[data-final-status="${r.postId}"]`);
    try { const savedReview = await store.saveAiReview(r.postId, {...ident(r), ...patch, finalEditedAt: Date.now()}); Object.assign(r, {review: savedReview, finalGrade: savedReview.finalGrade ?? '', finalFeedback: savedReview.finalFeedback || '', finalEditedAt: savedReview.finalEditedAt}); if (status) status.textContent = 'Saved ' + fmtDateTime(r.finalEditedAt); }
    catch (e) { if (status) status.textContent = 'Not saved: ' + e.message; toast(e.message, 'error'); }
  }
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast(`${what} copied.`); } catch { prompt(what, text); } };
  if (target._gradingChange) target.removeEventListener('change', target._gradingChange);
  if (target._gradingClick) target.removeEventListener('click', target._gradingClick);
  target.addEventListener('change', target._gradingChange = e => {
    const g = e.target.closest('[data-final-grade]'); if (g) { const r = byId.get(g.dataset.finalGrade); g.closest('td').dataset.sortValue = g.value.trim(); return saveFinal(r, {finalGrade: g.value.trim().slice(0, 20)}); }
    const t = e.target.closest('[data-final-text]'); if (t) return saveFinal(byId.get(t.dataset.finalText), {finalFeedback: t.value.trim().slice(0, 20000)});
  });
  target.addEventListener('click', target._gradingClick = async e => {
    const b = e.target.closest('button[data-grade],[data-copy-ai],[data-use-ai],[data-polish],[data-copy-final]'); if (!b) return;
    const id = b.dataset.grade || b.dataset.copyAi || b.dataset.useAi || b.dataset.polish || b.dataset.copyFinal, r = byId.get(id); if (!r) return;
    const area = target.querySelector(`[data-final-text="${id}"]`);
    if (b.dataset.grade !== undefined) { if (running) return toast('A batch is already running. Stop it first.', 'error'); const s = ready(); if (!s) return; b.disabled = true; try { await reviewOne(r, s); toast(`Graded: ${grade(r.aiGrade)} / 10.`); } catch (err) { toast(err.message, 'error'); } finally { b.disabled = false; } }
    else if (b.dataset.copyAi !== undefined) copy([r.aiSummary, r.aiFeedback].filter(Boolean).join('\n\n'), 'AI feedback');
    else if (b.dataset.useAi !== undefined) { if (area.value.trim() && !confirm('Replace your final feedback with the AI feedback?')) return; area.value = r.aiFeedback; await saveFinal(r, {finalFeedback: r.aiFeedback.slice(0, 20000)}); }
    else if (b.dataset.copyFinal !== undefined) copy(area.value, 'Final feedback');
    else if (b.dataset.polish !== undefined) {
      const s = ready(); if (!s) return; b.disabled = true;
      try { const built = buildPolish({grader, draft: area.value, post: r.post, blog: blogOf(r.post), module: moduleOf(r.post), categoryName: categoryName(r.post)}); const out = await call(s, {system: built.system, user: built.user}); if (!out.text) throw Error('The model returned no text.'); area.value = out.text.trim(); await saveFinal(r, {finalFeedback: area.value.slice(0, 20000)}); toast('Feedback polished.'); }
      catch (err) { toast(err.message, 'error'); } finally { b.disabled = false; }
    }
  });

  // ---- Excel, in the layout of the old grading sheet ----
  $('grade-excel').onclick = async e => {
    e.target.disabled = true;
    try { const stamp = t => t ? new Date(t).toISOString().replace('T', ' ').slice(0, 19) : ''; await downloadExcelSheet('AI grading', GRADING_COLUMNS, visible().map(r => ({...r, aiGrade: r.aiGrade == null ? '' : r.aiGrade, aiReviewed: stamp(r.aiReviewedAt)})), `ucd-blog-grading-${moduleId || 'my-modules'}-${new Date().toISOString().slice(0, 10)}.xlsx`); toast('Excel file downloaded.'); }
    catch (err) { toast(err.message, 'error'); } finally { e.target.disabled = false; }
  };
}
