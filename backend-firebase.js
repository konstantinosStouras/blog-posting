// FIREBASE backend: Auth + Firestore, loaded from the CDN only when firebase-config.js
// holds a real config. Collections and the profile shape follow operationsacademia.org
// and stouras.com/lit:
//   profiles/{uid}          the account's own profile (owner read/write; staff read)
//   userDirectory/{uid}     roster row: name, email (pinned to the token), first, seen
//   registeredUsers/{uid}   contentless registration mark {t}
//   roles/{uid}             {role: student|lecturer|admin}, written by the admin only
//   blogs/{id}              a public canvas and its exercise, owned by instructors (teacherIds)
//   blogs/{id}/members/{uid} link from a module membership (a record; reading and commenting go by the module)
//   modules/{id}            a cohort: roster, invitations, academic year, deadline, blogId
//   posts/{id}, comments/{id}, settings/site
import {firebaseConfig, ADMIN_EMAIL} from './firebase-config.js';
import {DEFAULT_SETTINGS, EMPTY_EXERCISE} from './seed.js';
import {newId, slugify, wordCount, excerptOf, plainText, isReservedUrlName, academicYearOf} from './util.js';
import {registrationProfile} from './registration.js';
import {randomCode, normalizeCode, STANDING_EXPIRY, JOIN_CITIES, isJoinCity, cityLabel} from './invitation-codes.js';
import {buildPeopleReport} from './people-model.js';
import {writingReport,sessionHistoryReport,moduleWritingTotals} from './writing-time.js';
import {startPresence} from './presence.js';
import {randomAlias} from './aliases.js';
import {reviewId, reviewerRelease} from './peer-review-model.js';

const V = '13.0.0', cdn = m => `https://www.gstatic.com/firebasejs/${V}/firebase-${m}.js`;
let app, auth, db, A, F, user = null, profile = null, role = 'student', settings = {...DEFAULT_SETTINGS};
let registration = null;
// The account's reach: the modules it teaches, the blogs it owns and the modules it belongs to
// as a student. Posts and comments are fetched one module (or owned blog) at a time, because the
// rules let a reader list a module's published posts only when the query names that module.
let managedModuleIds = [], managedBlogIds = [], memberModuleIds = [], myBlogIds = [];   // myBlogIds: the blogs of every module this account belongs to or teaches, plus the blogs it owns
// Presence (presence.js): a signed-in tab beats once a minute under the real account, whatever preview
// is on. A student's visit is filed under each module they belong to, an instructor's under those they
// teach or belong to, the admin's under no module (readable by the admin alone).
let presence = null;
let presenceReady = Promise.resolve();
const presenceModules = () => role === 'admin' ? [''] : [...new Set([...memberModuleIds, ...managedModuleIds])];
function trackPresence(self) {
  if (presence && user?.emailVerified) { void presence.beat(); return; }
  presence?.stop(); presence = null;
  const account=user;
  if(account?.emailVerified) presenceReady=(async()=>{
    const token=await A.getIdTokenResult(account);
    if(user!==account || presence) return;
    const authStartedAt=Number(token.claims.auth_time)*1000;
    presence=startPresence({uid:account.uid,authStartedAt,modules:presenceModules,save:row=>self.savePresence(row),saveAll:rows=>{
      const batch=F.writeBatch(db);
      for(const {id,...data} of rows) batch.set(F.doc(db,'presence',id),data);
      return batch.commit();
    }});
    await presence.flush();
  })();
  else presenceReady=Promise.resolve();
  // Keep authentication usable after a tracking failure; critical operations below
  // await the original promise and surface an error instead of silently losing data.
  void presenceReady.catch(error=>console.warn('presence',error?.code||error?.message));
}
function selectAccount(next) {
  const previous = user;
  if (user !== next) {
    profile = null;
    role = next?.emailVerified && next.email === ADMIN_EMAIL ? 'admin' : 'student';
    managedModuleIds = []; managedBlogIds = []; memberModuleIds = []; myBlogIds = [];
    if (previous?.uid !== next?.uid || !next?.emailVerified) { presence?.stop(); presence = null; }
  }
  user = next;
  if (previous && previous.uid !== next?.uid) notify(); else forget();
}
async function refreshManaged(self) {
  if (!user) { managedModuleIds = []; managedBlogIds = []; memberModuleIds = []; myBlogIds = []; return; }
  const account = user;
  const [modules, blogs] = await Promise.all([self.listModules(), self.listBlogs({metadataOnly: true})]);
  if (user !== account) return;
  managedModuleIds = modules.filter(m => m.teacherIds.includes(user.uid)).map(m => m.id);
  managedBlogIds = blogs.filter(b => b.teacherIds.includes(user.uid)).map(b => b.id);
  await self.listMyModules();   // sets memberModuleIds
}
// Reading a module's posts or comments: the query that the rules admit for this account.
const readScope = f => ({
  modules: [...new Set([...memberModuleIds, ...managedModuleIds])].filter(id => !f.moduleId || id === f.moduleId),
  blogs: managedBlogIds.filter(id => !f.blogId || id === f.blogId),
});
const gather = async qs => { const rows = (await Promise.all(qs.map(q => getDocs(q).then(s => s.docs.map(norm))))).flat(); return [...new Map(rows.map(r => [r.id, r])).values()]; };
const listeners = new Set(), notify = why => { forget(); listeners.forEach(fn => fn(why)); };
// A local Firestore cache is shared across accounts and cannot enforce read permissions.
const getDoc = ref => F.getDocFromServer(ref);
const getDocs = query => F.getDocsFromServer(query);
const ts = v => (v && typeof v.toMillis === 'function') ? v.toMillis() : (v ?? null);
const norm = d => { const o = {id: d.id, ...d.data()}; for (const k of ['createdAt', 'updatedAt', 'publishedAt']) if (k in o) o[k] = ts(o[k]); return o; };
// A post's text (with its inline images) lives in posts/{id}/content/body, apart from the
// record the cards are drawn from (title, excerpt, tags, the card image, a plain-text copy
// for the search box), so the canvas and the staff lists download kilobytes per post, not
// the whole post. Reading one post joins the two. Posts saved before 3 Nov 2026 still
// carry body in their record until they are saved again or slimmed (slimPosts).
const TEXT_MAX = 8000;
const bodyRef = id => F.doc(db, 'posts', id, 'content', 'body');
async function withBody(p) { if (!p || typeof p.body === 'string') return p; const s = await getDoc(bodyRef(p.id)); return {...p, body: s.exists() ? s.data().body || '' : ''}; }
async function withBrief(blog) {
  if (!blog) return null;
  const {brief: legacyBrief, ...metadata} = blog;
  const account = user;
  if (!account?.emailVerified) return metadata;
  const owner = role === 'admin' || (role === 'lecturer' && blog.teacherIds.includes(account.uid));
  if (!owner && !myBlogIds.includes(blog.id)) return metadata;
  const ref = F.doc(db, 'blogs', blog.id, 'private', 'brief');
  let snapshot;
  try { snapshot = await getDoc(ref); }
  catch (e) {
    // A shared blog's membership link can still point to a module the reader left.
    if (e.code !== 'permission-denied' || owner || user !== account) throw e;
    const module = (await firebase.listMyModules()).find(m => m.blogId === blog.id);
    if (!module || user !== account) return metadata;
    await F.setDoc(F.doc(db, 'blogs', blog.id, 'members', account.uid), {uid: account.uid, moduleId: module.id, joinedAt: Date.now()});
    snapshot = await getDoc(ref);
  }
  return {...metadata, brief: snapshot.exists() ? snapshot.data().brief : legacyBrief || ''};
}
async function createCodedInvite(kind, data) {
  const inviteId = crypto.randomUUID();
  for (let attempt=0;attempt<60;attempt++) {
    const code=randomCode(),codeKey=normalizeCode(code),collection=kind==='instructor'?'teacherInvites':'moduleInvites';
    const result=await F.runTransaction(db,async tx=>{
      const codeRef=F.doc(db,'registrationCodes',codeKey);
      if((await tx.get(codeRef)).exists())return null;
      tx.set(F.doc(db,collection,inviteId),{...data,code:codeKey});
      tx.set(codeRef,{kind,inviteId,moduleId:data.moduleId || '',code:codeKey,expiresAt:data.expiresAt,revoked:false});
      return {id:inviteId,...data,code};
    });
    if(result)return result;
  }
  throw Error('Could not allocate an unused invitation code. Please try again.');
}

