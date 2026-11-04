// Picks the backend once: Firebase when firebase-config.js is filled in, otherwise local.
import {firebaseEnabled} from './firebase-config.js';
import {local} from './backend-local.js';

let backend = local;
// Who hears of changes (app.js redraws): the store's own list, so that it outlives the
// switch from the snapshot to the real backend below. The backend's notify feeds it.
const listeners = new Set(), emit = why => listeners.forEach(fn => fn(why));
const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };

// ---------- the snapshot: the first page before Firebase has started ----------
// Firebase takes a third to half a second to start (the SDK opens its store on disk and
// confirms the sign-in with Google's servers) before even a cached read can be answered,
// and "Loading…" stood in the main area for all of it. So the raw answers the backend gave
// on the last visit (each read's rows, the account and the site settings) are kept in
// localStorage under the build's cache stamp, and on the next visit the first page is
// drawn from them the moment the code runs. Firebase starts behind it; once it is ready,
// every answer that page used is asked again (from the cache on disk and then the server,
// backend-firebase.js) and compared, the account included, and the page is redrawn in
// place if anything differs ('refresh'). A read the snapshot cannot answer, and every
// write, waits for Firebase as before; a first visit has no snapshot. Another account on
// the same browser starts a snapshot of its own (record), and sign-out leaves a visitor's.
const STAMP = new URL(import.meta.url).searchParams.get('v') || 'dev';
const SNAP = 'ucd-blog:snapshot', SNAP_MAX = 2000000;   // characters; localStorage holds about five million
const RECORDED = new Set(['listModules', 'getModule', 'listBlogs', 'getBlog', 'listMyModules', 'listMyBlogs', 'listPosts', 'listAllPosts', 'getPost', 'getPostBySlug', 'listComments', 'recentComments', 'listLikes', 'listBookmarks', 'listMyPeerReviews', 'getPeerSummary', 'getPeerReview', 'getPeerRound']);
const shape = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const callKey = (k, a) => k + '|' + JSON.stringify(a);
let answers = new Map(), recordedUid = null, recording = false, saveTimer = 0;   // answers: callKey -> {t, out}
const loadSnapshot = () => { try { const s = JSON.parse(localStorage.getItem(SNAP)); return s && s.v === STAMP && s.answers ? s : null; } catch { return null; } };
function record(k, a, out) {
  const uid = backend.currentUser()?.uid || '';
  if (uid !== recordedUid) { answers.clear(); recordedUid = uid; }   // another account: nothing of the last one's is kept
  answers.set(callKey(k, a), {t: Date.now(), out});
  clearTimeout(saveTimer); saveTimer = setTimeout(saveSnapshot, 500);
}
addEventListener('pagehide', () => { if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; saveSnapshot(); } });   // a visit shorter than the wait above still leaves its snapshot
function saveSnapshot() {
  const body = {v: STAMP, uid: recordedUid, user: backend.currentUser(), settings: backend.settings(), answers: Object.fromEntries(answers)};
  let text = JSON.stringify(body);
  const oldest = [...answers].sort((a, b) => a[1].t - b[1].t);   // over the cap, the answers least recently given go first
  while (text.length > SNAP_MAX && oldest.length) { const [k] = oldest.shift(); delete body.answers[k]; answers.delete(k); text = JSON.stringify(body); }
  try { localStorage.setItem(SNAP, text); } catch {}
}
// The backend the first page is drawn from: the snapshot's answers for the reads it holds,
// Firebase (once started) for everything else.
let ready = null;   // resolves to the real backend
const replay = (s, used) => new Proxy({}, {get: (_, k) => {
  if (typeof k !== 'string' || k === 'then' || k === 'toJSON') return undefined;   // a promise resolving to this backend must not take it for a thenable
  if (k === 'mode') return 'firebase';
  if (k === 'currentUser') return () => s.user;
  if (k === 'settings') return () => s.settings;
  if (k === 'painted') return () => {};   // the real backend hears it once it has caught up
  return (...a) => {
    const id = callKey(k, a);
    if (RECORDED.has(k) && id in s.answers) { used.set(id, [k, a]); return Promise.resolve(s.answers[id].out); }
    return ready.then(b => b[k](...a));
  };
}});

export async function initStore() {
  if (!firebaseEnabled()) { await local.init(); backend = local; backend.onChange(emit); return backend; }
  const start = (async () => { const m = await import('./backend-firebase.js'); await m.firebase.init(); return m.firebase; })();
  const snapshot = loadSnapshot();
  if (snapshot) { answers = new Map(Object.entries(snapshot.answers)); recordedUid = snapshot.uid; }
  if (!snapshot) {
    try { backend = await start; }
    catch (e) { console.error('Firebase failed to load; falling back to local mode.', e); await local.init(); backend = local; }
    backend.onChange(emit); recording = backend.mode === 'firebase'; return backend;
  }
  const used = new Map();
  ready = start; backend = replay(snapshot, used);
  start.then(async real => {
    // The real backend answers from here on (the account and a sign-in made meanwhile included);
    // its reads are still from the cache on disk first while the first page is compared.
    backend = real; recording = true; real.onChange(emit);
    let changed = shape(real.currentUser()) !== shape(snapshot.user) || shape(real.settings()) !== shape(snapshot.settings);
    for (const [id, [k, a]] of used) { try { if (shape(await real[k](...a)) !== shape(snapshot.answers[id].out)) changed = true; } catch { changed = true; } }
    if (changed) emit('refresh');
    real.painted();   // the first page is up: reads go to the server from here on, and what the server changed redraws it
  }).catch(e => { console.error('Firebase failed to start behind the snapshot page.', e); });
  return backend;
}

