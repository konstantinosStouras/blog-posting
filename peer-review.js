// Peer review of blogs (study guide section 5.3): the admin's control room at /admin/peer,
// the student's list of assigned posts at /peer-review, and the panel in a post's side
// column where an assigned reviewer submits their assessment and an author reads the
// feedback once it is released. Private to the platform admin: no other instructor sees
// the round, the dashboard or the reviews (firestore.rules says the same). The arithmetic,
// the prompts and the sheets live in peer-review-model.js.
import {store} from './store.js';
import {currentUser} from './auth.js';
import {navigate, publicUrl} from './router.js';
import {esc, fmtDate, fmtDateTime, toast, postPath, pageHead} from './util.js';
import {PROVIDERS, callProvider} from './ai-providers.js';
import {DEFAULT_GRADER, htmlToText} from './ai-grading-model.js';
import {PER_STUDENT, GRADE_MIN, GRADE_MAX, MIN_WORDS, MAX_CHARS, GUIDE_QUESTIONS, GRADE_SCALE, reviewId, newSeed, reviewablePosts, assignPeerReviews, fillGaps, verifyAssignments, validateReview, roundOpen, words, peerPostRows, peerReviewerRows, summaryFor, peerPostSheet, peerReviewerSheet, PEER_POST_COLUMNS, PEER_REVIEWER_COLUMNS, DEFAULT_PEER_PROMPTS, PEER_PLACEHOLDERS, buildSynthesis, buildReviewerAssessment, parseSynthesis, parseReviewerAssessment} from './peer-review-model.js';
import {downloadExcelSheet} from './roster-export.js';
import {makeTablesSortable} from './sortable-tables.js';

const KEYS = 'ucd-blog.aiKeys', PREFS = 'ucd-blog.aiPrefs';   // the model and keys chosen on the AI grading page
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const grade = v => v == null || v === '' ? '—' : Number(v).toFixed(1);
const GRADES = Array.from({length: (GRADE_MAX - GRADE_MIN) * 2 + 1}, (_, i) => GRADE_MIN + i / 2);

