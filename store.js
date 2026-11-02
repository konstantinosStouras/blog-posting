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
export const setStorePreview = p => { preview = p; };
const WRITES = new Set(['register', 'completeRegistration', 'saveBlog', 'saveModule', 'joinModule', 'createModuleInvite', 'revokeModuleInvite', 'createTeacherInvite', 'revokeTeacherInvite', 'acceptTeacherInvite',
  'saveWritingHistory', 'savePost', 'deletePost', 'votePoll', 'toggleLike', 'addComment', 'deleteComment', 'saveGraderConfig', 'saveAiReview', 'saveProfile', 'setRole', 'updateFeedback', 'deleteFeedback', 'saveSettings', 'resetDemo']);
const scopeModules = (rows, p) => p.kind === 'student' ? rows.filter(m => m.id === p.moduleId).map(m => ({...m, teaching: false})) : rows.filter(m => (m.teacherIds || []).includes(p.uid)).map(m => ({...m, teaching: true}));
export const store = new Proxy({}, {get: (_, k) => {
  const v = backend[k];
  if (typeof v !== 'function') return v;
  if (preview && WRITES.has(k)) return async () => { throw Error('You are viewing the site as someone else. Close the preview (× in the account menu) to make changes.'); };
  if (preview && k === 'listMyModules') return async (...a) => scopeModules(await v.apply(backend, a), preview);
  return v.bind(backend);
}});
