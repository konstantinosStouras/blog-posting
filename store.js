// Picks the backend once: Firebase when firebase-config.js is filled in, otherwise local.
import {firebaseEnabled} from './firebase-config.js';
import {local} from './backend-local.js';

let backend = local;
export async function initStore() {
  if (firebaseEnabled()) {
    try { const m = await import('./backend-firebase.js'); backend = m.firebase; }
    catch (e) { console.error('Firebase failed to load; falling back to local mode.', e); backend = local; }
  }
  await backend.init();
  return backend;
}

// A staff preview ("View as Student", "View as Instructor X"; set by auth.js) is a
// view of this browser tab only: the backend still acts as the real account. So
// while one is on, every write is refused and "my modules" is narrowed to what the
// previewed person would have, which is what steers the home page and the writer.
let preview = null;
export const setStorePreview = p => { preview = p; access = null; };
const WRITES = new Set(['register', 'completeRegistration', 'saveBlog', 'saveModule', 'joinModule', 'createModuleInvite', 'revokeModuleInvite', 'createTeacherInvite', 'revokeTeacherInvite', 'acceptTeacherInvite',
  'saveWritingHistory', 'savePost', 'deletePost', 'votePoll', 'toggleLike', 'addComment', 'deleteComment', 'saveGraderConfig', 'saveAiReview', 'saveProfile', 'setRole', 'updateFeedback', 'deleteFeedback', 'saveSettings', 'resetDemo']);
const scopeModules = (rows, p) => p.kind === 'student' ? rows.filter(m => m.id === p.moduleId).map(m => ({...m, teaching: false})) : rows.filter(m => (m.teacherIds || []).includes(p.uid)).map(m => ({...m, teaching: true}));
// Who may read what. Signed out: nothing. A student: the blog(s) of the module(s) they
// belong to. An instructor: the blogs of their modules and the blogs they own. The admin:
// everything. Reads that return content are narrowed here, so every page, the search,
// the footer and the canvas see the same world. Decided afresh on every navigation.
let access = null;
export const resetAccess = () => { access = null; };
async function allowedBlogs() {
  if (access) return access;
  const u = backend.currentUser();
  if (!u) return access = {all: false, ids: new Set()};
  if (u.role === 'admin' && !preview) return access = {all: true, ids: new Set()};
  const ids = new Set(preview ? (preview.kind === 'instructor' ? preview.blogIds || [] : []) : u.managedBlogIds || []);
  let mine = []; try { mine = await backend.listMyModules(); } catch {}
  for (const m of preview ? scopeModules(mine, preview) : mine) if (m.blogId) ids.add(m.blogId);
  return access = {all: false, ids};
}
export const canReadBlog = async id => { const a = await allowedBlogs(); return a.all || a.ids.has(id); };
const SCOPED = {
  listBlogs: (rows, a) => rows.filter(b => a.ids.has(b.id)),
  listPosts: (rows, a) => rows.filter(p => a.ids.has(p.blogId)),
  listAllPosts: (rows, a) => rows.filter(p => a.ids.has(p.blogId)),
  recentComments: (rows, a) => rows.filter(c => !c.blogId || a.ids.has(c.blogId)),
  getPost: (p, a) => p && a.ids.has(p.blogId) ? p : null,
  getPostBySlug: (p, a) => p && a.ids.has(p.blogId) ? p : null,
};
export const store = new Proxy({}, {get: (_, k) => {
  const v = backend[k];
  if (typeof v !== 'function') return v;
  if (SCOPED[k]) return async (...a) => { const [out, acc] = await Promise.all([v.apply(backend, a), allowedBlogs()]); return acc.all ? out : SCOPED[k](out, acc); };
  if (preview && WRITES.has(k)) return async () => { throw Error('You are viewing the site as someone else. Close the preview (× in the account menu) to make changes.'); };
  if (preview && k === 'listMyModules') return async (...a) => scopeModules(await v.apply(backend, a), preview);
  return v.bind(backend);
}});