// A staff preview ("View as Student", "View as Instructor X"; set by auth.js) is a
// view of this browser tab only: the backend still acts as the real account. So
// while one is on, every write is refused and "my modules" is narrowed to what the
// previewed person would have, which is what steers the home page and the writer.
let preview = null;
export const setStorePreview = p => { preview = p; access = null; };
const WRITES = new Set(['register', 'completeRegistration', 'saveBlog', 'saveModule', 'deleteModule', 'joinModule', 'createModuleInvite', 'revokeModuleInvite', 'createTeacherInvite', 'revokeTeacherInvite', 'acceptTeacherInvite',
  'saveWritingHistory', 'savePost', 'deletePost', 'deletePosts', 'slimPosts', 'votePoll', 'toggleLike', 'toggleCommentLike', 'toggleBookmark', 'addComment', 'deleteComment', 'saveGraderConfig', 'saveAiReview', 'savePeerRound', 'assignPeerReviews', 'submitPeerReview', 'savePeerReview', 'deletePeerRound', 'savePeerReviewerNote', 'releasePeerSummaries', 'savePeerPrompts', 'saveProfile', 'setRole', 'updateFeedback', 'deleteFeedback', 'saveSettings', 'resetDemo']);
const scopeModules = (rows, p) => p.kind === 'student' ? rows.filter(m => m.id === p.moduleId).map(m => ({...m, teaching: false})) : rows.filter(m => (m.teacherIds || []).includes(p.uid)).map(m => ({...m, teaching: true}));
// Who may read what. Signed out: every blog's canvas (its title, description and the modules
// writing on it; the blogs and modules collections are public) and the published posts of any
// blog whose link they have, but no draft, comment or brief. Signed in, everyone reads the
// published posts too; beyond them a student reaches the comments of the module(s) they belong
// to, an instructor the drafts and comments of the modules they teach and of the blogs they own.
// The admin: everything.
// Reads that return content are narrowed here, so every page, the search, the footer and the
// canvas see the same world; firestore.rules enforces the same scope on the database. Decided
// afresh on every navigation.
let access = null;
export const resetAccess = () => { access = null; };
async function allowed() {
  if (access) return access;
  const u = backend.currentUser();
  if (!u) return access = {all: false, visitor: true, blogs: new Set(), modules: new Set(), ownedBlogs: new Set()};
  if (u.role === 'admin' && !preview) return access = {all: true, blogs: new Set(), modules: new Set(), ownedBlogs: new Set()};
  const ownedBlogs = new Set(preview ? (preview.kind === 'instructor' ? preview.blogIds || [] : []) : u.managedBlogIds || []);
  const blogs = new Set(ownedBlogs), modules = new Set();
  let mine = []; try { mine = await backend.listMyModules(); } catch {}
  for (const m of preview ? scopeModules(mine, preview) : mine) { modules.add(m.id); if (m.blogId) blogs.add(m.blogId); }
  return access = {all: false, blogs, modules, ownedBlogs};
}
// A blog's canvas and its published posts are public: anyone with the link, signed in or not,
// reads every published post on the blog (never a draft, a comment or the brief), whatever
// module they belong to. The brief, the comments and the unpublished posts stay within reach of
// the module: its members, its staff and the blog's owners.
export const memberOfBlog = async id => { const a = await allowed(); return a.all || a.blogs.has(id); };
const reads = (a, x) => !!x && (a.modules.has(x.moduleId) || a.ownedBlogs.has(x.blogId));   // a post, or a comment (which carries its post's module and blog)
const readsPost = (a, p) => !!p && (p.status === 'published' || (!a.visitor && reads(a, p)));
const SCOPED = {
  listBlogs: (rows, a) => a.visitor ? rows : rows.filter(b => a.blogs.has(b.id)),
  listPosts: (rows, a) => rows.filter(p => readsPost(a, p)),
  listAllPosts: (rows, a) => rows.filter(p => readsPost(a, p)),
  listComments: (rows, a) => rows.filter(c => reads(a, c)),
  recentComments: (rows, a) => rows.filter(c => reads(a, c)),
  getPost: (p, a) => readsPost(a, p) ? p : null,
  getPostBySlug: (p, a) => readsPost(a, p) ? p : null,
};
export const store = new Proxy({}, {get: (_, k) => {
  if (k === 'onChange') return subscribe;
  const v = backend[k];
  if (typeof v !== 'function') return v;
  // A read's raw answer is kept for the next visit's first page (the snapshot above).
  const call = (...a) => { const p = v.apply(backend, a); return recording && RECORDED.has(k) ? p.then(out => { record(k, a, out); return out; }) : p; };
  if (SCOPED[k]) return async (...a) => { const [out, acc] = await Promise.all([call(...a), allowed()]); return acc.all ? out : SCOPED[k](out, acc); };
  if (preview && WRITES.has(k)) return async () => { throw Error('You are viewing the site as someone else. Close the preview (× in the account menu) to make changes.'); };
  if (preview && k === 'listMyModules') return async (...a) => scopeModules(await call(...a), preview);
  return RECORDED.has(k) ? call : v.bind(backend);
}});
