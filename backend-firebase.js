// FIREBASE backend: Auth + Firestore, loaded from the CDN only when firebase-config.js
// holds a real config. Collections and the profile shape follow operationsacademia.org
// and stouras.com/lit:
//   profiles/{uid}          the account's own profile (owner read/write; staff read)
//   userDirectory/{uid}     roster row: name, email (pinned to the token), first, seen
//   registeredUsers/{uid}   contentless registration mark {t}
//   roles/{uid}             {role: student|lecturer|admin}, written by the admin only
//   posts/{id}, comments/{id}, settings/site
import {firebaseConfig, ADMIN_EMAIL} from './firebase-config.js';
import {DEFAULT_SETTINGS} from './seed.js';
import {newId, slugify, wordCount, excerptOf} from './util.js';

const V = '13.0.0', cdn = m => `https://www.gstatic.com/firebasejs/${V}/firebase-${m}.js`;
let app, auth, db, A, F, user = null, profile = null, role = 'student', settings = {...DEFAULT_SETTINGS};
const listeners = new Set(), notify = () => listeners.forEach(fn => fn());
const ts = v => (v && typeof v.toMillis === 'function') ? v.toMillis() : (v ?? null);
const norm = d => { const o = {id: d.id, ...d.data()}; for (const k of ['createdAt', 'updatedAt', 'publishedAt']) if (k in o) o[k] = ts(o[k]); return o; };

async function loadRole(uid, email, verified) {
  try { const snap = await F.getDoc(F.doc(db, 'roles', uid)); if (snap.exists() && snap.data().role) return snap.data().role; } catch {}
  return (verified && email === ADMIN_EMAIL) ? 'admin' : 'student';
}
async function ensureProfile(u) {
  const ref = F.doc(db, 'profiles', u.uid);
  const snap = await F.getDoc(ref);
  if (snap.exists()) return snap.data();
  const [firstName = '', ...rest] = (u.displayName || '').split(' ');
  const p = {firstName, lastName: rest.join(' '), penName: slugify(u.displayName || u.email?.split('@')[0] || 'student').replace(/-/g, '_').slice(0, 24) || 'student', affiliation: '', studentId: '', website: '', bio: '', contactEmail: u.email || '', photo: ''};
  await F.setDoc(ref, p);
  return p;
}
async function touchDirectory(u, p) {
  const ref = F.doc(db, 'userDirectory', u.uid);
  const snap = await F.getDoc(ref).catch(() => null);
  const row = {name: [p.firstName, p.lastName].filter(Boolean).join(' ') || p.penName, penName: p.penName, affiliation: p.affiliation || '', contactEmail: p.contactEmail || '', first: snap?.exists() ? snap.data().first : Date.now(), seen: Date.now()};
  if (u.email) row.email = u.email;
  await F.setDoc(ref, row).catch(() => {});
  await F.setDoc(F.doc(db, 'registeredUsers', u.uid), {t: Date.now()}).catch(() => {});
}

