// LOCAL MODE backend: everything lives in this browser's localStorage, seeded with
// sample content. Same API surface as backend-firebase.js so the pages never know.
import {SEED_USERS, SEED_POSTS, SEED_COMMENTS, DEFAULT_SETTINGS} from './seed.js';
import {newId, slugify, wordCount, excerptOf} from './util.js';

const KEY = 'ucd-blog.v1', VIEW = 'ucd-blog.viewAs';
let state, listeners = new Set();

function fresh() {
  return {users: structuredClone(SEED_USERS), posts: structuredClone(SEED_POSTS), comments: structuredClone(SEED_COMMENTS), settings: structuredClone(DEFAULT_SETTINGS)};
}
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.posts)) return {...fresh(), ...s, settings: {...DEFAULT_SETTINGS, ...s.settings}}; } catch {}
  return fresh();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { console.warn('localStorage unavailable; changes last for this session only.'); }
  listeners.forEach(fn => fn());
}
const delay = v => new Promise(r => setTimeout(() => r(v), 30)); // keeps the pages honest about async

export const local = {
  mode: 'local',
  async init() { state = load(); return state.settings; },
  settings: () => state.settings,
  onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },

  // ---- auth stand-in: "View as" ----
  currentUser() { const uid = localStorage.getItem(VIEW); return state.users.find(u => u.uid === uid) || null; },
  viewAs(uid) { if (uid) localStorage.setItem(VIEW, uid); else localStorage.removeItem(VIEW); listeners.forEach(fn => fn()); },
  users: () => state.users,

  // ---- posts ----
  async listPosts(f = {}) {
    let p = state.posts;
    if (f.status) p = p.filter(x => x.status === f.status);
    if (f.authorId) p = p.filter(x => x.authorId === f.authorId);
    return delay(structuredClone(p));
  },
  async getPost(id) { return delay(structuredClone(state.posts.find(p => p.id === id) || null)); },
  async getPostBySlug(slug) { return delay(structuredClone(state.posts.find(p => p.slug === slug) || null)); },
  async savePost(post, user) {
    const now = Date.now();
    let existing = post.id ? state.posts.find(p => p.id === post.id) : null;
    const doc = {...(existing || {createdAt: now, authorId: user.uid}), ...post, id: existing?.id || post.id || newId(), updatedAt: now};
    doc.authorName = state.users.find(u => u.uid === doc.authorId)?.penName || doc.authorName || 'anonymous';
    doc.slug = uniqueSlug(doc.slug || slugify(doc.title), doc.id);
    doc.wordCount = wordCount(doc.body); doc.excerpt = doc.excerpt || excerptOf(doc.body);
    if (doc.status === 'published' && !doc.publishedAt) doc.publishedAt = now;
    if (doc.status !== 'published') doc.publishedAt = existing?.status === 'published' ? existing.publishedAt : doc.publishedAt || null;
    if (existing) Object.assign(existing, doc); else state.posts.unshift(doc);
    save(); return structuredClone(doc);
  },
  async deletePost(id) { state.posts = state.posts.filter(p => p.id !== id); state.comments = state.comments.filter(c => c.postId !== id); save(); },

  // ---- comments ----
  async listComments(postId) { return delay(structuredClone(state.comments.filter(c => c.postId === postId).sort((a, b) => a.createdAt - b.createdAt))); },
  async recentComments(n = 5) { return delay(structuredClone([...state.comments].sort((a, b) => b.createdAt - a.createdAt).slice(0, n))); },
  async addComment({postId, body}, user) {
    const c = {id: newId(), postId, body, authorId: user.uid, authorName: user.penName, createdAt: Date.now()};
    state.comments.push(c); save(); return c;
  },
  async deleteComment(id) { state.comments = state.comments.filter(c => c.id !== id); save(); },

  // ---- people ----
  async listUsers() { return delay(structuredClone(state.users)); },
  async getProfile(uid) { return delay(structuredClone(state.users.find(u => u.uid === uid) || null)); },
  async saveProfile(uid, patch) {
    const u = state.users.find(x => x.uid === uid); if (!u) throw Error('No such user.');
    Object.assign(u, patch);
    state.posts.forEach(p => { if (p.authorId === uid) p.authorName = u.penName; });
    state.comments.forEach(c => { if (c.authorId === uid) c.authorName = u.penName; });
    save(); return structuredClone(u);
  },
  async setRole(uid, role) { const u = state.users.find(x => x.uid === uid); if (u) { u.role = role; save(); } },

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