// ---------- the reviewer's form (a sheet over the post) ----------
// Opens for one assignment; on save the assignment is written back and `onSaved` redraws.
function openAssessmentForm({assignment, post, onSaved}) {
  document.querySelector('.peer-dialog')?.remove();
  const dialog = document.createElement('dialog'); dialog.className = 'peer-dialog'; dialog.setAttribute('aria-labelledby', 'peer-dialog-title');
  dialog.innerHTML = `<form method="dialog" class="peer-head"><h2 id="peer-dialog-title">Blog assessment</h2><button class="btn small" value="cancel" aria-label="Close">Close</button></form>
    <p class="muted">“${esc(post.title || 'Untitled')}” by <b>${esc(post.authorName || 'a classmate')}</b>. Your assessment is anonymous: the author sees the feedback, never who wrote it.</p>
    <p class="small">${esc(GRADE_SCALE)}</p>
    <details class="peer-guide"><summary>Questions to guide your feedback</summary><ol>${GUIDE_QUESTIONS.map(q => `<li>${esc(q)}</li>`).join('')}</ol><p class="muted small">Be polite, fair and professional, and consider how you would feel receiving these comments about your own work. Recognise strengths and offer constructive criticism.</p></details>
    <form class="peer-form">
      <label class="field">Rating from ${GRADE_MIN} to ${GRADE_MAX}<select name="grade" required><option value="">Choose…</option>${GRADES.map(g => `<option value="${g}" ${assignment.grade === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      <label class="field">Constructive feedback (at least ${MIN_WORDS} words)<textarea name="assessment" rows="9" maxlength="${MAX_CHARS}" required placeholder="What is strong, what you learned, what is missing or doubtful, and how the author could improve the post.">${esc(assignment.assessment || '')}</textarea><p class="hint"><span data-words>${words(assignment.assessment)}</span> words</p></label>
      <p class="actions"><button type="submit" class="btn primary">${assignment.grade != null ? 'Save changes' : 'Submit assessment'}</button><button type="button" class="btn" data-cancel>Cancel</button></p></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form.peer-form'), counter = dialog.querySelector('[data-words]');
  form.assessment.oninput = () => { counter.textContent = words(form.assessment.value); };
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  form.onsubmit = async e => {
    e.preventDefault(); const button = form.querySelector('button[type=submit]'); button.disabled = true;
    try { const clean = validateReview({grade: form.grade.value, assessment: form.assessment.value}); const saved = await store.submitPeerReview(assignment.id, clean); toast(assignment.grade != null ? 'Assessment updated.' : 'Assessment submitted. Thank you.'); dialog.close(); onSaved(saved); }
    catch (err) { toast(err.message, 'error'); button.disabled = false; }
  };
  dialog.addEventListener('close', () => dialog.remove(), {once: true});
  dialog.showModal(); form.grade.focus();
}

// ---------- the post's side column ----------
// For an assigned reviewer: the "Submit blog assessment" button (or what they submitted, with
// Edit while the round is open). For the author: the released peer feedback. One read per
// post view, nothing for anyone else. Returns {html, bind} or null.
export async function peerSidePanel(p, u) {
  if (!u || !p || p.status !== 'published' || !p.moduleId) return null;
  if (u.uid === p.authorId) {
    const s = await store.getPeerSummary(p.id).catch(() => null); if (!s) return null;
    return {html: `<section class="peer-panel released" aria-label="Peer feedback"><h3>Peer feedback</h3><p><b>${grade(s.mean)}</b> / 10 average from ${s.count} classmate${s.count === 1 ? '' : 's'}${s.adjustedMean != null && s.adjustedMean !== s.mean ? ` <span class="muted">(${grade(s.adjustedMean)} adjusted for reviewer leniency)</span>` : ''}</p>${s.feedback ? `<p class="peer-feedback">${esc(s.feedback)}</p>` : ''}${(s.assessments || []).length ? `<details><summary>The ${s.assessments.length} reviews as written</summary>${s.assessments.map(a => `<p class="peer-quote"><b>${grade(a.grade)}</b> / 10 · ${esc(a.assessment)}</p>`).join('')}</details>` : ''}<p class="muted small">Released ${fmtDate(s.releasedAt)}. Only you and your instructor see this.</p></section>`, bind() {}};
  }
  const a = await store.getPeerReview(reviewId(p.moduleId, p.id, u.uid)).catch(() => null); if (!a) return null;
  const round = await store.getPeerRound(p.moduleId).catch(() => null);
  const state = {a, round};
  const html = () => { const open = roundOpen(state.round), done = state.a.grade != null; return `<h3>Your blog assessment</h3>${done ? `<p>You rated this post <b>${grade(state.a.grade)}</b> / 10 <span class="muted small">· ${fmtDateTime(state.a.submittedAt)}</span></p><p class="peer-quote">${esc(state.a.assessment)}</p>` : `<p class="muted">This post is one of the ${PER_STUDENT} assigned to you for assessment${state.round?.deadline ? `, due by ${fmtDate(state.round.deadline)}` : ''}.</p>`}<p class="actions">${open ? `<button type="button" class="btn ${done ? 'small' : 'primary'}" data-peer-assess>${done ? 'Edit assessment' : 'Submit blog assessment'}</button>` : `<span class="muted small">${done ? 'The review round has closed; your assessment is final.' : 'The review round has closed.'}</span>`}<a class="small" href="/peer-review">All your assigned posts</a></p>`; };
  return {html: `<section class="peer-panel" id="peer-panel" aria-label="Your blog assessment">${html()}</section>`, bind(root) {
    const el = root.querySelector('#peer-panel'); if (!el) return;
    el.onclick = e => { if (e.target.closest('[data-peer-assess]')) openAssessmentForm({assignment: state.a, post: p, onSaved: saved => { state.a = saved || state.a; el.innerHTML = html(); }}); };
  }};
}

// ---------- the student's list: /peer-review ----------
export async function myPeerReviews(target) {
  const u = currentUser();
  if (!u) { target.innerHTML = '<p class="empty">Log in to see the posts assigned to you.</p>'; return; }
  const mine = (await store.listMyPeerReviews()).sort((a, b) => (a.order || 0) - (b.order || 0));
  const moduleIds = [...new Set(mine.map(r => r.moduleId))];
  const [modules, rounds, posts, notes] = await Promise.all([Promise.all(moduleIds.map(id => store.getModule(id))), Promise.all(moduleIds.map(id => store.getPeerRound(id))), Promise.all(mine.map(r => store.getPost(r.postId, {light: true}).catch(() => null))), Promise.all(moduleIds.map(id => store.getMyPeerReviewerNote(id).catch(() => null)))]);
  const postOf = Object.fromEntries(mine.map((r, i) => [r.postId, posts[i]]));
  const section = (moduleId, i) => {
    const m = modules[i], round = rounds[i], rows = mine.filter(r => r.moduleId === moduleId), done = rows.filter(r => r.grade != null).length, open = roundOpen(round), note = notes[i];
    return `<section class="blog-group"><h2 class="group-title">${esc(m ? [m.code, m.title].filter(Boolean).join(' ') : moduleId)}</h2>
      <p class="muted">${done} of ${rows.length} submitted${round?.deadline ? ` · due by <b>${fmtDate(round.deadline)}</b>` : ''}${open ? '' : ' · <b>the round has closed</b>'}. Read each post, then use <b>Submit blog assessment</b> beside it. Your name is never shown to the author.</p>
      <table class="list"><thead><tr><th>#</th><th>Post</th><th>Your rating</th><th>Submitted</th><th></th></tr></thead><tbody>${rows.map((r, k) => { const p = postOf[r.postId]; return `<tr><td>${k + 1}</td><td>${p ? `<a href="${postPath(p)}">${esc(p.title || 'Untitled')}</a><br><span class="muted small">by ${esc(p.authorName || 'a classmate')}${p.organisation ? ' · ' + esc(p.organisation) : ''}</span>` : '<span class="muted">This post is no longer available.</span>'}</td><td>${r.grade != null ? `<b>${grade(r.grade)}</b> / 10` : '<span class="muted">—</span>'}</td><td>${r.submittedAt ? fmtDateTime(r.submittedAt) : '<span class="muted">Not yet</span>'}</td><td class="actions">${p ? `<a class="btn small ${r.grade == null && open ? 'primary' : ''}" href="${postPath(p)}">${r.grade == null ? (open ? 'Read and assess' : 'Read') : 'Read again'}</a>` : ''}</td></tr>`; }).join('')}</tbody></table>
      ${note?.releasedAt ? `<div class="notice ok"><b>Your reviewing${note.grade ? `: ${esc(note.grade)}` : ''}.</b> ${esc(note.note || '')}</div>` : ''}</section>`;
  };
  target.innerHTML = `${pageHead('Others’ blog assessment', `Signed in as <b>${esc(u.penName || '')}</b>. The posts your instructor assigned to you: rate each from ${GRADE_MIN} to ${GRADE_MAX} and write a short paragraph of constructive feedback.`)}
    ${moduleIds.length ? moduleIds.map(section).join('') : '<p class="empty">No posts have been assigned to you yet. Your instructor assigns them once the writing deadline has passed.</p>'}
    <p class="actions"><a class="btn" href="/my-modules">My modules</a></p>`;
}
// A line for a student's module card: "Peer review: 2 of 4 submitted".
export function peerCardLine(reviews, moduleId) {
  const rows = reviews.filter(r => r.moduleId === moduleId); if (!rows.length) return '';
  const done = rows.filter(r => r.grade != null).length;
  return ` Peer review: <b>${done} of ${rows.length}</b> assessments submitted. <a href="/peer-review">Your assigned posts</a>.`;
}

// ---------- the admin's control room: /admin/peer?module= ----------
export async function renderPeerAdmin(target, {moduleId = '', embedded = false} = {}) {
  const u = currentUser();
  if (!u || u.role !== 'admin') { target.innerHTML = '<p class="empty">This page is private to the platform admin.</p>'; return; }
  const [allModules, blogs] = await Promise.all([store.listModules(), store.listBlogs()]);
  const modules = allModules.filter(m => (m.teacherIds || []).includes(u.uid));   // the admin runs peer review for the modules they teach themselves
  const label = m => [m.code, m.title].filter(Boolean).join(' ') + (m.academicYear ? ` (${m.academicYear})` : '');
  const head = pageHead('Peer review', `Private to the platform admin. After the writing deadline, each student of a module is assigned the posts of ${PER_STUDENT} classmates to rate from ${GRADE_MIN} to ${GRADE_MAX} with a paragraph of feedback; the reviews are collected here, merged with the AI review, and released to the authors.` + (embedded ? '' : ' <a href="/admin">Admin area</a>'), embedded);
  const picker = `<div class="review-filters"><label class="field">Module<select id="peer-module"><option value="">Choose a module…</option>${modules.map(m => `<option value="${esc(m.id)}" ${m.id === moduleId ? 'selected' : ''}>${esc(label(m))}</option>`).join('')}</select></label></div>`;
  if (!moduleId || !modules.some(m => m.id === moduleId)) {
    const rounds = await Promise.all(modules.map(m => store.getPeerRound(m.id).catch(() => null)));
    target.innerHTML = `${head}${picker}<table class="list"><thead><tr><th>Module</th><th>Submissions</th><th>Peer review</th><th></th></tr></thead><tbody>${modules.map((m, i) => `<tr><td><b>${esc(m.code || '')}</b> ${esc(m.title)}</td><td>${m.submissionsOpen === false ? 'Closed' : 'Open'}${m.deadline ? ` · deadline ${fmtDate(m.deadline)}` : ''}</td><td>${rounds[i] ? `${rounds[i].status === 'open' ? 'Round open' : 'Round closed'}${rounds[i].deadline ? ` · due ${fmtDate(rounds[i].deadline)}` : ''}` : '<span class="muted">Not started</span>'}</td><td class="actions"><a href="/admin/peer?module=${esc(m.id)}">${rounds[i] ? 'Open' : 'Start'}</a></td></tr>`).join('') || '<tr><td colspan="4">You are not a teacher on any module.</td></tr>'}</tbody></table>`;
    target.querySelector('#peer-module').onchange = e => navigate('/admin/peer' + (e.target.value ? '?module=' + e.target.value : ''));
    return;
  }
  const module = modules.find(m => m.id === moduleId), blog = blogs.find(b => b.id === module.blogId) || {};
  const [allPosts, members, round, reviews, notes, aiReviews, summaries, promptsSaved, graderSaved] = await Promise.all([store.listAllPosts(), store.listUsers(moduleId), store.getPeerRound(moduleId), store.listPeerReviews(moduleId), store.listPeerReviewerNotes(moduleId), store.listAiReviews(moduleId), store.listPeerSummaries(moduleId), store.getPeerPrompts(), store.getGraderConfig()]);
  const posts = allPosts.filter(p => p.moduleId === moduleId), students = members.filter(m => (m.role || 'student') === 'student' || !m.role), who = new Map(students.map(m => [m.uid, m]));
  const pool = reviewablePosts(posts), without = students.filter(m => !pool.some(p => p.authorId === m.uid));
  const prompts = {...DEFAULT_PEER_PROMPTS, ...(promptsSaved || {})}, persona = graderSaved?.persona || DEFAULT_GRADER.persona;
  const postUrl = p => p && p.slug ? publicUrl(postPath(p)) : '';
  const postRows = peerPostRows({reviews, posts, users: students, aiReviews, summaries}), reviewerRows = peerReviewerRows({reviews, posts, users: students, notes});
  const check = round ? verifyAssignments(reviews.map(r => ({postId: r.postId, authorId: r.authorId, reviewerUid: r.reviewerUid})), {perStudent: round.perStudent || PER_STUDENT, posts}) : null;
  const providers = {...PROVIDERS, ...(store.mode === 'local' ? {demo: {name: 'Demo (local prototype)'}} : {})}, prefs = {provider: store.mode === 'local' ? 'demo' : 'anthropic', model: '', effort: '', ...read(PREFS, {})}, keys = read(KEYS, {});
  if (!providers[prefs.provider]) prefs.provider = Object.keys(providers)[0];
  const selection = () => ({provider: prefs.provider, name: providers[prefs.provider]?.name || prefs.provider, apiKey: keys[prefs.provider] || '', model: prefs.model || providers[prefs.provider]?.models?.[0]?.id || (prefs.provider === 'demo' ? 'demo' : ''), effort: prefs.effort || providers[prefs.provider]?.defaultEffort || ''});
  const submitted = reviews.filter(r => r.grade != null).length;

  const roundPanel = () => !round
    ? `<div class="panel"><h3>1. Assign the posts</h3>
        <p>${students.length} student${students.length === 1 ? '' : 's'} on the roster, <b>${pool.length}</b> with a published post${without.length ? `, ${without.length} without` : ''}. ${module.submissionsOpen !== false ? '<span class="warn">Submissions are still open: close them in the module settings first, so no post changes under its reviewers.</span>' : 'Submissions are closed.'}</p>
        <p class="muted small">Each student with a post is placed on a shuffled circle and reviews the next ${PER_STUDENT} posts round it: nobody gets their own, nobody gets one twice, every post gets exactly ${PER_STUDENT} reviewers. The draw is checked row by row before anything is saved.</p>
        ${without.length ? `<label class="field check"><input type="checkbox" id="peer-extras"> Also give ${PER_STUDENT} posts to the ${without.length} student${without.length === 1 ? '' : 's'} without a published post (a few posts then get a fifth review)</label>` : ''}
        <label class="field">Review deadline (optional)<input type="date" id="peer-deadline"><p class="hint">Shown to students; submissions close at the end of that day, or when you close the round.</p></label>
        <p class="actions"><button type="button" class="btn primary" id="peer-assign" ${pool.length < PER_STUDENT + 1 ? 'disabled' : ''}>Assign ${PER_STUDENT} posts to each student</button>${pool.length < PER_STUDENT + 1 ? `<span class="muted small">At least ${PER_STUDENT + 1} published posts are needed.</span>` : ''}</p></div>`
    : `<div class="panel"><h3>1. The round</h3>
        <p><b>${round.status === 'open' ? 'Open' : 'Closed'}</b>${round.deadline ? ` · due ${fmtDate(round.deadline)}${round.status === 'open' && !roundOpen(round) ? ' <span class="warn">(passed: students can no longer submit; close the round)</span>' : ''}` : ''} · assigned ${fmtDateTime(round.assignedAt)} · ${reviews.length} assignments, ${submitted} submitted (${reviews.length ? Math.round(submitted / reviews.length * 100) : 0}%) · seed <code>${esc(round.seed || '')}</code></p>
        <p class="${check.ok ? 'ok' : 'warn'} small">${check.ok ? `✓ Every one of ${check.reviewers} reviewers has ${round.perStudent || PER_STUDENT} distinct posts of others, and every one of ${check.posts} posts has at least ${round.perStudent || PER_STUDENT} distinct reviewers.` : `${check.problems.length} problem${check.problems.length === 1 ? '' : 's'}: ${esc(check.problems.slice(0, 5).join(' '))}${check.problems.length > 5 ? ' …' : ''}`}</p>
        <label class="field">Review deadline<input type="date" id="peer-deadline" value="${esc(round.deadline || '')}"></label>
        <p class="actions">${round.status === 'open' ? '<button type="button" class="btn" id="peer-close">Close the round</button>' : '<button type="button" class="btn" id="peer-reopen">Reopen the round</button>'}<button type="button" class="btn" id="peer-fill" ${check.ok && !without.some(m => !reviews.some(r => r.reviewerUid === m.uid)) ? 'disabled' : ''}>Fill the gaps</button><button type="button" class="btn danger" id="peer-reset">Delete the round</button></p>
        <p class="hint">Fill the gaps assigns reviewers to a post published after the draw and posts to a student who joined after it, leaving existing assignments as they are. Deleting the round removes every assignment, review, note and released summary of this module.</p></div>`;
  const aiPanel = () => { const s = selection(); return `<div class="panel"><h3>2. AI aggregation</h3>
      <p class="small">Model: <b>${esc(s.name)}</b>${s.model ? ` · ${esc(s.model)}` : ''}${s.effort ? ` · ${esc(s.effort)}` : ''}${s.provider !== 'demo' && !s.apiKey ? ' · <span class="warn">no key saved</span>' : ''}. The model, the key and the grader persona are set on <a href="/admin/grading">AI grading</a>; the persona is reused here.</p>
      <details><summary>Edit the two prompts</summary>
        <label class="field">Merge the peer reviews with my AI review into one feedback for the author ("4+1")<textarea id="peer-prompt-synthesis" rows="12">${esc(prompts.synthesis)}</textarea></label>
        <label class="field">Assess a student's reviewing ("review the reviewer")<textarea id="peer-prompt-reviewer" rows="10">${esc(prompts.reviewer)}</textarea></label>
        <p class="hint">Placeholders: ${PEER_PLACEHOLDERS.map(p => `<code>${esc(p)}</code>`).join(' ')}. The reply format is fixed by the code.</p>
        <p class="actions"><button type="button" class="btn small primary" id="peer-prompts-save">Save prompts</button><button type="button" class="btn small" id="peer-prompts-reset">Restore defaults</button></p></details></div>`; };

  let view = 'posts', running = false, stop = false;
  target.innerHTML = `${head}${picker}<div class="peer-setup two-col">${roundPanel()}${aiPanel()}</div>
    ${round ? `<nav class="tabs" aria-label="Peer review views"><a href="#" data-view="posts" class="active">By post (${postRows.length})</a><a href="#" data-view="reviewers">By reviewer (${reviewerRows.length})</a></nav>
    <p class="actions" id="peer-actions"></p><div class="table-scroll grading-table" id="peer-table"></div>` : ''}`;
  target.querySelector('#peer-module').onchange = e => navigate('/admin/peer' + (e.target.value ? '?module=' + e.target.value : ''));
  const $ = id => target.querySelector('#' + id);
  const redraw = () => renderPeerAdmin(target, {moduleId, embedded});

  // ---- the round ----
  if (!round) $('peer-assign').onclick = async () => {
    try {
      const extras = $('peer-extras')?.checked ? without.map(m => m.uid) : [];
      const draw = assignPeerReviews({posts, extraReviewers: extras, seed: newSeed()}), check = verifyAssignments(draw.assignments, {posts});
      if (!check.ok) throw Error('The draw failed its own check: ' + check.problems.join(' '));
      if (!confirm(`Assign ${draw.assignments.length} reviews: ${check.reviewers} reviewers × ${PER_STUDENT} posts, ${check.posts} posts reviewed${extras.length ? `, ${draw.extras.length} extra reviewer${draw.extras.length === 1 ? '' : 's'}` : ''}? Every reviewer has ${PER_STUDENT} distinct posts of others and every post has at least ${PER_STUDENT} distinct reviewers.`)) return;
      await store.assignPeerReviews(moduleId, draw.assignments.map(a => ({...a, blogId: module.blogId || '', reviewerName: who.get(a.reviewerUid)?.penName || ''})));
      await store.savePeerRound(moduleId, {blogId: module.blogId || '', status: 'open', perStudent: PER_STUDENT, seed: draw.seed, deadline: $('peer-deadline').value || '', assignedAt: Date.now(), assignedBy: u.uid});
      toast('Posts assigned. Students now see “Submit blog assessment” on each of theirs.'); redraw();
    } catch (e) { toast(e.message, 'error'); }
  };
  else {
    $('peer-deadline').onchange = async e => { try { await store.savePeerRound(moduleId, {deadline: e.target.value || ''}); toast('Deadline saved.'); } catch (err) { toast(err.message, 'error'); } };
    $('peer-close')?.addEventListener('click', async () => { if (!confirm('Close the round? Students can no longer submit or edit assessments.')) return; try { await store.savePeerRound(moduleId, {status: 'closed', closedAt: Date.now()}); redraw(); } catch (e) { toast(e.message, 'error'); } });
    $('peer-reopen')?.addEventListener('click', async () => { try { await store.savePeerRound(moduleId, {status: 'open', openedAt: Date.now()}); redraw(); } catch (e) { toast(e.message, 'error'); } });
    $('peer-fill').onclick = async () => {
      try {
        const added = fillGaps({assignments: reviews, posts, reviewers: students.map(m => m.uid), perStudent: round.perStudent || PER_STUDENT});
        if (!added.length) return toast('Nothing to fill: every post and every reviewer is covered.');
        if (!confirm(`Add ${added.length} assignment${added.length === 1 ? '' : 's'}? Existing ones are not touched.`)) return;
        await store.assignPeerReviews(moduleId, added.map(a => ({...a, blogId: module.blogId || '', reviewerName: who.get(a.reviewerUid)?.penName || ''}))); toast('Gaps filled.'); redraw();
      } catch (e) { toast(e.message, 'error'); }
    };
    $('peer-reset').onclick = async () => { if (!confirm(`Delete the round of ${label(module)}: ${reviews.length} assignments, ${submitted} submitted reviews, every note and every released summary? This cannot be undone.`)) return; if (!confirm('Really delete everything about this round?')) return; try { await store.deletePeerRound(moduleId); toast('Round deleted.'); redraw(); } catch (e) { toast(e.message, 'error'); } };
  }
  $('peer-prompts-save').onclick = async () => { try { Object.assign(prompts, await store.savePeerPrompts({synthesis: $('peer-prompt-synthesis').value, reviewer: $('peer-prompt-reviewer').value})); toast('Prompts saved.'); } catch (e) { toast(e.message, 'error'); } };
  $('peer-prompts-reset').onclick = () => { if (!confirm('Replace both prompts with the defaults? They are not saved until you click Save prompts.')) return; $('peer-prompt-synthesis').value = DEFAULT_PEER_PROMPTS.synthesis; $('peer-prompt-reviewer').value = DEFAULT_PEER_PROMPTS.reviewer; };
  if (!round) return;

  // ---- the tables ----
  const byPost = new Map(postRows.map(r => [r.postId, r])), byReviewer = new Map(reviewerRows.map(r => [r.reviewerUid, r]));
  const name = r => `<b>${esc([r.firstName, r.lastName].filter(Boolean).join(' ') || '—')}</b><br><span class="muted small">${esc(r.studentId || '')}${r.email ? ' · ' + esc(r.email) : ''}<br>${esc(r.penName || '')}</span>`;
  const gradesCell = r => `<td data-sort-value="${r.mean ?? ''}">${r.received ? `<span class="ai-grade">${grade(r.mean)}</span><br><span class="muted small">${r.grades.join(', ')} · adjusted ${grade(r.adjustedMean)}${r.spread != null ? ` · spread ${r.spread}` : ''}</span>${r.flagged ? '<br><span class="warn small">Reviewers disagree by 3 or more</span>' : ''}` : '<span class="muted">—</span>'}</td>`;
  const synthCell = r => `<td data-sort-value="${r.suggestedGrade ?? ''}">${r.suggestedGrade != null ? `<span class="ai-grade">${grade(r.suggestedGrade)}</span><br>` : ''}<div class="ai-text">${r.synthesis ? esc(r.synthesis) : '<span class="muted">Not synthesised yet.</span>'}</div>${r.synthesis ? `<p class="actions small"><button type="button" class="linkish" data-use-synth="${r.postId}">Use as final feedback</button><span class="muted small">${esc(r.synthesisModel)} · ${esc(fmtDateTime(r.synthesisAt))}</span></p>` : ''}</td>`;
  const postRow = r => `<tr data-post="${esc(r.postId)}"><td>${name(r)}</td><td>${r.post?.slug ? `<a href="${esc(postPath(r.post))}" target="_blank" rel="noopener">${esc(r.title || 'Untitled')}</a>` : esc(r.title)}<br><span class="muted small">${r.received} of ${r.assigned} reviews${r.pending.length ? ` · waiting for ${r.pending.map(x => esc(x.reviewerName || x.reviewerUid)).join(', ')}` : ''}</span>${r.reviews.length ? `<details class="peer-reviews"><summary>Read the ${r.reviews.length} review${r.reviews.length === 1 ? '' : 's'}</summary>${r.reviews.map(x => `<p class="peer-quote"><b>${grade(x.grade)}</b> · <span class="muted">${esc(x.reviewerName || x.reviewerUid)}</span> · ${esc(x.assessment)}</p>`).join('')}</details>` : ''}</td>${gradesCell(r)}<td data-sort-value="${r.aiGrade ?? ''}">${r.aiGrade != null ? `<span class="ai-grade">${grade(r.aiGrade)}</span>` : '<span class="muted">—</span>'}</td>${synthCell(r)}
    <td data-sort-value="${esc(String(r.finalGrade))}"><input class="final-grade" data-final-grade="${r.postId}" value="${esc(String(r.finalGrade))}" maxlength="20" aria-label="Final grade"></td>
    <td><textarea class="final-text" data-final-text="${r.postId}" rows="5" aria-label="Final feedback" placeholder="The feedback the author will receive">${esc(r.finalFeedback)}</textarea><p class="actions small"><span class="muted small" data-final-status="${r.postId}"></span></p></td>
    <td class="actions"><button type="button" class="btn small ${r.synthesis ? '' : 'primary'}" data-synth="${r.postId}" ${r.received ? '' : 'disabled'}>${r.synthesis ? 'Re-synthesise' : 'Synthesise'}</button><br><button type="button" class="btn small" data-release="${r.postId}" ${r.received ? '' : 'disabled'}>${r.released ? 'Release again' : 'Release to author'}</button>${r.released ? `<br><span class="ok small">Released ${esc(fmtDate(r.released.releasedAt))}</span>` : ''}</td></tr>`;
  const reviewerRow = r => `<tr data-reviewer="${esc(r.reviewerUid)}"><td>${name(r)}</td><td data-sort-value="${r.done}">${r.done} of ${r.assigned}${r.lastSubmittedAt ? `<br><span class="muted small">last ${esc(fmtDateTime(r.lastSubmittedAt))}</span>` : ''}<br><span class="muted small">avg given ${grade(r.meanGiven)} · ${r.wordsWritten} words</span></td>
    <td><ol class="peer-items">${r.items.map(x => `<li>${x.post?.slug ? `<a href="${esc(postPath(x.post))}" target="_blank" rel="noopener">${esc(x.post.title || 'Untitled')}</a>` : esc(x.post?.title || x.postId)} ${x.grade != null ? `<b>${grade(x.grade)}</b>` : '<span class="muted">—</span>'}${x.assessment ? `<details><summary>Review</summary><p class="peer-quote">${esc(x.assessment)}</p></details>` : ''}</li>`).join('')}</ol></td>
    <td data-sort-value="${r.aiScore ?? ''}">${r.aiScore != null ? `<span class="ai-grade">${grade(r.aiScore)}</span><br>` : ''}<div class="ai-text">${r.aiNote ? esc(r.aiNote) : '<span class="muted">Not assessed yet.</span>'}</div>${r.aiNote ? `<p class="actions small"><button type="button" class="linkish" data-use-note="${esc(r.reviewerUid)}">Use as my note</button><span class="muted small">${esc(r.aiModel)} · ${esc(fmtDateTime(r.aiScoredAt))}</span></p>` : ''}</td>
    <td data-sort-value="${esc(String(r.grade))}"><input class="final-grade" data-reviewer-grade="${esc(r.reviewerUid)}" value="${esc(String(r.grade))}" maxlength="20" aria-label="Reviewer grade"></td>
    <td><textarea class="final-text" data-reviewer-note="${esc(r.reviewerUid)}" rows="4" aria-label="Note to the reviewer" placeholder="Your note to the student about their reviewing">${esc(r.note)}</textarea><p class="actions small"><span class="muted small" data-note-status="${esc(r.reviewerUid)}"></span></p></td>
    <td class="actions"><button type="button" class="btn small ${r.aiNote ? '' : 'primary'}" data-score="${esc(r.reviewerUid)}" ${r.done ? '' : 'disabled'}>${r.aiNote ? 'Re-assess' : 'Assess reviewing'}</button><br><button type="button" class="btn small" data-release-note="${esc(r.reviewerUid)}" ${r.grade || r.note ? '' : 'disabled'}>${r.releasedAt ? 'Release again' : 'Release to student'}</button>${r.releasedAt ? `<br><span class="ok small">Released ${esc(fmtDate(r.releasedAt))}</span>` : ''}</td></tr>`;
  function drawTable() {
    const t = $('peer-table'), a = $('peer-actions');
    if (view === 'posts') { t.innerHTML = `<table class="list"><thead><tr><th>Author</th><th>Post and reviews received</th><th>Peer grade</th><th>AI grade</th><th>4+1 aggregated feedback</th><th>Final grade</th><th>Final feedback</th><th></th></tr></thead><tbody>${postRows.map(postRow).join('') || '<tr><td colspan="8">No assignments yet.</td></tr>'}</tbody></table>`;
      a.innerHTML = `<button type="button" class="btn primary" id="peer-synth-all" ${running ? 'disabled' : ''}>Synthesise ${postRows.filter(r => r.received && !r.synthesis).length} unsynthesised</button><button type="button" class="btn" id="peer-release-all">Release all with final feedback</button><button type="button" class="btn danger" id="peer-stop" hidden>Stop</button><button type="button" class="btn" id="peer-excel">Download Excel (posts)</button><span class="muted small" id="peer-progress"></span>`; }
    else { t.innerHTML = `<table class="list"><thead><tr><th>Reviewer</th><th>Submitted</th><th>Assigned posts and reviews</th><th>AI assessment of the reviewing</th><th>Reviewer grade</th><th>My note to the reviewer</th><th></th></tr></thead><tbody>${reviewerRows.map(reviewerRow).join('') || '<tr><td colspan="7">No assignments yet.</td></tr>'}</tbody></table>`;
      a.innerHTML = `<button type="button" class="btn primary" id="peer-score-all" ${running ? 'disabled' : ''}>Assess ${reviewerRows.filter(r => r.done && !r.aiNote).length} unassessed reviewers</button><button type="button" class="btn" id="peer-release-notes">Release all with a grade or note</button><button type="button" class="btn danger" id="peer-stop" hidden>Stop</button><button type="button" class="btn" id="peer-excel">Download Excel (reviewers)</button><span class="muted small" id="peer-progress"></span>`; }
    makeTablesSortable(t);
    $('peer-synth-all')?.addEventListener('click', () => runMany(postRows.filter(r => r.received && !r.synthesis), synthesiseOne, 'post'));
    $('peer-score-all')?.addEventListener('click', () => runMany(reviewerRows.filter(r => r.done && !r.aiNote), scoreOne, 'reviewer'));
    $('peer-stop').onclick = () => { stop = true; };
    $('peer-release-all')?.addEventListener('click', async () => { const rows = postRows.filter(r => r.received && (r.finalFeedback || r.synthesis)); if (!rows.length) return toast('No post has final feedback or a synthesis to release yet.', 'error'); if (!confirm(`Release the peer feedback of ${rows.length} post${rows.length === 1 ? '' : 's'} to their authors? Each author sees the average, the final feedback (or the synthesis when there is none) and the anonymous reviews.`)) return; try { await store.releasePeerSummaries(rows.map(r => ({...summaryFor(r), moduleId}))); toast('Released.'); redraw(); } catch (e) { toast(e.message, 'error'); } });
    $('peer-release-notes')?.addEventListener('click', async () => { const rows = reviewerRows.filter(r => r.grade || r.note); if (!rows.length) return toast('No reviewer has a grade or a note yet.', 'error'); if (!confirm(`Release the grade and note to ${rows.length} reviewer${rows.length === 1 ? '' : 's'}?`)) return; try { for (const r of rows) await store.savePeerReviewerNote(moduleId, r.reviewerUid, {releasedAt: Date.now()}); toast('Released.'); redraw(); } catch (e) { toast(e.message, 'error'); } });
    $('peer-excel').onclick = async e => { e.target.disabled = true; try { if (view === 'posts') await downloadExcelSheet('Peer review by post', PEER_POST_COLUMNS, peerPostSheet(postRows, postUrl), `ucd-blog-peer-posts-${moduleId}-${new Date().toISOString().slice(0, 10)}.xlsx`); else await downloadExcelSheet('Peer review by reviewer', PEER_REVIEWER_COLUMNS, peerReviewerSheet(reviewerRows, postUrl), `ucd-blog-peer-reviewers-${moduleId}-${new Date().toISOString().slice(0, 10)}.xlsx`); toast('Excel file downloaded.'); } catch (err) { toast(err.message, 'error'); } finally { e.target.disabled = false; } };
  }
  target.querySelectorAll('[data-view]').forEach(a => a.onclick = e => { e.preventDefault(); view = a.dataset.view; target.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('active', x === a)); drawTable(); });
  drawTable();

  // ---- the AI stage ----
  const call = (s, opts) => s.provider === 'demo' ? demoCall(opts) : callProvider(s.provider, {apiKey: s.apiKey, model: s.model, effort: s.effort, ...opts});
  const ready = () => { const s = selection(); if (!s.model) { toast('Choose a model on the AI grading page first.', 'error'); return null; } if (s.provider !== 'demo' && !s.apiKey) { toast(`Save your ${s.name} API key on the AI grading page first.`, 'error'); return null; } return s; };
  const modelLabel = s => [s.provider, s.model, s.effort].filter(Boolean).join(' · ');
  const busy = (sel, on) => target.querySelector(sel)?.classList.toggle('row-busy', on);
  async function synthesiseOne(r, s) {
    busy(`tr[data-post="${r.postId}"]`, true);
    try {
      const full = await store.getPost(r.postId), built = buildSynthesis({prompts, persona, row: r, post: full || r.post, blog, module});
      const out = await call(s, {system: built.system, user: built.user, schema: built.schema});
      if (!out.text) throw Error(`The model returned no text${out.stop ? ` (${out.stop})` : ''}.`);
      const parsed = parseSynthesis(out.text);
      const saved = await store.saveAiReview(r.postId, {postId: r.postId, moduleId, blogId: module.blogId || '', authorId: r.authorId, peerSynthesis: parsed.feedback.slice(0, 20000), peerSummary: parsed.summary.slice(0, 4000), peerSuggestedGrade: parsed.grade, peerSynthesisAt: Date.now(), peerSynthesisModel: modelLabel(s), peerSynthesisRaw: parsed.raw.slice(0, 40000), peerSynthesisError: ''});
      Object.assign(r, {synthesis: saved.peerSynthesis || '', suggestedGrade: saved.peerSuggestedGrade ?? null, synthesisAt: saved.peerSynthesisAt, synthesisModel: saved.peerSynthesisModel || ''});
    } catch (e) { await store.saveAiReview(r.postId, {postId: r.postId, moduleId, blogId: module.blogId || '', authorId: r.authorId, peerSynthesisError: String(e.message).slice(0, 2000)}).catch(() => {}); throw e; }
    finally { busy(`tr[data-post="${r.postId}"]`, false); const tr = target.querySelector(`tr[data-post="${r.postId}"]`); if (tr) tr.outerHTML = postRow(r); }
  }
  async function scoreOne(r, s) {
    busy(`tr[data-reviewer="${r.reviewerUid}"]`, true);
    try {
      const built = buildReviewerAssessment({prompts, persona, row: r, blog, module, postText: p => p?.text || htmlToText(p?.body || '')});
      const out = await call(s, {system: built.system, user: built.user, schema: built.schema});
      if (!out.text) throw Error(`The model returned no text${out.stop ? ` (${out.stop})` : ''}.`);
      const parsed = parseReviewerAssessment(out.text), done = r.items.filter(x => x.grade != null);
      const saved = await store.savePeerReviewerNote(moduleId, r.reviewerUid, {aiScore: parsed.score, aiNote: parsed.feedback.slice(0, 20000), aiPerReview: parsed.perReview.slice(0, done.length).map((x, i) => ({postId: done[i].postId, score: x.score, note: x.note})), aiScoredAt: Date.now(), aiModel: modelLabel(s), aiRaw: parsed.raw.slice(0, 40000), aiError: ''});
      Object.assign(r, {aiScore: saved.aiScore ?? null, aiNote: saved.aiNote || '', aiScoredAt: saved.aiScoredAt, aiModel: saved.aiModel || '', notes: saved});
    } catch (e) { await store.savePeerReviewerNote(moduleId, r.reviewerUid, {aiError: String(e.message).slice(0, 2000)}).catch(() => {}); throw e; }
    finally { busy(`tr[data-reviewer="${r.reviewerUid}"]`, false); const tr = target.querySelector(`tr[data-reviewer="${r.reviewerUid}"]`); if (tr) tr.outerHTML = reviewerRow(r); }
  }
  async function runMany(list, fn, what) {
    if (running) return toast('A batch is already running. Stop it first.', 'error');
    const s = ready(); if (!s || !list.length) return;
    if (!confirm(`Send ${list.length} ${what}${list.length === 1 ? '' : 's'} to ${s.name} (${s.model}, ${s.effort} effort)? Each is one request billed to your key.`)) return;
    stop = false; running = true; $('peer-stop').hidden = false; let done = 0, failed = 0;
    try { for (const r of list) { if (stop) break; $('peer-progress').textContent = `${done + failed + 1} of ${list.length}…`; try { await fn(r, s); done++; } catch (e) { failed++; console.warn(e); } await new Promise(res => setTimeout(res, 300)); } }
    finally { running = false; $('peer-stop').hidden = true; $('peer-progress').textContent = `${done} done${failed ? `, ${failed} failed` : ''}${stop ? ' (stopped)' : ''}.`; }
  }

  // ---- the admin's own grades, feedback, notes and releases ----
  const saveFinal = async (r, patch) => { const st = target.querySelector(`[data-final-status="${r.postId}"]`); try { const saved = await store.saveAiReview(r.postId, {postId: r.postId, moduleId, blogId: module.blogId || '', authorId: r.authorId, ...patch, finalEditedAt: Date.now()}); Object.assign(r, {finalGrade: saved.finalGrade ?? '', finalFeedback: saved.finalFeedback || ''}); if (st) st.textContent = 'Saved ' + fmtDateTime(saved.finalEditedAt); } catch (e) { if (st) st.textContent = 'Not saved: ' + e.message; toast(e.message, 'error'); } };
  const saveNote = async (r, patch) => { const st = target.querySelector(`[data-note-status="${r.reviewerUid}"]`); try { const saved = await store.savePeerReviewerNote(moduleId, r.reviewerUid, patch); Object.assign(r, {grade: saved.grade ?? '', note: saved.note || '', notes: saved}); if (st) st.textContent = 'Saved ' + fmtDateTime(saved.updatedAt); const rb = target.querySelector(`[data-release-note="${r.reviewerUid}"]`); if (rb) rb.disabled = !(r.grade || r.note); } catch (e) { if (st) st.textContent = 'Not saved: ' + e.message; toast(e.message, 'error'); } };
  if (target._peerChange) target.removeEventListener('change', target._peerChange);
  if (target._peerClick) target.removeEventListener('click', target._peerClick);
  target.addEventListener('change', target._peerChange = e => {
    const g = e.target.closest('[data-final-grade]'); if (g) return saveFinal(byPost.get(g.dataset.finalGrade), {finalGrade: g.value.trim().slice(0, 20)});
    const t = e.target.closest('[data-final-text]'); if (t) return saveFinal(byPost.get(t.dataset.finalText), {finalFeedback: t.value.trim().slice(0, 20000)});
    const rg = e.target.closest('[data-reviewer-grade]'); if (rg) return saveNote(byReviewer.get(rg.dataset.reviewerGrade), {grade: rg.value.trim().slice(0, 20)});
    const rn = e.target.closest('[data-reviewer-note]'); if (rn) return saveNote(byReviewer.get(rn.dataset.reviewerNote), {note: rn.value.trim().slice(0, 20000)});
  });
  target.addEventListener('click', target._peerClick = async e => {
    const b = e.target.closest('[data-synth],[data-use-synth],[data-release],[data-score],[data-use-note],[data-release-note]'); if (!b) return;
    const d = b.dataset;
    if (d.synth !== undefined || d.useSynth !== undefined || d.release !== undefined) {
      const r = byPost.get(d.synth || d.useSynth || d.release); if (!r) return;
      if (d.synth !== undefined) { if (running) return toast('A batch is already running.', 'error'); const s = ready(); if (!s) return; b.disabled = true; try { await synthesiseOne(r, s); toast(`Synthesised: suggested ${grade(r.suggestedGrade)} / 10.`); } catch (err) { toast(err.message, 'error'); } finally { b.disabled = false; } }
      else if (d.useSynth !== undefined) { const area = target.querySelector(`[data-final-text="${r.postId}"]`); if (area.value.trim() && !confirm('Replace your final feedback with the synthesis?')) return; area.value = r.synthesis; await saveFinal(r, {finalFeedback: r.synthesis.slice(0, 20000)}); }
      else { if (!r.finalFeedback && !r.synthesis && !confirm('No final feedback and no synthesis yet: release the average and the anonymous reviews only?')) return; try { await store.releasePeerSummaries([{...summaryFor(r), moduleId}]); toast('Released to the author.'); redraw(); } catch (err) { toast(err.message, 'error'); } }
    } else {
      const r = byReviewer.get(d.score || d.useNote || d.releaseNote); if (!r) return;
      if (d.score !== undefined) { if (running) return toast('A batch is already running.', 'error'); const s = ready(); if (!s) return; b.disabled = true; try { await scoreOne(r, s); toast(`Assessed: ${grade(r.aiScore)} / 10.`); } catch (err) { toast(err.message, 'error'); } finally { b.disabled = false; } }
      else if (d.useNote !== undefined) { const area = target.querySelector(`[data-reviewer-note="${r.reviewerUid}"]`); if (area.value.trim() && !confirm('Replace your note with the AI assessment?')) return; area.value = r.aiNote; await saveNote(r, {note: r.aiNote.slice(0, 20000)}); }
      else { try { await store.savePeerReviewerNote(moduleId, r.reviewerUid, {releasedAt: Date.now()}); toast('Released to the student.'); redraw(); } catch (err) { toast(err.message, 'error'); } }
    }
  });
}

