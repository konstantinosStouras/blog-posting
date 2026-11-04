// Picks the backend once: Firebase when firebase-config.js is filled in, otherwise local.
import {firebaseEnabled} from './firebase-config.js';
import {local} from './backend-local.js';

let backend = local;
const listeners = new Set(), emit = why => listeners.forEach(fn => fn(why));
const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };

export async function initStore() {
  // Older builds persisted private drafts and peer reviews alongside the previous identity.
  try { localStorage.removeItem('ucd-blog:snapshot'); } catch {}
  backend = firebaseEnabled() ? (await import('./backend-firebase.js')).firebase : local;
  await backend.init();
  backend.onChange(emit);
  return backend;
}

// A staff preview ("View as Student", "View as Instructor X"; set by auth.js) is a
// view of this browser tab only: the backend still acts as the real account. So
// while one is on, every write is refused and "my modules" is narrowed to what the
// previewed person would have, which is what steers the home page and the writer.
let preview = null;
export const setStorePreview = p => { preview = p; access = null; };
const WRITES = new Set(['register', 'completeRegistration', 'saveBlog', 'saveModule', 'deleteModule', 'joinModule', 'createModuleInvite', 'revokeModuleInvite', 'createTeacherInvite', 'revokeTeacherInvite', 'acceptTeacherInvite',
  'editComment', 'saveWritingHistory', 'savePost', 'deletePost', 'deletePosts', 'slimPosts', 'votePoll', 'toggleLike', 'toggleCommentLike', 'toggleBookmark', 'addComment', 'deleteComment', 'saveGraderConfig', 'saveAiReview', 'savePeerRound', 'assignPeerReviews', 'submitPeerReview', 'savePeerReview', 'deletePeerRound', 'savePeerReviewerNote', 'releasePeerSummaries', 'savePeerPrompts', 'saveProfile', 'setRole', 'removeMember', 'deleteModuleInvite', 'deleteTeacherInvite', 'deleteAccount', 'updateFeedback', 'deleteFeedback', 'saveSettings', 'resetDemo']);
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
function allowed() {
  return access ||= loadAccess();
}
async function loadAccess() {
  const activePreview = preview;
  const u = backend.currentUser();
  if (!u) return {all: false, visitor: true, blogs: new Set(), modules: new Set(), ownedBlogs: new Set()};
  if (u.role === 'admin' && !activePreview) return {all: true, blogs: new Set(), modules: new Set(), ownedBlogs: new Set()};
  const ownedBlogs = new Set(activePreview ? (activePreview.kind === 'instructor' ? activePreview.blogIds || [] : []) : u.managedBlogIds || []);
  const blogs = new Set(ownedBlogs), modules = new Set();
  let mine = []; try { mine = await backend.listMyModules(); } catch {}
  for (const m of activePreview ? scopeModules(mine, activePreview) : mine) { modules.add(m.id); if (m.blogId) blogs.add(m.blogId); }
  const uid = activePreview ? (activePreview.kind === 'instructor' ? activePreview.uid : null) : u.uid;
  const taught = new Set((activePreview ? scopeModules(mine, activePreview) : mine).filter(m => m.teaching).map(m => m.id));
  return {all: false, blogs, modules, ownedBlogs, taught, uid};
}
// A blog's canvas and its published posts are public: anyone with the link, signed in or not,
// reads every published post on the blog (never a draft, a comment or the brief), whatever
// module they belong to. The brief, the comments and the unpublished posts stay within reach of
// the module: its members, its staff and the blog's owners.
export const memberOfBlog = async id => { const a = await allowed(); return a.all || a.blogs.has(id); };
const reads = (a, x) => !!x && (a.modules.has(x.moduleId) || a.ownedBlogs.has(x.blogId));   // a post, or a comment (which carries its post's module and blog)
const readsPost = (a, p) => !!p && (p.status === 'published' || (!a.visitor && (p.authorId === a.uid || a.taught.has(p.moduleId) || a.ownedBlogs.has(p.blogId))));
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
  const call = v.bind(backend);
  if (SCOPED[k]) return async (...a) => { const [out, acc] = await Promise.all([call(...a), allowed()]); return acc.all ? out : SCOPED[k](out, acc); };
  if (preview && WRITES.has(k)) return async () => { throw Error('You are viewing the site as someone else. Close the preview (× in the account menu) to make changes.'); };
  if (preview && k === 'listMyModules') return async (...a) => scopeModules(await call(...a), preview);
  return call;
}});
