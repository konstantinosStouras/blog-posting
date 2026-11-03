// LOCAL MODE backend: everything lives in this browser's localStorage, seeded with
// sample content. Same API surface as backend-firebase.js so the pages never know.
// Blogs (public canvases with their exercise), modules (cohorts attached to a blog),
// memberships, posts and comments are all here, so the design can be checked with
// `?local` on a dev server without touching the live database.
import {SEED_USERS, SEED_POSTS, SEED_COMMENTS, SEED_BLOGS, SEED_MODULES, SEED_MEMBERSHIPS, DEFAULT_SETTINGS, EMPTY_EXERCISE} from './seed.js';
import {newId, slugify, wordCount, excerptOf, isReservedUrlName, academicYearOf} from './util.js';
import {reviewId} from './peer-review-model.js';

const KEY = 'ucd-blog.v2', VIEW = 'ucd-blog.viewAs';
let state, listeners = new Set();

function fresh() {
  return {users: structuredClone(SEED_USERS), blogs: structuredClone(SEED_BLOGS), modules: structuredClone(SEED_MODULES), memberships: structuredClone(SEED_MEMBERSHIPS), posts: structuredClone(SEED_POSTS), comments: structuredClone(SEED_COMMENTS), likes: [{postId: 'p1', uid: 'u-s2'}, {postId: 'p1', uid: 'u-s3'}, {postId: 'p6', uid: 'u-s1'}], settings: structuredClone(DEFAULT_SETTINGS), grader: null, aiReviews: {}};
}
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.posts) && Array.isArray(s.blogs)) return {...fresh(), ...s, settings: {...DEFAULT_SETTINGS, ...s.settings}}; } catch {}
  return fresh();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { console.warn('localStorage unavailable; changes last for this session only.'); }
  listeners.forEach(fn => fn());
}
const delay = v => new Promise(r => setTimeout(() => r(v), 30)); // keeps the pages honest about async
const me = () => local.currentUser();
const staff = u => u && ['admin', 'lecturer'].includes(u.role);
const teaches = (u, x) => u && (u.role === 'admin' || (x.teacherIds || []).includes(u.uid));