async function loadRole(uid, email, verified) {
  if (!verified) return 'student';
  if (email === ADMIN_EMAIL) return 'admin';
  try { const snap = await getDoc(F.doc(db, 'roles', uid)); if (snap.exists() && snap.data().role) return snap.data().role; } catch {}
  return (verified && email === ADMIN_EMAIL) ? 'admin' : 'student';
}
async function ensureProfile(u) {
  const ref = F.doc(db, 'profiles', u.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  const [firstName = '', ...rest] = (u.displayName || '').split(' ');
  const p = {firstName, lastName: rest.join(' '), penName: randomAlias(), affiliation: '', studentId: '', website: '', linkedin: '', bio: '', contactEmail: '', photo: '', registrationKind: 'student'};
  if (registration && registration.email === u.email) Object.assign(p, registration.profile);
  // The Google popup and the auth-state listener can both finish registration.
  // Adopt the same alias even if another callback or tab created the profile first.
  return F.runTransaction(db, async tx => {
    const current = await tx.get(ref);
    if (current.exists()) return current.data();
    tx.set(ref, p);
    return p;
  });
}
async function touchDirectory(u, p) {
  const ref = F.doc(db, 'userDirectory', u.uid);
  const snap = await getDoc(ref).catch(() => null);
  const now=Date.now(),signedInAt=Date.parse(u.metadata?.lastSignInTime || '') || now;
  const row = {name: [p.firstName, p.lastName].filter(Boolean).join(' ') || p.penName, firstName:p.firstName || '',lastName:p.lastName || '',studentId:p.studentId || '',penName: p.penName, affiliation: p.affiliation || '', contactEmail: p.contactEmail || '', first: snap?.exists() ? snap.data().first : now, seen:now,signedInAt,emailVerified:!!u.emailVerified};
  if (u.email) row.email = u.email;
  await F.setDoc(ref, row);
  await F.setDoc(F.doc(db, 'registeredUsers', u.uid), {t: Date.now()}).catch(() => {});
  if(u.emailVerified){
    const modules=await firebase.listModules();
    await Promise.all(modules.map(async m=>{
      const ref=F.doc(db,'modules',m.id,'members',u.uid),member=await getDoc(ref);
      if(member.exists()) try { await F.updateDoc(ref,{firstName:p.firstName || '',lastName:p.lastName || '',studentId:p.studentId || '',affiliation:p.affiliation || '',contactEmail:p.contactEmail || '',penName:p.penName,email:u.email,lastSeenAt:now,lastSignInAt:signedInAt}); } catch (e) { console.warn('roster row not updated for', m.id, e.code || e.message); }
    }));
  }
}

// What a page needs before it can be drawn for this account (profile, role, the modules
// and blogs it manages), fetched side by side. The roster bookkeeping (touchDirectory)
// is writes only, so it runs on after the first page is up instead of holding it back.
// A read refused in the moment after a sign-in (another of this browser's tabs holds the
// connection the on-disk cache shares and learns of the sign-in a little later, so the first
// reads went out without the account) once left the account a student with no profile until
// the next reload. Now the role, which for the admin needs no read, is kept whatever the other
// reads did, and the load is tried again in the background (retryAccount) until it is in.
async function loadAccount(self, u) {
  const [p, r, m] = await Promise.allSettled([ensureProfile(u), loadRole(u.uid, u.email, u.emailVerified), refreshManaged(self)]);
  if (user !== u) return;
  if (r.status === 'fulfilled') role = r.value;
  if (p.status === 'fulfilled') profile = p.value;
  if (p.status === 'rejected' || m.status === 'rejected') throw (p.reason || m.reason);
  touchDirectory(u, profile).catch(e => console.warn('directory', e.code || e.message));
}
const RETRY = [800, 2500, 6000];
function accountFailed(self, u, e, i = 0) {
  if (user !== u) return;
  console.warn('account', e?.code || e?.message || e);
  profile = profile || {penName: 'student'};
  if (i >= RETRY.length) return;
  setTimeout(async () => {
    if (user !== u) return;   // signed out, or in again, meanwhile
    try { await loadAccount(self, u); notify(); } catch (err) { accountFailed(self, u, err, i + 1); }   // notify: the page is redrawn with the account in
  }, RETRY[i]);
}

// Reads that pages repeat are answered once for a short while: one navigation asks for
// the blog list three or four times (the header, the access check, the page, the footer),
// and the footer asks for every published post on every page. A write in this tab
// (notify) or a sign-in clears the memo, so one's own changes show at once.
const MEMO_TTL = 30000, memo = new Map();
const remember = (key, fn) => {
  const hit = memo.get(key);
  if (hit && hit.t > Date.now() - MEMO_TTL) return hit.p;
  const p = fn().catch(e => { memo.delete(key); throw e; });
  memo.set(key, {t: Date.now(), p}); return p;
};
const forget = () => memo.clear();
const MEMOED = ['listModules', 'getModule', 'listBlogs', 'getBlog', 'listMyModules', 'listPosts', 'listAllPosts', 'getPostBySlug', 'listComments', 'recentComments'];

// A student deletes only their own drafts, which carry no comments, likes or votes. Staff clear those
// too (the rules let a module's or blog's staff delete them); a batch holds 500 writes, so a busy post
// goes in several, with the post itself in the last one.
async function removePost(id) {
  if (role === 'student') { const b = F.writeBatch(db); b.delete(bodyRef(id)); b.delete(F.doc(db, 'posts', id)); await b.commit(); return; }
  const [cs, ls, vs, bs, ct] = await Promise.all([getDocs(F.query(F.collection(db, 'comments'), F.where('postId', '==', id))), getDocs(F.collection(db, 'posts', id, 'likes')), getDocs(F.collection(db, 'posts', id, 'votes')), getDocs(F.collection(db, 'posts', id, 'bookmarks')), getDocs(F.collection(db, 'posts', id, 'content'))]);
  const refs = [...cs.docs, ...ls.docs, ...vs.docs, ...bs.docs, ...ct.docs].map(d => d.ref);
  let b = F.writeBatch(db), n = 0;
  for (const r of refs) { b.delete(r); if (++n === 450) { await b.commit(); b = F.writeBatch(db); n = 0; } }
  b.delete(F.doc(db, 'posts', id)); await b.commit();
}

// An invitation document and, unless the city or code has since been given to another invitation,
// its registrationCodes entry, in one batch (the Delete column of the People tables).
async function removeInvite(collection, id) {
  const ref = F.doc(db, collection, id), s = await getDoc(ref);
  if (!s.exists()) return;
  const b = F.writeBatch(db); b.delete(ref);
  const code = s.data().code;
  if (code) { const c = await getDoc(F.doc(db, 'registrationCodes', code)).catch(() => null); if (c?.exists() && c.data().inviteId === id) b.delete(c.ref); }
  await b.commit();
}

export const firebase = {
  mode: 'firebase',
  async init() {
    const [appM, authM, fsM] = await Promise.all([import(cdn('app')), import(cdn('auth')), import(cdn('firestore'))]);
    A = authM; F = fsM;
    app = appM.initializeApp(firebaseConfig); auth = A.getAuth(app);
    db = F.getFirestore(app);
    const site = getDoc(F.doc(db, 'settings', 'site')).then(s => { if (s.exists()) settings = {...DEFAULT_SETTINGS, ...s.data()}; }).catch(e => console.warn('settings', e));
    let initializing = true;
    await new Promise(resolve => {
      A.onAuthStateChanged(auth, async u => {
        selectAccount(u);
        const startingRole = role;
        if (u) { try { await loadAccount(this, u); } catch (e) { accountFailed(this, u, e); } }
        if (user !== u) return;
        trackPresence(this);
        await site;
        if (user !== u) return;
        // During initial startup the UI has no subscribers yet. Reuse the admin directory
        // reads made for this same account and role when drawing the first page.
        if (!initializing || startingRole !== 'admin' || role !== startingRole) notify();
        initializing = false;
        resolve();
      });
    });
    return settings;
  },
  settings: () => settings,
  onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },

  // ---- auth ----
  currentUser() { return user ? {uid: user.uid, email: user.email || '', emailVerified: user.emailVerified, displayName: user.displayName || '', photoURL: user.photoURL || profile?.photo || '', providerId: user.providerData?.[0]?.providerId || 'password', ...profile, role, managedModuleIds, managedBlogIds} : null; },
  async signIn(provider, {email, password, googleEmail} = {}) {
    let cred;
    if (provider === 'google.com') {
      const google = new A.GoogleAuthProvider();
      if (googleEmail) google.setCustomParameters({login_hint: googleEmail});
      cred = await A.signInWithPopup(auth, google);
    } else if (provider === 'password') cred = await A.signInWithEmailAndPassword(auth, email, password);
    else throw Error('Unknown sign-in method.');
    selectAccount(cred.user);
    try { await loadAccount(this, user); } catch (e) { accountFailed(this, user, e); }   // signed in all the same; the account follows
    trackPresence(this); notify(); return cred;
  },
  async register(data, teacher = false) {
    const invitation=await this.resolveRegistrationCode(data.registrationCode);
    if((invitation.kind==='instructor')!==teacher)throw Error('The invitation does not match this registration form.');
    const details = registrationProfile(data, teacher);
    const email = details.contactEmail, password = data.password;
    registration = {email, profile: details};
    try {
      const cred = await A.createUserWithEmailAndPassword(auth, email, password);
      await A.updateProfile(cred.user, {displayName: details.firstName + ' ' + details.lastName});
      selectAccount(cred.user);
      profile = await ensureProfile(cred.user);
      await touchDirectory(cred.user, profile);
      await A.sendEmailVerification(cred.user);
      notify();
      return cred;
    } finally { registration = null; }
  },
  async completeRegistration(data, teacher = false) {
    if (!user) throw Error('Sign in first.');
    const details = registrationProfile(data, teacher);
    await this.saveProfile(user.uid, details); return details;
  },
  async resetPassword(email) { return A.sendPasswordResetEmail(auth, email); },
  async resendVerification() { if (user) await A.sendEmailVerification(user); },
  async refreshVerification() {
    if (!user) return;
    await A.reload(user); await A.getIdToken(user, true);
    role = await loadRole(user.uid, user.email, user.emailVerified); if (!presence) trackPresence(this); notify();
    return user.emailVerified;
  },
  async signOut() { await presenceReady; await presence?.signOut(); presence?.stop(); presence = null; await A.signOut(auth); },

  // Public module metadata is separate from private enrolment/roster records.
  async listModules() { const s = await getDocs(F.collection(db, 'modules')); return s.docs.map(norm).sort((a,b) => a.title.localeCompare(b.title)); },
  async getModule(id) { const s = await getDoc(F.doc(db, 'modules', id)); return s.exists() ? norm(s) : null; },
  // ---- blogs: the public canvas and the exercise written on it ----
  async listBlogs({metadataOnly = false} = {}) { const s = await getDocs(F.collection(db, 'blogs')); const rows = s.docs.map(norm).sort((a, b) => a.title.localeCompare(b.title)); return role === 'admin' && !metadataOnly ? Promise.all(rows.map(withBrief)) : rows.map(({brief, ...metadata}) => metadata); },
  async getBlog(id) { if (!id) return null; const s = await getDoc(F.doc(db, 'blogs', id)); return s.exists() ? withBrief(norm(s)) : null; },
  async listMyBlogs() { if (!user) return []; return (await this.listBlogs()).filter(b => role === 'admin' || b.teacherIds.includes(user.uid)); },
  async saveBlog(data) {
    if (!user || !['admin','lecturer'].includes(role)) throw Error('Instructor access required.');
    const id = data.id || slugify(data.urlName || data.title);
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(id)) throw Error('Choose a URL name of 2–80 lowercase letters, numbers or hyphens.');
    if (!data.id && isReservedUrlName(id)) throw Error('That URL name is taken by a page of the site. Choose another.');
    const existing = await this.getBlog(id);
    if (!data.id && existing) throw Error('That blog URL already exists. Choose another.');
    const now = Date.now();
    const doc = {...EMPTY_EXERCISE, allowComments: true, ...(existing || {}), ...data, updatedAt: now};
    delete doc.id; delete doc.urlName;
    doc.title = String(doc.title || '').trim(); doc.description = String(doc.description || '').trim();
    doc.teacherIds = existing?.teacherIds || [user.uid]; doc.createdBy = existing?.createdBy || user.uid; doc.createdAt = existing?.createdAt || now;
    if (!doc.title) throw Error('Enter a blog title.');
    const {brief, ...metadata} = doc;
    const batch = F.writeBatch(db);
    batch.set(F.doc(db, 'blogs', id), metadata);
    if (brief || data.brief === '') batch.set(F.doc(db, 'blogs', id, 'private', 'brief'), {brief: brief || ''});
    await batch.commit();
    await refreshManaged(this); notify(); return {id, ...doc};
  },
  // A module is a cohort attached to exactly one blog: an existing blog of the
  // instructor's (data.blogId) or a new one created on the spot (data.newBlog).
  async saveModule(data) {
    if (!user || !['admin','lecturer'].includes(role)) throw Error('Instructor access required.');
    const existing = data.id ? await this.getModule(data.id) : null;
    if (data.id && !existing) throw Error('Module not found.');
    let blogId = data.blogId || existing?.blogId || '';
    if (data.newBlog) blogId = (await this.saveBlog({title: data.newBlog.title, urlName: data.newBlog.urlName, description: data.description || ''})).id;
    const blog = await this.getBlog(blogId);
    if (!blog || !(role === 'admin' || blog.teacherIds.includes(user.uid))) throw Error('Choose one of your own blogs for this module, or create a new one.');
    let id = existing?.id;
    if (!id && data.code && (await this.listModules()).some(m => m.code.toLowerCase() === String(data.code).trim().toLowerCase())) throw Error('A module with this code already exists. Open it from My modules instead: one module serves every academic year.');
    if (!id) {
      const base = slugify(data.code || data.title).slice(0, 72);
      if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(base)) throw Error('Enter a module title.');
      id = base; for (let n = 2; await this.getModule(id); n++) id = base + '-' + n;
    }
    const doc = {title: String(data.title || '').trim(), code: String(data.code || '').trim(), description: String(data.description || '').trim(), blogId, deadline: String(data.deadline || ''), brightspaceUrl: String(data.brightspaceUrl || '').trim(), teacherName: existing?.teacherName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' '), teacherIds: existing?.teacherIds || [user.uid], createdBy: existing?.createdBy || user.uid, createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now(), submissionsOpen: data.submissionsOpen !== false, requireApproval: !!data.requireApproval, peerReview: role === 'admin' && 'peerReview' in data ? !!data.peerReview : !!existing?.peerReview, peerDeadline: role === 'admin' && 'peerDeadline' in data ? String(data.peerDeadline || '') : (existing?.peerDeadline || '')};
    if (!doc.title) throw Error('Enter a module title.');
    await F.setDoc(F.doc(db, 'modules', id), doc);
    await F.setDoc(F.doc(db, 'blogs', blogId, 'members', user.uid), {uid: user.uid, moduleId: id, joinedAt: Date.now()}).catch(e => console.warn('blog membership', e.code || e.message));
    await refreshManaged(this);
    notify(); return {id, ...doc};
  },
  // An instructor deletes a module they teach (the admin, any module): its roster goes with it,
  // together with the blog memberships the roster brought, and its invitation code is retired
  // so nobody joins a module that is gone. Its posts are the students' work, so a module with
  // posts stays until they are deleted (Review posts) or the module is reused. The blog is
  // untouched: other modules may write on it.
  async deleteModule(id) {
    if (!user || !['admin','lecturer'].includes(role)) throw Error('Instructor access required.');
    const m = await this.getModule(id); if (!m) throw Error('Module not found.');
    if (!(role === 'admin' || m.teacherIds.includes(user.uid))) throw Error('You cannot manage this module.');
    const posts = await getDocs(F.query(F.collection(db, 'posts'), F.where('moduleId', '==', id)));
    if (posts.size) throw Error(`This module has ${posts.size} post${posts.size === 1 ? '' : 's'}. Delete them from Review posts first, or keep the module and reuse it next year.`);
    for (const i of await this.listModuleInvites(id)) if (!i.revoked) await this.revokeModuleInvite(i.id);
    const members = await getDocs(F.collection(db, 'modules', id, 'members'));
    let b = F.writeBatch(db), n = 0;
    for (const d of members.docs) {
      b.delete(d.ref);
      if (m.blogId) { const bm = await getDoc(F.doc(db, 'blogs', m.blogId, 'members', d.id)).catch(() => null); if (bm?.exists() && bm.data().moduleId === id) b.delete(bm.ref); }
      if ((n += 2) >= 450) { await b.commit(); b = F.writeBatch(db); n = 0; }
    }
    b.delete(F.doc(db, 'modules', id)); await b.commit();
    if (role === 'admin') await this.deletePeerRound(id).catch(() => {});
    forget(); await refreshManaged(this);
    notify();
  },
  async listMyModules() {
    if (!user) return [];
    const account = user;
    const modules = await this.listModules();
    const rows = (await Promise.all(modules.map(async m => {
      if (m.teacherIds.includes(account.uid) || role === 'admin') return {...m, teaching: true};
      const member = await getDoc(F.doc(db, 'modules', m.id, 'members', account.uid));
      return member.exists() ? {...m, teaching: false} : null;
    }))).filter(Boolean);
    if (user !== account) return [];
    memberModuleIds = rows.filter(m => !m.teaching).map(m => m.id);
    myBlogIds = [...new Set([...rows.map(m => m.blogId), ...managedBlogIds].filter(Boolean))];
    return rows;
  },
  async joinModule(id, inviteId = '') {
    if (!user) throw Error('Sign in to join a module.');
    if (!user.emailVerified) throw Error('Verify your sign-in email first, then refresh verification from the account menu.');
    await A.getIdToken(user, true).catch(() => {});   // the email_verified claim may lag the account flag
    const m = await this.getModule(id); if (!m) throw Error('Module not found.');
    if (m.teacherIds.includes(user.uid) || role === 'admin') return;
    const ref=F.doc(db,'modules',id,'members',user.uid),existing=await getDoc(ref);
    inviteId=existing.data()?.inviteId || inviteId || '';
    if(!inviteId)throw Error('An invitation from your instructor is required to join this module.');
    if(!existing.exists()){
      const invite=await getDoc(F.doc(db,'moduleInvites',inviteId)).catch(()=>null);
      if(!invite?.exists() || invite.data().moduleId!==id || invite.data().revoked || invite.data().expiresAt<Date.now())throw Error('This module invitation has expired or is not valid.');
    }
    const details = registrationProfile(profile, ['teacher','instructor'].includes(profile?.registrationKind));
    const now=Date.now(), joinedAt = existing.data()?.joinedAt || now;
    const batch = F.writeBatch(db);
    batch.set(ref, {uid:user.uid, ...details, penName:profile.penName, email:user.email, joinedAt,inviteId,lastSeenAt:now,lastSignInAt:Date.parse(user.metadata?.lastSignInTime || '') || now});
    if (m.blogId) batch.set(F.doc(db,'blogs',m.blogId,'members',user.uid), {uid:user.uid, moduleId:id, joinedAt});
    await batch.commit();
    notify(); await refreshManaged(this);   // the new module's posts are now within reach
  },
  async resolveRegistrationCode(code) {
    const key=normalizeCode(code);
    if(!/^[a-z]+(-[0-9]{3})?$/.test(key))throw Error('Enter the invitation code exactly as it was supplied to you.');
    const s=await getDoc(F.doc(db,'registrationCodes',key));
    if(!s.exists() || s.data().revoked || s.data().expiresAt<Date.now())throw Error('That registration code is invalid, revoked or expired.');
    // A student code is one of the eight cities; the codes from before 3 Nov 2026 (ottawa-521) are retired.
    if(s.data().kind==='student'&&(!isJoinCity(key)||!s.data().blogId))throw Error('That invitation code has been retired. Ask your instructor for the module’s current invitation link.');
    return s.data();
  },
  // Which module, if any, each of the eight cities is the code of (null: free). Eight reads;
  // the index is readable one code at a time, never listed.
  async joinCityStatus() {
    const docs=await Promise.all(JOIN_CITIES.map(c=>getDoc(F.doc(db,'registrationCodes',c))));
    return Object.fromEntries(JOIN_CITIES.map((c,i)=>[c,docs[i].exists()&&!docs[i].data().revoked?docs[i].data():null]));
  },
  // The module's invitation becomes the chosen city: its earlier code(s), of any format, are
  // revoked in the same transaction, so the module has one standing link at a time. A city
  // in use by another module is refused; a revoked one is taken over.
  async createModuleInvite(moduleId, city) {
    const code=normalizeCode(city);
    if(!isJoinCity(code))throw Error('Choose one of the invitation cities.');
    const m=await this.getModule(moduleId); if(!m)throw Error('Module not found.');
    const current=(await this.listModuleInvites(moduleId)).filter(i=>!i.revoked);
    const same=current.find(i=>i.code===code); if(same)return same;
    const inviteId=crypto.randomUUID(),codeRef=F.doc(db,'registrationCodes',code);
    const data={moduleId,blogId:m.blogId||'',code,createdBy:user.uid,createdAt:Date.now(),expiresAt:STANDING_EXPIRY,revoked:false};
    await F.runTransaction(db,async tx=>{
      const taken=await tx.get(codeRef);
      if(taken.exists()&&!taken.data().revoked)throw Error(`${cityLabel(code)} is the invitation code of another module. Choose a different city.`);
      const codes=await Promise.all(current.map(i=>tx.get(F.doc(db,'registrationCodes',i.code))));
      current.forEach((i,n)=>{tx.update(F.doc(db,'moduleInvites',i.id),{revoked:true});if(codes[n].exists()&&!codes[n].data().revoked)tx.update(F.doc(db,'registrationCodes',i.code),{revoked:true});});
      tx.set(F.doc(db,'moduleInvites',inviteId),data);
      tx.set(codeRef,{kind:'student',inviteId,moduleId,blogId:data.blogId,code,expiresAt:STANDING_EXPIRY,revoked:false});
    });
    return {id:inviteId,...data};
  },
  async listModuleInvites(moduleId) {const s=await getDocs(F.query(F.collection(db,'moduleInvites'),F.where('moduleId','==',moduleId)));return s.docs.map(norm).sort((a,b)=>b.createdAt-a.createdAt);},
  async revokeModuleInvite(id) {const ref=F.doc(db,'moduleInvites',id),s=await getDoc(ref),batch=F.writeBatch(db);batch.update(ref,{revoked:true});if(s.data()?.code)batch.update(F.doc(db,'registrationCodes',s.data().code),{revoked:true});await batch.commit();},
  async createTeacherInvite({universityEmail, ucdEmail, gmail}) {
    const email = String(universityEmail || ucdEmail || '').trim().toLowerCase(), googleEmail = String(gmail || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Enter the instructor’s university email.');
    if (googleEmail && !/^[^\s@]+@gmail\.com$/.test(googleEmail)) throw Error('Enter a Gmail address or leave it blank.');
    const doc = {ucdEmail:email, gmail:googleEmail, createdBy:user.uid, createdAt:Date.now(), expiresAt:Date.now()+7*86400000, acceptedBy:'', revoked:false};
    return createCodedInvite('instructor',doc);
  },
  async listTeacherInvites() { const s = await getDocs(F.collection(db,'teacherInvites')); return s.docs.map(norm).sort((a,b)=>b.createdAt-a.createdAt); },
  async revokeTeacherInvite(id) {const ref=F.doc(db,'teacherInvites',id),s=await getDoc(ref),batch=F.writeBatch(db);batch.update(ref,{revoked:true});if(s.data()?.code)batch.update(F.doc(db,'registrationCodes',s.data().code),{revoked:true});await batch.commit();},
  async acceptTeacherInvite(id) {
    if (!user?.emailVerified) throw Error('Verify your sign-in email before accepting the invitation.');
    await A.getIdToken(user, true).catch(() => {});
    const ref = F.doc(db,'teacherInvites',id), s = await getDoc(ref).catch(() => null);
    if (!s?.exists()) throw Error('Invitation not found, or it was issued to a different email address.');
    const invite = s.data();
    if (invite.revoked || invite.expiresAt < Date.now()) throw Error('This invitation has expired or was revoked. Ask the admin for a new link.');
    if (invite.acceptedBy) throw Error('This invitation has already been used. Open My modules if your instructor account is active.');
    if (![invite.ucdEmail, invite.gmail].filter(Boolean).includes(user.email.toLowerCase())) throw Error('Sign in with the university email or Gmail address specified in your invitation.');
    const details = registrationProfile(profile,true);
    if (details.contactEmail !== invite.ucdEmail) throw Error('Your university email must match the invitation. Update your profile.');
    const batch = F.writeBatch(db);
    batch.set(F.doc(db,'roles',user.uid),{role:'lecturer',inviteId:id,setBy:'invitation',setAt:Date.now()});
    batch.update(ref,{acceptedBy:user.uid}); await batch.commit();
    role = 'lecturer'; notify(); return invite;
  },

  // ---- posts ----
  async listPosts(f = {}) {
    const col = F.collection(db, 'posts');
    let rows;
    if (f.authorId) rows = (await getDocs(F.query(col, F.where('authorId', '==', f.authorId)))).docs.map(norm);
    else if (role === 'admin') rows = (await getDocs(F.query(col, F.where('status', '==', f.status || 'published'), ...(f.blogId ? [F.where('blogId', '==', f.blogId)] : [])))).docs.map(norm);
    else if ((f.status || 'published') === 'published') {
      // Published posts are public, whole blogs at a time: the blog asked for, or (All posts, the
      // footer) every blog of the reader's modules. A visitor must name the blog.
      const blogs = f.blogId ? [f.blogId] : user ? myBlogIds : [];
      rows = await gather(blogs.map(id => F.query(col, F.where('blogId', '==', id), F.where('status', '==', 'published'))));
    } else {
      // Drafts and pending posts: a student reads their own, an instructor those of the
      // modules they teach and of the blogs they own: one query per module or blog.
      const status = f.status || 'published', {modules, blogs} = readScope(f);
      rows = await gather([...modules.map(id => F.query(col, F.where('moduleId', '==', id), F.where('status', '==', status))), ...blogs.map(id => F.query(col, F.where('blogId', '==', id), F.where('status', '==', status)))]);
    }
    if (f.status) rows = rows.filter(p => p.status === f.status);
    if (f.moduleId) rows = rows.filter(p => p.moduleId === f.moduleId);
    if (f.blogId) rows = rows.filter(p => p.blogId === f.blogId);
    return rows;
  },
  async listAllPosts() {
    if (role === 'admin') { const snap = await getDocs(F.collection(db,'posts')); return snap.docs.map(norm); }
    const byModule = managedModuleIds.map(id => getDocs(F.query(F.collection(db,'posts'),F.where('moduleId','==',id))).then(s=>s.docs.map(norm)));
    const byBlog = managedBlogIds.map(id => getDocs(F.query(F.collection(db,'posts'),F.where('blogId','==',id))).then(s=>s.docs.map(norm)));
    const rows = (await Promise.all([...byModule, ...byBlog])).flat();
    return [...new Map(rows.map(p => [p.id, p])).values()];
  },
  async saveWritingHistory(row){const {id,...data}=row;await F.setDoc(F.doc(db,'writingHistory',id),data);},
  async listWritingHistory(moduleId=''){if(!user?.emailVerified||!['admin','lecturer'].includes(role))throw Error('Staff access required.');if(role==='admin'&&!moduleId){const s=await getDocs(F.collection(db,'writingHistory'));return s.docs.map(norm);}const ids=moduleId?[moduleId]:managedModuleIds;return (await Promise.all(ids.map(id=>getDocs(F.query(F.collection(db,'writingHistory'),F.where('moduleId','==',id))).then(s=>s.docs.map(norm))))).flat();},
  // ---- presence (written by the tab's heartbeat under the real account; read by staff) ----
  async savePresence(row){const {id,...data}=row;await F.setDoc(F.doc(db,'presence',id),data);},
  async listPresence(moduleId=''){if(!user?.emailVerified||!['admin','lecturer'].includes(role))throw Error('Staff access required.');if(role==='admin'&&!moduleId){const s=await getDocs(F.collection(db,'presence'));return s.docs.map(norm);}
   const ids=moduleId?[moduleId]:[...managedModuleIds];if(role==='admin')ids.push('');   // the admin's own visits carry no module
   return (await Promise.all(ids.map(id=>getDocs(F.query(F.collection(db,'presence'),F.where('moduleId','==',id))).then(s=>s.docs.map(norm))))).flat();},
  async listWritingSessions(moduleId='') {const ids=moduleId?[moduleId]:managedModuleIds;if(role==='admin'&&!moduleId){const s=await getDocs(F.collection(db,'writingSessions'));return s.docs.map(norm);}return (await Promise.all(ids.map(id=>getDocs(F.query(F.collection(db,'writingSessions'),F.where('moduleId','==',id))).then(s=>s.docs.map(norm))))).flat();},
  // light: the record only (a list of titles), without the read for the text.
  async getPost(id, {light = false} = {}) { const s = await getDoc(F.doc(db, 'posts', id)); const p = s.exists() ? norm(s) : null; return light ? p : withBody(p); },
  async getPostBySlug(slug) { return withBody(await this.findPostBySlug(slug)); },
  async findPostBySlug(slug) {
    const col = F.collection(db, 'posts'), bySlug = F.where('slug', '==', slug);
    if (user && role === 'admin') {
      const result = await getDocs(F.query(col, bySlug, F.limit(1)));
      return result.empty ? null : norm(result.docs[0]);
    }
    if (user) {
      const own = await getDocs(F.query(col, bySlug, F.where('authorId', '==', user.uid), F.limit(1)));
      if (!own.empty) return norm(own.docs[0]);
      for (const moduleId of managedModuleIds) {
        const taught = await getDocs(F.query(col,bySlug,F.where('moduleId','==',moduleId),F.limit(1)));
        if (!taught.empty) return norm(taught.docs[0]);
      }
      for (const blogId of managedBlogIds) {
        const owned = await getDocs(F.query(col,bySlug,F.where('blogId','==',blogId),F.limit(1)));
        if (!owned.empty) return norm(owned.docs[0]);
      }
    }
    // Everyone else, signed in or not: a published post is readable; a draft reads as missing.
    const s = await getDocs(F.query(col, bySlug, F.where('status', '==', 'published'), F.limit(1)));
    return s.empty ? null : norm(s.docs[0]);
  },
  async savePost(post, u) {
    const id = post.id || newId();
    const existing = post.id ? await this.getPost(id, {light: true}).catch(e => { if (e.code === 'permission-denied') return null; throw e; }) : null;   // a fresh id reads as missing
    const module = await this.getModule(post.moduleId || existing?.moduleId);
    if (!module) throw Error('Choose a module before saving.');
    if (!module.blogId) throw Error('This module is not attached to a blog yet. Ask your instructor.');
    const now = Date.now();
    // Every post is stamped with its module's blog and academic year; the rules check the blog.
    const doc = {...(existing || {createdAt: now, authorId: u.uid, featured: false}), ...post, moduleId: module.id, blogId: module.blogId, updatedAt: now};
    delete doc.id;
    // The text goes to its own record (withBody). A status change from a list passes no body: the
    // text stays as it is, and a post from before the split moves out of the record on this save.
    const body = typeof post.body === 'string' ? post.body : typeof existing?.body === 'string' ? existing.body : existing ? null : '';
    delete doc.body;
    doc.authorName = existing && existing.authorId !== u.uid ? existing.authorName : (u.penName || 'student');
    // The slug follows the title while the post is a draft and freezes once published (stable URL).
    doc.slug = existing?.publishedAt ? existing.slug : slugify(doc.title);
    const publishing = doc.status === 'published' && existing?.status !== 'published';
    if (!existing || existing.slug !== doc.slug || publishing) { const clash = await this.findPostBySlug(doc.slug); if (clash && clash.id !== id) doc.slug += '-' + id.slice(0, 4); }
    if (body !== null) { doc.wordCount = wordCount(body); doc.text = plainText(body).slice(0, TEXT_MAX); doc.bodyBytes = body.length; }   // what the cards and the search box use, so the canvas never needs the text itself
    doc.excerpt = String(doc.excerpt || '').trim();   // the subtitle; cards fall back to an excerpt of the text
    if (doc.status === 'published' && !doc.publishedAt) doc.publishedAt = now;
    if (doc.status !== 'published') doc.publishedAt = existing?.publishedAt || null;
    doc.academicYear = existing?.publishedAt && existing.academicYear ? existing.academicYear : academicYearOf(doc.publishedAt || now);   // the cohort is the year the post went live in
    if (body !== null && body.length > 880000) throw Error(`This post is too large to save (about ${Math.round(body.length / 1024)} KB; the limit is 880 KB). Inline images count towards it: remove or shrink one.`);
    const detail = JSON.stringify(doc).length;   // the record without the text: the card image is nearly all of it, and a record may not pass 1 MiB
    if (detail > 900000) throw Error(`The featured image is too large to save with the post (about ${Math.round(detail / 1024)} KB; the limit is 900 KB). Choose a smaller image.`);
    const batch = F.writeBatch(db); batch.set(F.doc(db, 'posts', id), doc); if (body !== null) batch.set(bodyRef(id), {body}); await batch.commit();
    await presenceReady;
    await presence?.flush();
    notify(); return {id, ...doc, ...(body !== null ? {body} : {})};
  },
  // What the blog holds, in bytes, by kind: the admin's storage line, across every module and
  // instructor. JSON length stands in for Firestore's stored size (close enough; the free plan
  // allows 1 GiB). One read per record, so it is measured only when that page is opened.
  async storageUsage() {
    if (role !== 'admin') throw Error('Admin access required.');
    const all = async name => (await getDocs(F.collection(db, name))).docs.map(d => d.data());
    const size = rows => rows.reduce((s, d) => s + JSON.stringify(d).length + 64, 0);
    const [posts, comments, sessions, history, reviews] = await Promise.all(['posts', 'comments', 'writingSessions', 'writingHistory', 'aiReviews'].map(all));
    const bodies = posts.reduce((s, p) => s + (typeof p.body === 'string' ? 0 : p.bodyBytes || 0), 0);   // text in its own record; an unsplit post's text is in its record already
    return {count: posts.length, inline: posts.filter(p => typeof p.body === 'string').length, posts: size(posts) + bodies, images: posts.reduce((s, p) => s + (p.featuredImage || '').length, 0), comments: size(comments), writing: size(sessions) + size(history) + size(reviews)};
  },
  // Moves the text of posts saved before the split out of their records (withBody), for the posts
  // the account may edit. Resolves to how many moved and how many could not.
  async slimPosts() {
    const rows = (await this.listAllPosts()).filter(p => typeof p.body === 'string');
    let done = 0, failed = 0;
    for (const {id, body, ...rest} of rows) {
      try { const b = F.writeBatch(db); b.set(F.doc(db, 'posts', id), {...rest, wordCount: rest.wordCount ?? wordCount(body), text: plainText(body).slice(0, TEXT_MAX), bodyBytes: body.length}); b.set(bodyRef(id), {body}); await b.commit(); done++; }
      catch (e) { console.warn('slimPosts', id, e); failed++; }
    }
    notify(); return {done, failed};
  },
  async deletePost(id) { await removePost(id); notify(); },
  // Several posts in one go (the canvas's select mode), one refresh at the end. Resolves to the posts
  // that could not be deleted, each with the reason, so the caller can say which ones stayed.
  async deletePosts(ids) {
    const failed = [];
    for (const id of ids) { try { await removePost(id); } catch (e) { failed.push({id, error: e.message}); } }
    notify(); return failed;
  },
  async pollVotes(postId, pollId, u) {
    const s = await getDocs(F.query(F.collection(db, 'posts', postId, 'votes'), F.where('pollId', '==', pollId)));
    const counts = {}; let mine = null, total = 0;
    s.forEach(d => { const v = d.data(); counts[v.option] = (counts[v.option] || 0) + 1; total++; if (u && v.uid === u.uid) mine = v.option; });
    return {counts, mine, total};
  },
  async votePoll(postId, pollId, option, u) {
    if (!user?.emailVerified) throw Error('Verify your sign-in email to vote.');
    await F.setDoc(F.doc(db, 'posts', postId, 'votes', pollId + '_' + u.uid), {pollId, uid: u.uid, option, t: Date.now()});
    return this.pollVotes(postId, pollId, u);
  },
  async listLikes(postId) { try { const s = await getDocs(F.collection(db, 'posts', postId, 'likes')); return s.docs.map(d => d.id); } catch { return []; } },
  async toggleLike(postId, u) {
    if (!user?.emailVerified) throw Error('Verify your sign-in email to like posts.');
    const ref = F.doc(db, 'posts', postId, 'likes', u.uid), had = (await getDoc(ref)).exists();
    if (had) await F.deleteDoc(ref); else await F.setDoc(ref, {t: Date.now()});
    const likes = await this.listLikes(postId); return {liked: !had, count: likes.length};
  },

  // ---- bookmarks: two id lists (posts, comments) on the reader's own profile, which only its owner may write.
  // A bookmarked post also carries a marker per reader (posts/{id}/bookmarks/{uid}, as likes do), so the star
  // can show how many readers kept it; the marker names nobody beyond a uid, and the app shows only the number. ----
  async listBookmarks(postId) { try { const s = await getDocs(F.collection(db, 'posts', postId, 'bookmarks')); return s.docs.map(d => d.id); } catch { return []; } },
  async toggleBookmark(kind, id) {
    if (!user) throw Error('Sign in to bookmark.');
    const key = kind === 'comment' ? 'bookmarkedComments' : 'bookmarkedPosts', had = (profile?.[key] || []).includes(id);
    await F.setDoc(F.doc(db, 'profiles', user.uid), {[key]: had ? F.arrayRemove(id) : F.arrayUnion(id)}, {merge: true});
    profile = {...profile, [key]: had ? (profile?.[key] || []).filter(x => x !== id) : [...(profile?.[key] || []), id]};
    let count = profile[key].length;
    if (kind !== 'comment') {
      const ref = F.doc(db, 'posts', id, 'bookmarks', user.uid);
      try { if (had) await F.deleteDoc(ref); else await F.setDoc(ref, {t: Date.now()}); } catch {}   // the marker feeds the count only: an unverified account keeps its private bookmark without one
      count = (await this.listBookmarks(id)).length;
    }
    return {on: !had, count};
  },

  // ---- comments ----
  async getComment(id) { try { const s = await getDoc(F.doc(db, 'comments', id)); return s.exists() ? norm(s) : null; } catch { return null; } },
  // Comments follow their post's module: the rules admit a comment query that names a module the
  // account belongs to or teaches, or a blog it owns, so each read says which (the post's).
  async listComments(postId, post = null) {
    if (!user) return [];   // the discussion is for the module: a visitor reads the post alone
    const col = F.collection(db, 'comments'), byPost = F.where('postId', '==', postId);
    let q = F.query(col, byPost);
    if (role !== 'admin' && post) {
      const {modules, blogs} = readScope({});
      if (modules.includes(post.moduleId)) q = F.query(col, byPost, F.where('moduleId', '==', post.moduleId));
      else if (blogs.includes(post.blogId)) q = F.query(col, byPost, F.where('blogId', '==', post.blogId));
      else return [];   // a reader from outside the post's module: the post is public, its discussion is not
    }
    const s = await getDocs(q); return s.docs.map(norm).sort((a, b) => a.createdAt - b.createdAt);
  },
  async recentComments(n = 5) {
    const col = F.collection(db, 'comments');
    if (role === 'admin') { const s = await getDocs(F.query(col, F.orderBy('createdAt', 'desc'), F.limit(n))); return s.docs.map(norm); }
    const {modules, blogs} = readScope({});   // a module's comments are few: fetched whole, sorted here, so no composite index is needed
    const rows = await gather([...modules.map(id => F.query(col, F.where('moduleId', '==', id))), ...blogs.map(id => F.query(col, F.where('blogId', '==', id)))]);
    return rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, n);
  },
  // A reply names its parent (one level: a reply to a reply joins the same thread).
  async addComment({postId, body, parentId = ''}, u) { if (!user?.emailVerified) throw Error('Verify your sign-in email before commenting.'); const post = await this.getPost(postId); if (!post) throw Error('Post not found.'); const c = {postId, parentId: parentId || '', moduleId:post.moduleId, blogId: post.blogId || '', body, authorId: u.uid, authorName: u.penName || 'student', createdAt: Date.now(), likedBy: []}; const ref = await F.addDoc(F.collection(db, 'comments'), c); notify(); return {id: ref.id, ...c}; },
  // A thread goes with its first comment where the rules allow (staff, or replies of one's own);
  // a reply that cannot be removed is shown at the top level afterwards.
  async deleteComment(id) {
    await F.deleteDoc(F.doc(db, 'comments', id));
    const rs = await getDocs(F.query(F.collection(db, 'comments'), F.where('parentId', '==', id)));
    for (const r of rs.docs) { try { await F.deleteDoc(r.ref); } catch {} }
    notify();
  },
  async editComment(id, body, u) {
    if (!user?.emailVerified) throw Error('Verify your sign-in email before editing comments.');
    const ref = F.doc(db, 'comments', id), editedAt = Date.now();
    await F.updateDoc(ref, {body, editedAt}); notify(); return {id, ...(await getDoc(ref)).data()};
  },
  // Likes on a comment live on the comment (likedBy): the rules let an account add or remove only itself.
  async toggleCommentLike(id, u) {
    if (!user?.emailVerified) throw Error('Verify your sign-in email to like comments.');
    const ref = F.doc(db, 'comments', id), had = ((await getDoc(ref)).data()?.likedBy || []).includes(u.uid);
    await F.updateDoc(ref, {likedBy: had ? F.arrayRemove(u.uid) : F.arrayUnion(u.uid)});
    const n = ((await getDoc(ref)).data()?.likedBy || []).length;
    forget(); return {liked: !had, count: n};   // listComments is memoed: without this the redraw after the click shows the old likedBy (an unlike came straight back)
  },

  // ---- people (staff only, enforced by the rules) ----
  async listUsers(moduleId = '') {
    if (moduleId || role !== 'admin') {
      const ids = moduleId ? [moduleId] : managedModuleIds;
      const lists = await Promise.all(ids.map(id => getDocs(F.collection(db,'modules',id,'members')).then(s=>s.docs.map(d=>({uid:d.id,...d.data(),role:'student'})))));
      return [...new Map(lists.flat().map(x=>[x.uid,x])).values()];
    }
    const [dir, roles, profiles] = await Promise.all([getDocs(F.collection(db, 'userDirectory')), getDocs(F.collection(db, 'roles')), getDocs(F.collection(db, 'profiles'))]);
    const r = {}; roles.forEach(d => r[d.id] = d.data().role);
    const p = {}; profiles.forEach(d => p[d.id] = d.data());
    const directory=Object.fromEntries(dir.docs.map(d=>[d.id,d.data()]));
    return [...new Set([...Object.keys(p),...Object.keys(directory)])].map(uid=>({uid,...p[uid],...directory[uid],role:directory[uid]?.email===ADMIN_EMAIL?'admin':r[uid] || 'student'}));
  },
  async peopleReport(moduleId='') {
    if(!user?.emailVerified || !['admin','lecturer'].includes(role))throw Error('Admin or instructor access required.');
    const all=await this.listModules();
    const modules=all.filter(m=>(!moduleId || m.id===moduleId) && (role==='admin' || m.teacherIds.includes(user.uid)));
    if(moduleId&&!modules.length)throw Error('You do not have access to this module’s records.');
    const memberships=(await Promise.all(modules.map(async m=>{
      const s=await getDocs(F.collection(db,'modules',m.id,'members'));
      return s.docs.map(d=>({uid:d.id,...d.data(),moduleId:m.id}));
    }))).flat();
    const [users,instructorInvites,studentInvites]=await Promise.all([
      role==='admin'&&!moduleId?this.listUsers():Promise.resolve([]),
      role==='admin'&&!moduleId?this.listTeacherInvites():Promise.resolve([]),
      Promise.all(modules.map(m=>this.listModuleInvites(m.id))).then(a=>a.flat())
    ]);
    const report=buildPeopleReport({users,memberships,modules,instructorInvites,studentInvites,includePlatformUsers:role==='admin'&&!moduleId});
    const [posts,legacy,history,visits]=await Promise.all([this.listAllPosts(),this.listWritingSessions(moduleId),this.listWritingHistory(moduleId),this.listPresence(moduleId)]);
    const sessions=[...legacy.map(s=>({...s,id:'legacy-'+s.id})),...history];
    report.writing=writingReport(posts,sessions,modules,report.users,Date.now(),visits);report.sessions=sessionHistoryReport(posts,sessions,modules,report.users);report.moduleTotals=moduleWritingTotals(report.writing,memberships,modules,report.users);return report;
  },
  // ---- the Delete column of the People tables (people.js) ----
  // A student is removed from a module by its staff: the module membership and the blog membership it
  // brought go; the account and its posts stay, and the student writes in the module again only by
  // entering its invitation code.
  async removeMember(moduleId, uid) {
    if (!user || !['admin','lecturer'].includes(role)) throw Error('Instructor access required.');
    const m = await this.getModule(moduleId); if (!m) throw Error('Module not found.');
    if (!(role === 'admin' || m.teacherIds.includes(user.uid))) throw Error('You cannot manage this module.');
    const b = F.writeBatch(db); b.delete(F.doc(db, 'modules', moduleId, 'members', uid));
    if (m.blogId) { const bm = await getDoc(F.doc(db, 'blogs', m.blogId, 'members', uid)).catch(() => null); if (bm?.exists() && bm.data().moduleId === moduleId) b.delete(bm.ref); }
    await b.commit(); notify();
  },
  // An invitation is deleted outright (revoking keeps its record); its code goes with it (removeInvite).
  async deleteModuleInvite(id) { if (!user || !['admin','lecturer'].includes(role)) throw Error('Instructor access required.'); await removeInvite('moduleInvites', id); notify(); },
  async deleteTeacherInvite(id) { if (role !== 'admin') throw Error('Admin access required.'); await removeInvite('teacherInvites', id); notify(); },
  // The admin deletes an account from the site: its profile, directory row, registration mark, role,
  // every module and blog membership, and its unpublished posts. Its published posts stay on the blog,
  // with their comments. The sign-in itself (Firebase Auth) cannot be removed from the browser: the
  // person may sign in again and arrives as a new account, which must enter a module's invitation
  // code before it can write.
  async deleteAccount(uid) {
    if (role !== 'admin') throw Error('Admin access required.');
    if (uid === user.uid) throw Error('You cannot delete your own account.');
    const [modules, blogs, posts] = await Promise.all([this.listModules(), this.listBlogs(), getDocs(F.query(F.collection(db, 'posts'), F.where('authorId', '==', uid)))]);
    for (const d of posts.docs) if (d.data().status !== 'published') await removePost(d.id);
    const places = [...modules.map(m => F.doc(db, 'modules', m.id, 'members', uid)), ...blogs.map(b => F.doc(db, 'blogs', b.id, 'members', uid))];
    const held = (await Promise.all(places.map(r => getDoc(r).then(s => s.exists() ? r : null).catch(() => null)))).filter(Boolean);   // only rows that exist: a blog member's rule reads the row
    const refs = [...held, F.doc(db, 'roles', uid), F.doc(db, 'registeredUsers', uid), F.doc(db, 'userDirectory', uid), F.doc(db, 'profiles', uid)];
    let b = F.writeBatch(db), n = 0;
    for (const r of refs) { b.delete(r); if (++n === 450) { await b.commit(); b = F.writeBatch(db); n = 0; } }
    await b.commit(); notify();
  },
  async getAdminGuide(){const s=await getDoc(F.doc(db,'adminContent','guide'));if(!s.exists())throw Error('The admin guide is not available yet.');return s.data().html;},
  // ---- AI grading assistant (admin only; keys never reach the database) ----
  async getGraderConfig(){const s=await getDoc(F.doc(db,'adminContent','grader'));return s.exists()?s.data():null;},
  async saveGraderConfig(cfg){if(role!=='admin')throw Error('Admin access required.');const doc={persona:String(cfg.persona||''),instructions:String(cfg.instructions||''),polish:String(cfg.polish||''),updatedAt:Date.now(),updatedBy:user.uid};await F.setDoc(F.doc(db,'adminContent','grader'),doc);return doc;},
  async listAiReviews(moduleId=''){if(role!=='admin')return [];const col=F.collection(db,'aiReviews');const s=await getDocs(moduleId?F.query(col,F.where('moduleId','==',moduleId)):col);return s.docs.map(d=>({id:d.id,...d.data()}));},
  async saveAiReview(postId,patch){if(role!=='admin')throw Error('Admin access required.');const ref=F.doc(db,'aiReviews',postId);await F.setDoc(ref,{...patch,postId,updatedAt:Date.now()},{merge:true});const s=await getDoc(ref);return {id:postId,...s.data()};},
  // ---- peer review (study guide 5.3): one round per module, one record per reviewer and post ----
  // peerRounds/{moduleId}: the round's state (open/closed, deadline, seed), written by the admin.
  // peerReviews/{moduleId_postId_reviewerUid}: the assignment, filled in by the reviewer (grade,
  // assessment); the author never reads these. peerReviewerNotes/{moduleId_uid}: the AI's and the
  // admin's private view of a student's reviewing. peerReviewerReleases holds the reviewer's
  // released grade and note. peerSummaries/{postId} holds the author's released feedback.
  // A Google access token with extra scopes (sending mail, mail.js) from a popup on the signed-in Google account; returned, never stored.
  async googleAccessToken(scopes=[]){
    if(!user)throw Error('Sign in first.');
    const p=new A.GoogleAuthProvider();scopes.forEach(s=>p.addScope(s));if(user.email)p.setCustomParameters({login_hint:user.email});
    const viaGoogle=(user.providerData||[]).some(x=>x.providerId==='google.com');
    const res=viaGoogle?await A.reauthenticateWithPopup(user,p):await A.linkWithPopup(user,p);
    const token=A.GoogleAuthProvider.credentialFromResult(res)?.accessToken;if(!token)throw Error('Google gave no access token.');
    return {accessToken:token,email:user.email||'',name:user.displayName||''};
  },
  async getPeerPrompts(){if(role!=='admin')return null;const s=await getDoc(F.doc(db,'adminContent','peer'));return s.exists()?s.data():null;},
  async savePeerPrompts(cfg){if(role!=='admin')throw Error('Admin access required.');const doc={synthesis:String(cfg.synthesis||''),reviewer:String(cfg.reviewer||''),noticeSubject:String(cfg.noticeSubject||''),noticeBody:String(cfg.noticeBody||''),updatedAt:Date.now(),updatedBy:user.uid};await F.setDoc(F.doc(db,'adminContent','peer'),doc);return doc;},
  async getPeerRound(moduleId){if(!user)return null;try{const s=await getDoc(F.doc(db,'peerRounds',moduleId));return s.exists()?{id:s.id,...s.data()}:null;}catch{return null;}},
  async savePeerRound(moduleId,patch){if(role!=='admin')throw Error('Admin access required.');const ref=F.doc(db,'peerRounds',moduleId);await F.setDoc(ref,{...patch,moduleId,updatedAt:Date.now(),updatedBy:user.uid},{merge:true});const s=await getDoc(ref);notify();return {id:moduleId,...s.data()};},
  async assignPeerReviews(moduleId,rows){if(role!=='admin')throw Error('Admin access required.');const now=Date.now();let b=F.writeBatch(db),n=0;
    for(const r of rows){b.set(F.doc(db,'peerReviews',reviewId(moduleId,r.postId,r.reviewerUid)),{moduleId,blogId:r.blogId||'',postId:r.postId,authorId:r.authorId,reviewerUid:r.reviewerUid,reviewerName:r.reviewerName||'',order:r.order||0,assignedAt:now,grade:null,assessment:'',submittedAt:null,updatedAt:now});if(++n===450){await b.commit();b=F.writeBatch(db);n=0;}}
    if(n)await b.commit();notify();},
  async listPeerReviews(moduleId){if(role!=='admin')return [];const s=await getDocs(F.query(F.collection(db,'peerReviews'),F.where('moduleId','==',moduleId)));return s.docs.map(d=>({id:d.id,...d.data()}));},
  async listMyPeerReviews(){if(!user)return [];const s=await getDocs(F.query(F.collection(db,'peerReviews'),F.where('reviewerUid','==',user.uid)));return s.docs.map(d=>({id:d.id,...d.data()}));},
  async getPeerReview(id){if(!user)return null;try{const s=await getDoc(F.doc(db,'peerReviews',id));return s.exists()?{id,...s.data()}:null;}catch{return null;}},
  async submitPeerReview(id,{grade,assessment}){if(!user?.emailVerified)throw Error('Verify your sign-in email before submitting a review.');const now=Date.now();await F.updateDoc(F.doc(db,'peerReviews',id),{grade,assessment,submittedAt:now,updatedAt:now});notify();return this.getPeerReview(id);},
  async savePeerReview(id,patch){if(role!=='admin')throw Error('Admin access required.');const ref=F.doc(db,'peerReviews',id);await F.setDoc(ref,{...patch,updatedAt:Date.now()},{merge:true});const s=await getDoc(ref);return {id,...s.data()};},
  async deletePeerRound(moduleId){if(role!=='admin')throw Error('Admin access required.');
    const lists=await Promise.all(['peerReviews','peerReviewerNotes','peerReviewerReleases','peerSummaries'].map(c=>getDocs(F.query(F.collection(db,c),F.where('moduleId','==',moduleId)))));
    let b=F.writeBatch(db),n=0;for(const d of lists.flatMap(s=>s.docs)){b.delete(d.ref);if(++n===450){await b.commit();b=F.writeBatch(db);n=0;}}
    b.delete(F.doc(db,'peerRounds',moduleId));await b.commit();notify();},
  async savePeerReviewerNote(moduleId, reviewerUid, patch) {
    if (role !== 'admin') throw Error('Admin access required.');
    const id = `${moduleId}_${reviewerUid}`, ref = F.doc(db, 'peerReviewerNotes', id);
    const data = {...patch, moduleId, reviewerUid, updatedAt: Date.now()};
    if (patch.releasedAt) {
      return F.runTransaction(db, async tx => {
        const previous = await tx.get(ref);
        if (!previous.exists()) throw Error('Save a grade or note before releasing it.');
        const next = {...previous.data(), ...data};
        tx.update(ref, data);
        tx.set(F.doc(db, 'peerReviewerReleases', id), reviewerRelease(next));
        return {id, ...next};
      });
    }
    await F.setDoc(ref, data, {merge: true});
    return {id, ...(await getDoc(ref)).data()};
  },
  async listPeerReviewerNotes(moduleId){if(role!=='admin')return [];const s=await getDocs(F.query(F.collection(db,'peerReviewerNotes'),F.where('moduleId','==',moduleId)));return s.docs.map(d=>({id:d.id,...d.data()}));},
  async getMyPeerReviewerNote(moduleId){if(!user)return null;try{const s=await getDoc(F.doc(db,'peerReviewerReleases',`${moduleId}_${user.uid}`));return s.exists()?{id:s.id,...s.data()}:null;}catch{return null;}},
  async releasePeerSummaries(rows){if(role!=='admin')throw Error('Admin access required.');const now=Date.now();let b=F.writeBatch(db),n=0;for(const r of rows){b.set(F.doc(db,'peerSummaries',r.postId),{...r,releasedAt:now,updatedAt:now});if(++n===450){await b.commit();b=F.writeBatch(db);n=0;}}if(n)await b.commit();notify();},
  async listPeerSummaries(moduleId){if(role!=='admin')return [];const s=await getDocs(F.query(F.collection(db,'peerSummaries'),F.where('moduleId','==',moduleId)));return s.docs.map(d=>({id:d.id,...d.data()}));},
  async getPeerSummary(postId){if(!user)return null;try{const s=await getDoc(F.doc(db,'peerSummaries',postId));return s.exists()?{id:postId,...s.data()}:null;}catch{return null;}},
  async getProfile(uid) { const s = await getDoc(F.doc(db, 'profiles', uid)); return s.exists() ? {uid, ...s.data()} : null; },
  async saveProfile(uid, patch) {
    await F.setDoc(F.doc(db, 'profiles', uid), patch, {merge: true});
    if (user && user.uid === uid) {
      profile = {...profile, ...patch}; await touchDirectory(user, profile);
      if (user.emailVerified && profile.contactEmail) {
        const modules = await this.listMyModules();
        for (const m of modules.filter(m=>!m.teaching)) await this.joinModule(m.id);
      }
    }
    notify(); return {uid, ...profile};
  },
  async setRole(uid, newRole) { await F.setDoc(F.doc(db, 'roles', uid), {role: newRole, setBy: user?.uid || '', setAt: Date.now()}); notify(); },

  // ---- feedback button (anyone submits; the admin reads) ----
  // The parent and its attachment documents go in one batch, so a submission is
  // either complete or absent; the rules check existsAfter() on the parent.
  async submitFeedback(doc, attachments = []) {
    const ref = F.doc(F.collection(db, 'feedback')), batch = F.writeBatch(db);
    batch.set(ref, doc);
    attachments.forEach((a, i) => batch.set(F.doc(db, 'feedback', ref.id, 'attachments', String(i)), a));
    await batch.commit();
    return {id: ref.id, ticket: doc.ticket};
  },
  async listFeedback() { if (role !== 'admin') return []; const s = await getDocs(F.collection(db, 'feedback')); return s.docs.map(norm).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); },
  async listFeedbackAttachments(id) { const s = await getDocs(F.collection(db, 'feedback', id, 'attachments')); return s.docs.map(d => ({id: d.id, ...d.data()})).sort((a, b) => (a.order || 0) - (b.order || 0)); },
  async updateFeedback(id, patch) { if (role !== 'admin') throw Error('Admin access required.'); await F.updateDoc(F.doc(db, 'feedback', id), patch); },
  async deleteFeedback(id) {
    if (role !== 'admin') throw Error('Admin access required.');
    const atts = await getDocs(F.collection(db, 'feedback', id, 'attachments')), batch = F.writeBatch(db);
    atts.docs.forEach(d => batch.delete(d.ref)); batch.delete(F.doc(db, 'feedback', id));
    await batch.commit();
  },

  // ---- site ----
  async saveSettings(patch) { settings = {...settings, ...patch}; await F.setDoc(F.doc(db, 'settings', 'site'), settings); notify(); return settings; },
  async exportAll() { const [blogs, modules, posts, comments, users] = await Promise.all([this.listBlogs(), this.listModules(), this.listAllPosts(), getDocs(F.collection(db, 'comments')).then(s => s.docs.map(norm)), this.listUsers()]); return {settings, blogs, modules, posts, comments, users}; },
  async resetDemo() { throw Error('Not available with Firebase; delete documents in the Firebase console.'); },
};
for (const k of MEMOED) { const fn = firebase[k]; firebase[k] = function (...a) { return remember(k + '|' + (user?.uid || '') + '|' + role + '|' + JSON.stringify(a), () => fn.apply(this, a)); }; }