// The local prototype's stand-in for a model: a reply shaped like the real one, from the input itself.
async function demoCall({user, schema}) {
  await new Promise(r => setTimeout(r, 300));
  const ratings = [...user.matchAll(/rating(?: given)?:? (\d+(?:\.\d+)?)\/10/g)].map(m => +m[1]), avg = ratings.length ? ratings.reduce((s, x) => s + x, 0) / ratings.length : 7;
  const text = schema?.properties?.perReview
    ? JSON.stringify({score: Math.round(Math.min(10, 5 + ratings.length) * 10) / 10, feedback: `Demo assessment. Your ${ratings.length} reviews read the posts and name specific strengths; next time, tie each rating more explicitly to the brief's criteria and give one concrete improvement per post.`, perReview: ratings.map(r => ({score: Math.min(10, r + 1), note: 'Demo: specific and fair'}))})
    : JSON.stringify({grade: Math.round(avg * 10) / 10, summary: `Demo summary: ${ratings.length} reviewers broadly agree on the post's strengths.`, feedback: `Demo feedback. Your post is clearly structured and your reviewers valued its analysis; they would like stronger evidence from top outlets and more concrete recommendations for the next two years.`});
  return {text, usage: {input: Math.round(user.length / 4), output: Math.round(text.length / 4)}, stop: 'end_turn', model: 'demo'};
}