export const local = {
  mode: 'local',
  async init() { state = load(); return state.settings; },
  settings: () => state.settings,
  onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },

  // ---- auth stand-in: "View as" ----
  currentUser() {
    const uid = localStorage.getItem(VIEW), u = state.users.find(x => x.uid === uid);
    if (!u) return null;
    return {...u, emailVerified: true, managedModuleIds: state.modules.filter(m => m.teacherIds.includes(uid)).map(m => m.id), managedBlogIds: state.blogs.filter(b => b.teacherIds.includes(uid)).map(b => b.id)};
  },
  viewAs(uid) { if (uid) localStorage.setItem(VIEW, uid); else localStorage.removeItem(VIEW); listeners.forEach(fn => fn()); },
  users: () => state.users,

  // ---- blogs: a public canvas plus the exercise written on it ----
  async listBlogs() { return delay(structuredClone(state.blogs).sort((a, b) => a.title.localeCompare(b.title))); },
  async getBlog(id) { return delay(structuredClone(state.blogs.find(b => b.id === id) || null)); },
  async listMyBlogs() { const u = me(); return delay(structuredClone(state.blogs.filter(b => teaches(u, b)))); },
  async saveBlog(data) {
    const u = me(); if (!staff(u)) throw Error('Instructor access required.');
    const id = data.id || slugify(data.urlName || data.title);
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(id)) throw Error('Choose a URL name of 2–80 lowercase letters, numbers or hyphens.');
    if (!data.id && isReservedUrlName(id)) throw Error('That URL name is taken by a page of the site. Choose another.');
    const existing = state.blogs.find(b => b.id === id);
    if (!data.id && existing) throw Error('That blog URL already exists. Choose another.');
    if (existing && !teaches(u, existing)) throw Error('You cannot edit this blog.');
    const doc = {...EMPTY_EXERCISE, ...(existing || {createdBy: u.uid, createdAt: Date.now(), teacherIds: [u.uid], allowComments: true}), ...data, id, updatedAt: Date.now()};
    delete doc.urlName;
    if (!doc.title) throw Error('Enter a blog title.');
    if (existing) Object.assign(existing, doc); else state.blogs.push(doc);
    save(); return structuredClone(doc);
  },

  // ---- modules: cohorts with a roster, attached to one blog ----
  async listModules() { return delay(structuredClone(state.modules).sort((a, b) => a.title.localeCompare(b.title))); },
  async getModule(id) { return delay(structuredClone(state.modules.find(m => m.id === id) || null)); },
  async saveModule(data) {
    const u = me(); if (!staff(u)) throw Error('Instructor access required.');
    const existing = data.id ? state.modules.find(m => m.id === data.id) : null;
    if (data.id && !existing) throw Error('Module not found.');
    if (existing && !teaches(u, existing)) throw Error('You cannot manage this module.');
    let blogId = data.blogId;
    if (data.newBlog) blogId = (await this.saveBlog({title: data.newBlog.title, urlName: data.newBlog.urlName, description: data.description || ''})).id;
    const blog = state.blogs.find(b => b.id === blogId);
    if (!blog || !teaches(u, blog)) throw Error('Choose one of your own blogs for this module, or create a new one.');
    if (!existing && data.code && state.modules.some(m => m.code.toLowerCase() === String(data.code).trim().toLowerCase())) throw Error('A module with this code already exists. Open it from My modules instead: one module serves every academic year.');
    const id = existing?.id || uniqueId(state.modules, slugify(data.code || data.title));
    const doc = {...(existing || {createdBy: u.uid, createdAt: Date.now(), teacherIds: [u.uid], teacherName: [u.firstName, u.lastName].filter(Boolean).join(' ')}), id, title: String(data.title || '').trim(), code: String(data.code || '').trim(), description: String(data.description || '').trim(), blogId, submissionsOpen: data.submissionsOpen !== false, requireApproval: !!data.requireApproval, deadline: data.deadline || '', brightspaceUrl: String(data.brightspaceUrl || '').trim(), peerReview: u.role === 'admin' && 'peerReview' in data ? !!data.peerReview : !!existing?.peerReview, peerDeadline: u.role === 'admin' && 'peerDeadline' in data ? String(data.peerDeadline || '') : (existing?.peerDeadline || ''), updatedAt: Date.now()};
    if (!doc.title) throw Error('Enter a module title.');
    if (existing) Object.assign(existing, doc); else state.modules.push(doc);
    save(); return structuredClone(doc);
  },
  async listMyModules() {
    const u = me(); if (!u) return [];
    return delay(structuredClone(state.modules.filter(m => teaches(u, m) || state.memberships.some(x => x.uid === u.uid && x.moduleId === m.id)).map(m => ({...m, teaching: teaches(u, m)}))));
  },
  async joinModule(id) { const u = me(); if (!u) throw Error('Sign in to join a module.'); if (!state.memberships.some(x => x.uid === u.uid && x.moduleId === id)) { state.memberships.push({uid: u.uid, moduleId: id}); save(); } },
  async resolveRegistrationCode() { throw Error('Invitation codes exist only on the live platform.'); },
  // Sign-in exists only on the live platform; here "View as" stands in for it.
  async signIn() { throw Error('Sign-in exists only on the live platform. Use "View as" at the top right.'); },
  async register() { throw Error('Registration exists only on the live platform. Use "View as" at the top right.'); },
  async completeRegistration(data) { const u = me(); if (u) Object.assign(state.users.find(x => x.uid === u.uid), data); save(); return data; },
  async resetPassword() { throw Error('Password reset exists only on the live platform.'); },
  async resendVerification() {}, async refreshVerification() { return true; },
  async signOut() { this.viewAs(''); },
  async acceptTeacherInvite() { throw Error('Invitations exist only on the live platform.'); },
  async listModuleInvites() { return []; },
  async createModuleInvite() { throw Error('Invitations exist only on the live platform.'); },
  async revokeModuleInvite() {},
  async listTeacherInvites() { return []; },
  async createTeacherInvite() { throw Error('Invitations exist only on the live platform.'); },
  async revokeTeacherInvite() {},

  // ---- posts ----
  async listPosts(f = {}) {
    let p = state.posts;
    if (f.status) p = p.filter(x => x.status === f.status);
    if (f.authorId) p = p.filter(x => x.authorId === f.authorId);
    if (f.moduleId) p = p.filter(x => x.moduleId === f.moduleId);
    if (f.blogId) p = p.filter(x => x.blogId === f.blogId);
    return delay(structuredClone(p));
  },
  async listAllPosts() { const u = me(); return delay(structuredClone(state.posts.filter(p => u?.role === 'admin' || u?.managedModuleIds.includes(p.moduleId) || u?.managedBlogIds.includes(p.blogId)))); },
  async getPost(id) { return delay(structuredClone(state.posts.find(p => p.id === id) || null)); },
  async getPostBySlug(slug) { return delay(structuredClone(state.posts.find(p => p.slug === slug) || null)); },
  // The prototype keeps each post's text in the post itself, so nothing is ever "unsplit" here.
  async storageUsage() { const size = rows => JSON.stringify(rows || []).length; return {count: state.posts.length, inline: 0, posts: size(state.posts), images: state.posts.reduce((s, p) => s + (p.featuredImage || '').length, 0), comments: size(state.comments), writing: size(state.aiReviews)}; },
  async slimPosts() { return {done: 0, failed: 0}; },
  async savePost(post, user) {
    const now = Date.now();
    let existing = post.id ? state.posts.find(p => p.id === post.id) : null;
    const module = state.modules.find(m => m.id === (post.moduleId || existing?.moduleId));
    if (!module) throw Error('Choose a module before saving.');
    const doc = {...(existing || {createdAt: now, authorId: user.uid}), ...post, id: existing?.id || post.id || newId(), moduleId: module.id, blogId: module.blogId, updatedAt: now};
    doc.authorName = state.users.find(u => u.uid === doc.authorId)?.penName || doc.authorName || 'anonymous';
    doc.slug = uniqueSlug(existing?.publishedAt ? existing.slug : slugify(doc.title), doc.id);
    doc.wordCount = wordCount(doc.body); doc.excerpt = String(doc.excerpt || '').trim();
    if (doc.status === 'published' && !doc.publishedAt) doc.publishedAt = now;
    if (doc.status !== 'published') doc.publishedAt = existing?.status === 'published' ? existing.publishedAt : doc.publishedAt || null;
    doc.academicYear = existing?.publishedAt && existing.academicYear ? existing.academicYear : academicYearOf(doc.publishedAt || now);   // the cohort is the year the post went live in
    if (existing) Object.assign(existing, doc); else state.posts.unshift(doc);
    save(); return structuredClone(doc);
  },
  async deletePost(id) { return this.deletePosts([id]); },
  async deletePosts(ids) { const gone = new Set(ids); state.posts = state.posts.filter(p => !gone.has(p.id)); state.comments = state.comments.filter(c => !gone.has(c.postId)); state.likes = (state.likes || []).filter(l => !gone.has(l.postId)); state.votes = (state.votes || []).filter(v => !gone.has(v.postId)); state.bookmarks = (state.bookmarks || []).filter(b => !gone.has(b.postId)); save(); return []; },
  async pollVotes(postId, pollId, u) {
    const rows = (state.votes || []).filter(v => v.postId === postId && v.pollId === pollId), counts = {};
    for (const v of rows) counts[v.option] = (counts[v.option] || 0) + 1;
    return {counts, mine: rows.find(v => v.uid === u?.uid)?.option ?? null, total: rows.length};
  },
  async votePoll(postId, pollId, option, u) {
    state.votes = (state.votes || []).filter(v => !(v.postId === postId && v.pollId === pollId && v.uid === u.uid));
    state.votes.push({postId, pollId, uid: u.uid, option, t: Date.now()}); save();
    return this.pollVotes(postId, pollId, u);
  },
  async listLikes(postId) { return (state.likes || []).filter(l => l.postId === postId).map(l => l.uid); },
  async toggleLike(postId, u) {
    state.likes = state.likes || [];
    const i = state.likes.findIndex(l => l.postId === postId && l.uid === u.uid);
    if (i >= 0) state.likes.splice(i, 1); else state.likes.push({postId, uid: u.uid});
    save(); return {liked: i < 0, count: state.likes.filter(l => l.postId === postId).length};
  },

  // ---- bookmarks: two id lists on the reader's own profile, plus a marker per reader on the post for the count ----
  async listBookmarks(postId) { return (state.bookmarks || []).filter(b => b.postId === postId).map(b => b.uid); },
  async toggleBookmark(kind, id) {
    const u = me(); if (!u) throw Error('Sign in to bookmark.');
    const row = state.users.find(x => x.uid === u.uid), key = kind === 'comment' ? 'bookmarkedComments' : 'bookmarkedPosts';
    row[key] = row[key] || []; const i = row[key].indexOf(id);
    if (i >= 0) row[key].splice(i, 1); else row[key].push(id);
    let count = row[key].length;
    if (kind !== 'comment') {
      state.bookmarks = (state.bookmarks || []).filter(b => !(b.postId === id && b.uid === u.uid));
      if (i < 0) state.bookmarks.push({postId: id, uid: u.uid});
      count = state.bookmarks.filter(b => b.postId === id).length;
    }
    save(); return {on: i < 0, count};
  },

  // ---- comments ----
  async getComment(id) { return delay(structuredClone(state.comments.find(c => c.id === id) || null)); },
  async listComments(postId) { return delay(structuredClone(state.comments.filter(c => c.postId === postId).sort((a, b) => a.createdAt - b.createdAt))); },
  async recentComments(n = 5) { return delay(structuredClone([...state.comments].sort((a, b) => b.createdAt - a.createdAt).slice(0, n))); },
  // A reply names its parent (one level: a reply to a reply joins the same thread).
  async addComment({postId, body, parentId = ''}, user) {
    const post = state.posts.find(p => p.id === postId);
    const c = {id: newId(), postId, parentId: parentId || '', moduleId: post?.moduleId || '', blogId: post?.blogId || '', body, authorId: user.uid, authorName: user.penName, createdAt: Date.now(), likedBy: []};
    state.comments.push(c); save(); return c;
  },
  async deleteComment(id) { state.comments = state.comments.filter(c => c.id !== id && c.parentId !== id); save(); },   // a thread goes with its first comment
  async editComment(id, body, u) {
    const c = state.comments.find(x => x.id === id); if (!c) throw Error('Comment not found.');
    if (c.authorId !== u.uid) throw Error('You can only edit your own comments.');
    c.body = body; c.editedAt = Date.now(); save(); return structuredClone(c);
  },
  async toggleCommentLike(id, u) {
    const c = state.comments.find(x => x.id === id); if (!c) throw Error('Comment not found.');
    c.likedBy = c.likedBy || []; const i = c.likedBy.indexOf(u.uid);
    if (i >= 0) c.likedBy.splice(i, 1); else c.likedBy.push(u.uid);
    save(); return {liked: i < 0, count: c.likedBy.length};
  },

  // ---- people ----
  async listUsers(moduleId = '') { return delay(structuredClone(moduleId ? state.users.filter(u => state.memberships.some(x => x.uid === u.uid && x.moduleId === moduleId)) : state.users)); },
  async getProfile(uid) { return delay(structuredClone(state.users.find(u => u.uid === uid) || null)); },
  async saveProfile(uid, patch) {
    const u = state.users.find(x => x.uid === uid); if (!u) throw Error('No such user.');
    Object.assign(u, patch);
    state.posts.forEach(p => { if (p.authorId === uid) p.authorName = u.penName; });
    state.comments.forEach(c => { if (c.authorId === uid) c.authorName = u.penName; });
    save(); return structuredClone(u);
  },
  async setRole(uid, role) { const u = state.users.find(x => x.uid === uid); if (u) { u.role = role; save(); } },

  // ---- AI grading assistant (admin only) ----
  async getGraderConfig() { return delay(structuredClone(state.grader || null)); },
  async saveGraderConfig(cfg) { const u = me(); if (u?.role !== 'admin') throw Error('Admin access required.'); state.grader = {persona: String(cfg.persona || ''), instructions: String(cfg.instructions || ''), polish: String(cfg.polish || ''), updatedAt: Date.now(), updatedBy: u.uid}; save(); return structuredClone(state.grader); },
  async listAiReviews(moduleId = '') { const u = me(); if (u?.role !== 'admin') return []; return delay(structuredClone(Object.values(state.aiReviews || {}).filter(r => !moduleId || r.moduleId === moduleId))); },
  async saveAiReview(postId, patch) { const u = me(); if (u?.role !== 'admin') throw Error('Admin access required.'); state.aiReviews = state.aiReviews || {}; state.aiReviews[postId] = {...(state.aiReviews[postId] || {}), ...patch, postId, updatedAt: Date.now()}; save(); return structuredClone(state.aiReviews[postId]); },
  // ---- peer review (study guide 5.3): rounds, assignments, the reviews written on them, notes and released summaries ----
  async getPeerPrompts() { if (me()?.role !== 'admin') return null; return delay(structuredClone(state.peerPrompts || null)); },
  async savePeerPrompts(cfg) { const u = me(); if (u?.role !== 'admin') throw Error('Admin access required.'); state.peerPrompts = {synthesis: String(cfg.synthesis || ''), reviewer: String(cfg.reviewer || ''), noticeSubject: String(cfg.noticeSubject || ''), noticeBody: String(cfg.noticeBody || ''), updatedAt: Date.now(), updatedBy: u.uid}; save(); return structuredClone(state.peerPrompts); },
  async getPeerRound(moduleId) { return delay(structuredClone((state.peerRounds || {})[moduleId] || null)); },
  async savePeerRound(moduleId, patch) { const u = me(); if (u?.role !== 'admin') throw Error('Admin access required.'); state.peerRounds = state.peerRounds || {}; state.peerRounds[moduleId] = {...(state.peerRounds[moduleId] || {}), ...patch, id: moduleId, moduleId, updatedAt: Date.now(), updatedBy: u.uid}; save(); return structuredClone(state.peerRounds[moduleId]); },
  async assignPeerReviews(moduleId, rows) { const u = me(); if (u?.role !== 'admin') throw Error('Admin access required.'); state.peerReviews = state.peerReviews || {}; const now = Date.now(); for (const r of rows) { const id = reviewId(moduleId, r.postId, r.reviewerUid); state.peerReviews[id] = {id, moduleId, blogId: r.blogId || '', postId: r.postId, authorId: r.authorId, reviewerUid: r.reviewerUid, reviewerName: r.reviewerName || '', order: r.order || 0, assignedAt: now, grade: null, assessment: '', submittedAt: null, updatedAt: now}; } save(); },
  async listPeerReviews(moduleId) { if (me()?.role !== 'admin') return []; return delay(structuredClone(Object.values(state.peerReviews || {}).filter(r => r.moduleId === moduleId))); },
  async listMyPeerReviews() { const u = me(); if (!u) return []; return delay(structuredClone(Object.values(state.peerReviews || {}).filter(r => r.reviewerUid === u.uid))); },
  async getPeerReview(id) { const u = me(), r = (state.peerReviews || {})[id]; return delay(r && u && (r.reviewerUid === u.uid || u.role === 'admin') ? structuredClone(r) : null); },
  async submitPeerReview(id, {grade, assessment}) { const u = me(), r = (state.peerReviews || {})[id]; if (!u || !r || r.reviewerUid !== u.uid) throw Error('This post is not assigned to you.'); if ((state.peerRounds || {})[r.moduleId]?.status !== 'open') throw Error('The review round is closed.'); Object.assign(r, {grade, assessment, submittedAt: Date.now(), updatedAt: Date.now()}); save(); return structuredClone(r); },
  async savePeerReview(id, patch) { if (me()?.role !== 'admin') throw Error('Admin access required.'); const r = (state.peerReviews || {})[id]; if (!r) throw Error('Review not found.'); Object.assign(r, patch, {updatedAt: Date.now()}); save(); return structuredClone(r); },
  async deletePeerRound(moduleId) { if (me()?.role !== 'admin') throw Error('Admin access required.'); for (const k of ['peerReviews', 'peerReviewerNotes', 'peerSummaries']) state[k] = Object.fromEntries(Object.entries(state[k] || {}).filter(([, r]) => r.moduleId !== moduleId)); delete (state.peerRounds || {})[moduleId]; save(); },
  async savePeerReviewerNote(moduleId, reviewerUid, patch) { if (me()?.role !== 'admin') throw Error('Admin access required.'); state.peerReviewerNotes = state.peerReviewerNotes || {}; const id = `${moduleId}_${reviewerUid}`; state.peerReviewerNotes[id] = {...(state.peerReviewerNotes[id] || {}), ...patch, id, moduleId, reviewerUid, updatedAt: Date.now()}; save(); return structuredClone(state.peerReviewerNotes[id]); },
  async listPeerReviewerNotes(moduleId) { if (me()?.role !== 'admin') return []; return delay(structuredClone(Object.values(state.peerReviewerNotes || {}).filter(n => n.moduleId === moduleId))); },
  async getMyPeerReviewerNote(moduleId) { const u = me(); if (!u) return null; return delay(structuredClone((state.peerReviewerNotes || {})[`${moduleId}_${u.uid}`] || null)); },
  async releasePeerSummaries(rows) { if (me()?.role !== 'admin') throw Error('Admin access required.'); state.peerSummaries = state.peerSummaries || {}; const now = Date.now(); for (const r of rows) state.peerSummaries[r.postId] = {...r, id: r.postId, releasedAt: now, updatedAt: now}; save(); },
  async listPeerSummaries(moduleId) { if (me()?.role !== 'admin') return []; return delay(structuredClone(Object.values(state.peerSummaries || {}).filter(s => s.moduleId === moduleId))); },
  async getPeerSummary(postId) { const u = me(), s = (state.peerSummaries || {})[postId]; return delay(s && u && (s.authorId === u.uid || u.role === 'admin') ? structuredClone(s) : null); },

  // ---- feedback button (anyone submits; the admin reads) ----
  async submitFeedback(doc, attachments = []) { const id = newId(); state.feedback = state.feedback || []; state.feedback.push({id, ...doc, attachments: attachments.map((a, i) => ({id: String(i), ...a}))}); save(); return delay({id, ticket: doc.ticket}); },
  async listFeedback() { if (me()?.role !== 'admin') return []; return delay((state.feedback || []).map(({attachments, ...f}) => structuredClone(f)).sort((a, b) => b.createdAt - a.createdAt)); },
  async listFeedbackAttachments(id) { if (me()?.role !== 'admin') return []; return delay(structuredClone((state.feedback || []).find(f => f.id === id)?.attachments || [])); },
  async updateFeedback(id, patch) { if (me()?.role !== 'admin') throw Error('Admin access required.'); const f = (state.feedback || []).find(x => x.id === id); if (!f) throw Error('Not found.'); Object.assign(f, patch); save(); },
  async deleteFeedback(id) { if (me()?.role !== 'admin') throw Error('Admin access required.'); state.feedback = (state.feedback || []).filter(f => f.id !== id); save(); },

  // ---- site ----
  async saveSettings(patch) { Object.assign(state.settings, patch); save(); return state.settings; },
  async exportAll() { return structuredClone(state); },
  async resetDemo() { state = fresh(); localStorage.removeItem(VIEW); save(); },
};

function uniqueSlug(base, id) {
  let s = base, n = 2;
  while (state.posts.some(p => p.slug === s && p.id !== id)) s = base + '-' + n++;
  return s;
}
function uniqueId(list, base) {
  let s = base || 'module', n = 2;
  while (list.some(x => x.id === s)) s = base + '-' + n++;
  return s;
}