export const firebase = {
  mode: 'firebase',
  async init() {
    const [appM, authM, fsM] = await Promise.all([import(cdn('app')), import(cdn('auth')), import(cdn('firestore'))]);
    A = authM; F = fsM;
    app = appM.initializeApp(firebaseConfig); auth = A.getAuth(app); db = F.getFirestore(app);
    try { const s = await F.getDoc(F.doc(db, 'settings', 'site')); if (s.exists()) settings = {...DEFAULT_SETTINGS, ...s.data()}; } catch (e) { console.warn('settings', e); }
    await new Promise(resolve => {
      A.onAuthStateChanged(auth, async u => {
        user = u;
        if (u) { try { profile = await ensureProfile(u); role = await loadRole(u.uid, u.email, u.emailVerified); touchDirectory(u, profile); } catch (e) { console.warn(e); profile = profile || {penName: 'student'}; } }
        else { profile = null; role = 'student'; }
        notify(); resolve();
      });
    });
    return settings;
  },
  settings: () => settings,
  onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },

  // ---- auth ----
  currentUser() { return user ? {uid: user.uid, email: user.email || '', emailVerified: user.emailVerified, role, ...profile} : null; },
  async signIn(provider, {email, password} = {}) {
    if (provider === 'google.com') return A.signInWithPopup(auth, new A.GoogleAuthProvider());
    if (provider === 'password') return A.signInWithEmailAndPassword(auth, email, password);
    throw Error('Unknown sign-in method.');
  },
  async register({email, password, firstName, lastName, penName}) {
    const cred = await A.createUserWithEmailAndPassword(auth, email, password);
    await A.updateProfile(cred.user, {displayName: [firstName, lastName].filter(Boolean).join(' ')});
    await F.setDoc(F.doc(db, 'profiles', cred.user.uid), {firstName, lastName, penName: penName || slugify(firstName || email.split('@')[0]), affiliation: '', studentId: '', website: '', bio: '', contactEmail: email, photo: ''});
    try { await A.sendEmailVerification(cred.user); } catch {}
    return cred;
  },
  async resetPassword(email) { return A.sendPasswordResetEmail(auth, email); },
  async signOut() { await A.signOut(auth); },

  // ---- posts ----
  async listPosts(f = {}) {
    const col = F.collection(db, 'posts');
    let q;
    if (f.authorId) q = F.query(col, F.where('authorId', '==', f.authorId));
    else if (f.status) q = F.query(col, F.where('status', '==', f.status));
    else q = F.query(col, F.where('status', '==', 'published')); // staff list everything via listAll()
    const snap = await F.getDocs(q);
    let rows = snap.docs.map(norm);
    if (f.status) rows = rows.filter(p => p.status === f.status);
    return rows;
  },
  async listAllPosts() { const snap = await F.getDocs(F.collection(db, 'posts')); return snap.docs.map(norm); },
  async getPost(id) { const s = await F.getDoc(F.doc(db, 'posts', id)); return s.exists() ? norm(s) : null; },
  async getPostBySlug(slug) { const s = await F.getDocs(F.query(F.collection(db, 'posts'), F.where('slug', '==', slug), F.limit(1))); return s.empty ? null : norm(s.docs[0]); },
  async savePost(post, u) {
    const id = post.id || newId();
    const existing = post.id ? await this.getPost(id) : null;
    const now = Date.now();
    const doc = {...(existing || {createdAt: now, authorId: u.uid, featured: false}), ...post, updatedAt: now};
    delete doc.id;
    doc.authorName = existing && existing.authorId !== u.uid ? existing.authorName : (u.penName || 'student');
    doc.slug = doc.slug || slugify(doc.title);
    if (!existing || existing.slug !== doc.slug) { const clash = await this.getPostBySlug(doc.slug); if (clash && clash.id !== id) doc.slug += '-' + id.slice(0, 4); }
    doc.wordCount = wordCount(doc.body); doc.excerpt = doc.excerpt || excerptOf(doc.body);
    if (doc.status === 'published' && !doc.publishedAt) doc.publishedAt = now;
    if (doc.status !== 'published') doc.publishedAt = existing?.publishedAt || null;
    await F.setDoc(F.doc(db, 'posts', id), doc);
    notify(); return {id, ...doc};
  },
  async deletePost(id) {
    const cs = await F.getDocs(F.query(F.collection(db, 'comments'), F.where('postId', '==', id)));
    const b = F.writeBatch(db); cs.forEach(c => b.delete(c.ref)); b.delete(F.doc(db, 'posts', id)); await b.commit(); notify();
  },

  // ---- comments ----
  async listComments(postId) { const s = await F.getDocs(F.query(F.collection(db, 'comments'), F.where('postId', '==', postId))); return s.docs.map(norm).sort((a, b) => a.createdAt - b.createdAt); },
  async recentComments(n = 5) { const s = await F.getDocs(F.query(F.collection(db, 'comments'), F.orderBy('createdAt', 'desc'), F.limit(n))); return s.docs.map(norm); },
  async addComment({postId, body}, u) { const c = {postId, body, authorId: u.uid, authorName: u.penName || 'student', createdAt: Date.now()}; const ref = await F.addDoc(F.collection(db, 'comments'), c); notify(); return {id: ref.id, ...c}; },
  async deleteComment(id) { await F.deleteDoc(F.doc(db, 'comments', id)); notify(); },

  // ---- people (staff only, enforced by the rules) ----
  async listUsers() {
    const [dir, roles, profiles] = await Promise.all([F.getDocs(F.collection(db, 'userDirectory')), F.getDocs(F.collection(db, 'roles')), F.getDocs(F.collection(db, 'profiles'))]);
    const r = {}; roles.forEach(d => r[d.id] = d.data().role);
    const p = {}; profiles.forEach(d => p[d.id] = d.data());
    return dir.docs.map(d => ({uid: d.id, ...p[d.id], ...d.data(), role: r[d.id] || ((d.data().email === ADMIN_EMAIL) ? 'admin' : 'student')}));
  },
  async getProfile(uid) { const s = await F.getDoc(F.doc(db, 'profiles', uid)); return s.exists() ? {uid, ...s.data()} : null; },
  async saveProfile(uid, patch) {
    await F.setDoc(F.doc(db, 'profiles', uid), patch, {merge: true});
    if (user && user.uid === uid) { profile = {...profile, ...patch}; touchDirectory(user, profile); }
    notify(); return {uid, ...profile};
  },
  async setRole(uid, newRole) { await F.setDoc(F.doc(db, 'roles', uid), {role: newRole, setBy: user?.uid || '', setAt: Date.now()}); notify(); },

  // ---- site ----
  async saveSettings(patch) { settings = {...settings, ...patch}; await F.setDoc(F.doc(db, 'settings', 'site'), settings); notify(); return settings; },
  async exportAll() { const [posts, comments, users] = await Promise.all([this.listAllPosts(), F.getDocs(F.collection(db, 'comments')).then(s => s.docs.map(norm)), this.listUsers()]); return {settings, posts, comments, users}; },
  async resetDemo() { throw Error('Not available with Firebase; delete documents in the Firebase console.'); },
};
