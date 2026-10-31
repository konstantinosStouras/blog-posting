// FIREBASE backend: Auth + Firestore, loaded from the CDN only when firebase-config.js
// holds a real config. Collections and the profile shape follow operationsacademia.org
// and stouras.com/lit:
//   profiles/{uid}          the account's own profile (owner read/write; staff read)
//   userDirectory/{uid}     roster row: name, email (pinned to the token), first, seen
//   registeredUsers/{uid}   contentless registration mark {t}
//   roles/{uid}             {role: student|lecturer|admin}, written by the admin only
//   blogs/{id}              a public canvas and its exercise, owned by instructors (teacherIds)
//   blogs/{id}/members/{uid} link from a module membership, so the whole canvas can comment
//   modules/{id}            a cohort: roster, invitations, academic year, deadline, blogId
//   posts/{id}, comments/{id}, settings/site
import {firebaseConfig, ADMIN_EMAIL} from './firebase-config.js';
import {DEFAULT_SETTINGS, EMPTY_EXERCISE} from './seed.js';
import {newId, slugify, wordCount, excerptOf} from './util.js';
import {registrationProfile} from './registration.js';
import {randomCity, normalizeCode} from './invitation-codes.js';
import {buildPeopleReport} from './people-model.js';
import {writingReport} from './writing-time.js';

const V = '13.0.0', cdn = m => `https://www.gstatic.com/firebasejs/${V}/firebase-${m}.js`;
let app, auth, db, A, F, user = null, profile = null, role = 'student', settings = {...DEFAULT_SETTINGS};
let registration = null;
let managedModuleIds = [], managedBlogIds = [];
async function refreshManaged(self) {
  if (!user) { managedModuleIds = []; managedBlogIds = []; return; }
  const [modules, blogs] = await Promise.all([self.listModules(), self.listBlogs()]);
  managedModuleIds = modules.filter(m => m.teacherIds.includes(user.uid)).map(m => m.id);
  managedBlogIds = blogs.filter(b => b.teacherIds.includes(user.uid)).map(b => b.id);
}
const listeners = new Set(), notify = () => listeners.forEach(fn => fn());
const ts = v => (v && typeof v.toMillis === 'function') ? v.toMillis() : (v ?? null);
const norm = d => { const o = {id: d.id, ...d.data()}; for (const k of ['createdAt', 'updatedAt', 'publishedAt']) if (k in o) o[k] = ts(o[k]); return o; };
async function createCodedInvite(kind, data) {
  const inviteId = crypto.randomUUID();
  for (let attempt=0;attempt<60;attempt++) {
    const code=randomCity(),codeKey=normalizeCode(code),collection=kind==='instructor'?'teacherInvites':'moduleInvites';
    const result=await F.runTransaction(db,async tx=>{
      const codeRef=F.doc(db,'registrationCodes',codeKey);
      if((await tx.get(codeRef)).exists())return null;
      tx.set(F.doc(db,collection,inviteId),{...data,code:codeKey});
      tx.set(codeRef,{kind,inviteId,moduleId:data.moduleId || '',code:codeKey,expiresAt:data.expiresAt,revoked:false});
      return {id:inviteId,...data,code};
    });
    if(result)return result;
  }
  throw Error('Could not allocate an unused city code. Please try again.');
}

async function loadRole(uid, email, verified) {
  if (verified && email === ADMIN_EMAIL) return 'admin';
  try { const snap = await F.getDoc(F.doc(db, 'roles', uid)); if (snap.exists() && snap.data().role) return snap.data().role; } catch {}
  return (verified && email === ADMIN_EMAIL) ? 'admin' : 'student';
}
async function ensureProfile(u) {
  const ref = F.doc(db, 'profiles', u.uid);
  const snap = await F.getDoc(ref);
  if (snap.exists()) return snap.data();
  const [firstName = '', ...rest] = (u.displayName || '').split(' ');
  const p = {firstName, lastName: rest.join(' '), penName: 'student_' + u.uid.slice(0, 12), affiliation: '', studentId: '', website: '', bio: '', contactEmail: '', photo: '', registrationKind: 'student'};
  if (registration && registration.email === u.email) Object.assign(p, registration.profile);
  await F.setDoc(ref, p);
  return p;
}
async function touchDirectory(u, p) {
  const ref = F.doc(db, 'userDirectory', u.uid);
  const snap = await F.getDoc(ref).catch(() => null);
  const now=Date.now(),signedInAt=Date.parse(u.metadata?.lastSignInTime || '') || now;
  const row = {name: [p.firstName, p.lastName].filter(Boolean).join(' ') || p.penName, firstName:p.firstName || '',lastName:p.lastName || '',studentId:p.studentId || '',penName: p.penName, affiliation: p.affiliation || '', contactEmail: p.contactEmail || '', first: snap?.exists() ? snap.data().first : now, seen:now,signedInAt,emailVerified:!!u.emailVerified};
  if (u.email) row.email = u.email;
  await F.setDoc(ref, row);
  await F.setDoc(F.doc(db, 'registeredUsers', u.uid), {t: Date.now()}).catch(() => {});
  if(u.emailVerified){
    const modules=await F.getDocs(F.collection(db,'modules'));
    await Promise.all(modules.docs.map(async m=>{
      const ref=F.doc(db,'modules',m.id,'members',u.uid),member=await F.getDoc(ref);
      if(member.exists()) await F.updateDoc(ref,{firstName:p.firstName || '',lastName:p.lastName || '',studentId:p.studentId || '',affiliation:p.affiliation || '',contactEmail:p.contactEmail || '',penName:p.penName,email:u.email,lastSeenAt:now,lastSignInAt:signedInAt});
    }));
  }
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
        if (u) { try { profile = await ensureProfile(u); role = await loadRole(u.uid, u.email, u.emailVerified); await refreshManaged(this); await touchDirectory(u, profile); } catch (e) { console.warn(e); profile = profile || {penName: 'student'}; } }
        else { profile = null; role = 'student'; managedModuleIds = []; managedBlogIds = []; }
        notify(); resolve();
      });
    });
    return settings;
  },
  settings: () => settings,
  onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },

  // ---- auth ----
  currentUser() { return user ? {uid: user.uid, email: user.email || '', emailVerified: user.emailVerified, ...profile, role, managedModuleIds, managedBlogIds} : null; },
  async signIn(provider, {email, password, googleEmail} = {}) {
    let cred;
    if (provider === 'google.com') {
      const google = new A.GoogleAuthProvider();
      if (googleEmail) google.setCustomParameters({login_hint: googleEmail});
      cred = await A.signInWithPopup(auth, google);
    } else if (provider === 'password') cred = await A.signInWithEmailAndPassword(auth, email, password);
    else throw Error('Unknown sign-in method.');
    user = cred.user; profile = await ensureProfile(user);
    role = await loadRole(user.uid, user.email, user.emailVerified);
    await refreshManaged(this);
    await touchDirectory(user, profile); notify(); return cred;
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
      user = cred.user;
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
    role = await loadRole(user.uid, user.email, user.emailVerified); notify();
    return user.emailVerified;
  },
  async signOut() { await A.signOut(auth); },

  // Public module metadata is separate from private enrolment/roster records.
  async listModules() { const s = await F.getDocs(F.collection(db, 'modules')); return s.docs.map(norm).sort((a,b) => a.title.localeCompare(b.title)); },
  async getModule(id) { const s = await F.getDoc(F.doc(db, 'modules', id)); return s.exists() ? norm(s) : null; },
  // ---- blogs: the public canvas and the exercise written on it ----
  async listBlogs() { const s = await F.getDocs(F.collection(db, 'blogs')); return s.docs.map(norm).sort((a, b) => a.title.localeCompare(b.title)); },
  async getBlog(id) { if (!id) return null; const s = await F.getDoc(F.doc(db, 'blogs', id)); return s.exists() ? norm(s) : null; },
  async listMyBlogs() { if (!user) return []; return (await this.listBlogs()).filter(b => role === 'admin' || b.teacherIds.includes(user.uid)); },
  async saveBlog(data) {
    if (!user || !['admin','lecturer'].includes(role)) throw Error('Instructor access required.');
    const id = data.id || slugify(data.urlName || data.title);
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(id)) throw Error('Choose a URL name of 2–80 lowercase letters, numbers or hyphens.');
    const existing = await this.getBlog(id);
    if (!data.id && existing) throw Error('That blog URL already exists. Choose another.');
    const now = Date.now();
    const doc = {...EMPTY_EXERCISE, allowComments: true, ...(existing || {}), ...data, updatedAt: now};
    delete doc.id; delete doc.urlName;
    doc.title = String(doc.title || '').trim(); doc.description = String(doc.description || '').trim();
    doc.teacherIds = existing?.teacherIds || [user.uid]; doc.createdBy = existing?.createdBy || user.uid; doc.createdAt = existing?.createdAt || now;
    if (!doc.title) throw Error('Enter a blog title.');
    await F.setDoc(F.doc(db, 'blogs', id), doc);
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
    if (!id) {
      const base = slugify([data.code || data.title, data.academicYear].filter(Boolean).join(' '));
      if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(base)) throw Error('Enter a module title.');
      id = base; for (let n = 2; await this.getModule(id); n++) id = base + '-' + n;
    }
    const doc = {title: String(data.title || '').trim(), code: String(data.code || '').trim(), academicYear: String(data.academicYear || '').trim(), description: String(data.description || '').trim(), blogId, deadline: String(data.deadline || ''), teacherName: existing?.teacherName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' '), teacherIds: existing?.teacherIds || [user.uid], createdBy: existing?.createdBy || user.uid, createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now(), submissionsOpen: data.submissionsOpen !== false, requireApproval: !!data.requireApproval};
    if (!doc.title) throw Error('Enter a module title.');
    await F.setDoc(F.doc(db, 'modules', id), doc);
    await refreshManaged(this);
    notify(); return {id, ...doc};
  },
  async listMyModules() {
    if (!user) return [];
    const modules = await this.listModules();
    const rows = await Promise.all(modules.map(async m => {
      if (m.teacherIds.includes(user.uid) || role === 'admin') return {...m, teaching: true};
      const member = await F.getDoc(F.doc(db, 'modules', m.id, 'members', user.uid));
      return member.exists() ? {...m, teaching: false} : null;
    }));
    return rows.filter(Boolean);
  },
  async joinModule(id, inviteId = '') {
    if (!user) throw Error('Sign in to join a module.');
    if (!user.emailVerified) throw Error('Verify your sign-in email first, then refresh verification from the account menu.');
    const m = await this.getModule(id); if (!m) throw Error('Module not found.');
    if (m.teacherIds.includes(user.uid) || role === 'admin') return;
    const ref=F.doc(db,'modules',id,'members',user.uid),existing=await F.getDoc(ref);
    inviteId=existing.data()?.inviteId || inviteId || '';
    if(!inviteId)throw Error('An invitation from your instructor is required to join this module.');
    if(!existing.exists()){
      const invite=await F.getDoc(F.doc(db,'moduleInvites',inviteId));
      if(!invite.exists() || invite.data().moduleId!==id || invite.data().revoked || invite.data().expiresAt<Date.now())throw Error('This module invitation has expired or is not valid.');
    }
    const details = registrationProfile(profile, ['teacher','instructor'].includes(profile?.registrationKind));
    const now=Date.now(), joinedAt = existing.data()?.joinedAt || now;
    const batch = F.writeBatch(db);
    batch.set(ref, {uid:user.uid, ...details, penName:profile.penName, email:user.email, joinedAt,inviteId,lastSeenAt:now,lastSignInAt:Date.parse(user.metadata?.lastSignInTime || '') || now});
    if (m.blogId) batch.set(F.doc(db,'blogs',m.blogId,'members',user.uid), {uid:user.uid, moduleId:id, joinedAt});
    await batch.commit();
    notify();
  },
  async resolveRegistrationCode(code) {
    const key=normalizeCode(code);
    if(!/^[a-z]+$/.test(key))throw Error('Enter the city code supplied with your invitation.');
    const s=await F.getDoc(F.doc(db,'registrationCodes',key));
    if(!s.exists() || s.data().revoked || s.data().expiresAt<Date.now())throw Error('That registration code is invalid, revoked or expired.');
    return s.data();
  },
  async createModuleInvite(moduleId, recipientEmail='') {
    recipientEmail=recipientEmail.trim().toLowerCase();
    if(recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail))throw Error('Enter a valid student university email or leave it blank for a shared class link.');
    return createCodedInvite('student',{moduleId,recipientEmail,createdBy:user.uid,createdAt:Date.now(),expiresAt:Date.now()+30*86400000,revoked:false});
  },
  async listModuleInvites(moduleId) {const s=await F.getDocs(F.query(F.collection(db,'moduleInvites'),F.where('moduleId','==',moduleId)));return s.docs.map(norm).sort((a,b)=>b.createdAt-a.createdAt);},
  async revokeModuleInvite(id) {const ref=F.doc(db,'moduleInvites',id),s=await F.getDoc(ref),batch=F.writeBatch(db);batch.update(ref,{revoked:true});if(s.data()?.code)batch.update(F.doc(db,'registrationCodes',s.data().code),{revoked:true});await batch.commit();},
  async createTeacherInvite({universityEmail, ucdEmail, gmail}) {
    const email = String(universityEmail || ucdEmail || '').trim().toLowerCase(), googleEmail = String(gmail || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Enter the instructor’s university email.');
    if (googleEmail && !/^[^\s@]+@gmail\.com$/.test(googleEmail)) throw Error('Enter a Gmail address or leave it blank.');
    const doc = {ucdEmail:email, gmail:googleEmail, createdBy:user.uid, createdAt:Date.now(), expiresAt:Date.now()+7*86400000, acceptedBy:'', revoked:false};
    return createCodedInvite('instructor',doc);
  },
  async listTeacherInvites() { const s = await F.getDocs(F.collection(db,'teacherInvites')); return s.docs.map(norm).sort((a,b)=>b.createdAt-a.createdAt); },
  async revokeTeacherInvite(id) {const ref=F.doc(db,'teacherInvites',id),s=await F.getDoc(ref),batch=F.writeBatch(db);batch.update(ref,{revoked:true});if(s.data()?.code)batch.update(F.doc(db,'registrationCodes',s.data().code),{revoked:true});await batch.commit();},
  async acceptTeacherInvite(id) {
    if (!user?.emailVerified) throw Error('Verify your sign-in email before accepting the invitation.');
    const ref = F.doc(db,'teacherInvites',id), s = await F.getDoc(ref);
    if (!s.exists()) throw Error('Invitation not found.');
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
    let q;
    if (f.authorId) q = F.query(col, F.where('authorId', '==', f.authorId));
    else if (f.status) q = F.query(col, F.where('status', '==', f.status));
    else q = F.query(col, F.where('status', '==', 'published')); // staff list everything via listAll()
    const snap = await F.getDocs(q);
    let rows = snap.docs.map(norm);
    if (f.status) rows = rows.filter(p => p.status === f.status);
    if (f.moduleId) rows = rows.filter(p => p.moduleId === f.moduleId);
    if (f.blogId) rows = rows.filter(p => p.blogId === f.blogId);
    return rows;
  },
  async listAllPosts() {
    if (role === 'admin') { const snap = await F.getDocs(F.collection(db,'posts')); return snap.docs.map(norm); }
    const byModule = managedModuleIds.map(id => F.getDocs(F.query(F.collection(db,'posts'),F.where('moduleId','==',id))).then(s=>s.docs.map(norm)));
    const byBlog = managedBlogIds.map(id => F.getDocs(F.query(F.collection(db,'posts'),F.where('blogId','==',id))).then(s=>s.docs.map(norm)));
    const rows = (await Promise.all([...byModule, ...byBlog])).flat();
    return [...new Map(rows.map(p => [p.id, p])).values()];
  },
  async beginWritingSession(row) {const {id,...data}=row;await F.runTransaction(db,async tx=>{const ref=F.doc(db,'writingSessions',id),s=await tx.get(ref);if(!s.exists())tx.set(ref,{...data,seconds:0});});},
  async saveWritingSession(row) {await this.beginWritingSession(row);await F.runTransaction(db,async tx=>{const ref=F.doc(db,'writingSessions',row.id),s=await tx.get(ref);if(row.seconds>s.data().seconds)tx.update(ref,{seconds:row.seconds});});},
  async writingSeconds(postId) {try{for(const row of JSON.parse(localStorage.getItem(`ucd-writing:${user.uid}:${postId}`)||'[]'))if(row.uid===user.uid&&row.postId===postId)await this.saveWritingSession(row);}catch{}const s=await F.getDocs(F.query(F.collection(db,'writingSessions'),F.where('uid','==',user.uid),F.where('postId','==',postId)));return s.docs.reduce((n,d)=>n+d.data().seconds,0);},
  async listWritingSessions(moduleId='') {const ids=moduleId?[moduleId]:managedModuleIds;if(role==='admin'&&!moduleId){const s=await F.getDocs(F.collection(db,'writingSessions'));return s.docs.map(norm);}return (await Promise.all(ids.map(id=>F.getDocs(F.query(F.collection(db,'writingSessions'),F.where('moduleId','==',id))).then(s=>s.docs.map(norm))))).flat();},
  async getPost(id) { const s = await F.getDoc(F.doc(db, 'posts', id)); return s.exists() ? norm(s) : null; },
  async getPostBySlug(slug) {
    const col = F.collection(db, 'posts'), bySlug = F.where('slug', '==', slug);
    const staff = user && role === 'admin';
    if (user && !staff) {
      const own = await F.getDocs(F.query(col, bySlug, F.where('authorId', '==', user.uid), F.limit(1)));
      if (!own.empty) return norm(own.docs[0]);
      for (const moduleId of managedModuleIds) {
        const taught = await F.getDocs(F.query(col,bySlug,F.where('moduleId','==',moduleId),F.limit(1)));
        if (!taught.empty) return norm(taught.docs[0]);
      }
      for (const blogId of managedBlogIds) {
        const owned = await F.getDocs(F.query(col,bySlug,F.where('blogId','==',blogId),F.limit(1)));
        if (!owned.empty) return norm(owned.docs[0]);
      }
    }
    const filters = staff ? [bySlug] : [bySlug, F.where('status', '==', 'published')];
    const s = await F.getDocs(F.query(col, ...filters, F.limit(1)));
    return s.empty ? null : norm(s.docs[0]);
  },
  async savePost(post, u) {
    const id = post.id || newId();
    const existing = post.id ? await this.getPost(id) : null;
    const module = await this.getModule(post.moduleId || existing?.moduleId);
    if (!module) throw Error('Choose a module before saving.');
    if (!module.blogId) throw Error('This module is not attached to a blog yet. Ask your instructor.');
    const now = Date.now();
    // Every post is stamped with its module's blog and academic year; the rules check the blog.
    const doc = {...(existing || {createdAt: now, authorId: u.uid, featured: false}), ...post, moduleId: module.id, blogId: module.blogId, academicYear: existing?.academicYear || module.academicYear || '', updatedAt: now};
    delete doc.id;
    doc.authorName = existing && existing.authorId !== u.uid ? existing.authorName : (u.penName || 'student');
    doc.slug = doc.slug || slugify(doc.title);
    if (!existing || existing.slug !== doc.slug) { const clash = await this.getPostBySlug(doc.slug); if (clash && clash.id !== id) doc.slug += '-' + id.slice(0, 4); }
    doc.wordCount = wordCount(doc.body); doc.excerpt = String(doc.excerpt || '').trim();   // the subtitle; cards fall back to an excerpt of the body
    if (doc.status === 'published' && !doc.publishedAt) doc.publishedAt = now;
    if (doc.status !== 'published') doc.publishedAt = existing?.publishedAt || null;
    await F.setDoc(F.doc(db, 'posts', id), doc);
    notify(); return {id, ...doc};
  },
  async deletePost(id) {
    const [cs, ls] = await Promise.all([F.getDocs(F.query(F.collection(db, 'comments'), F.where('postId', '==', id))), F.getDocs(F.collection(db, 'posts', id, 'likes'))]);
    const b = F.writeBatch(db); cs.forEach(c => b.delete(c.ref)); ls.forEach(l => b.delete(l.ref)); b.delete(F.doc(db, 'posts', id)); await b.commit(); notify();
  },
  async pollVotes(postId, pollId, u) {
    const s = await F.getDocs(F.query(F.collection(db, 'posts', postId, 'votes'), F.where('pollId', '==', pollId)));
    const counts = {}; let mine = null, total = 0;
    s.forEach(d => { const v = d.data(); counts[v.option] = (counts[v.option] || 0) + 1; total++; if (u && v.uid === u.uid) mine = v.option; });
    return {counts, mine, total};
  },
  async votePoll(postId, pollId, option, u) {
    if (!user?.emailVerified) throw Error('Verify your sign-in email to vote.');
    await F.setDoc(F.doc(db, 'posts', postId, 'votes', pollId + '_' + u.uid), {pollId, uid: u.uid, option, t: Date.now()});
    return this.pollVotes(postId, pollId, u);
  },
  async listLikes(postId) { try { const s = await F.getDocs(F.collection(db, 'posts', postId, 'likes')); return s.docs.map(d => d.id); } catch { return []; } },
  async toggleLike(postId, u) {
    if (!user?.emailVerified) throw Error('Verify your sign-in email to like posts.');
    const ref = F.doc(db, 'posts', postId, 'likes', u.uid), had = (await F.getDoc(ref)).exists();
    if (had) await F.deleteDoc(ref); else await F.setDoc(ref, {t: Date.now()});
    const likes = await this.listLikes(postId); return {liked: !had, count: likes.length};
  },

  // ---- comments ----
  async listComments(postId) { const s = await F.getDocs(F.query(F.collection(db, 'comments'), F.where('postId', '==', postId))); return s.docs.map(norm).sort((a, b) => a.createdAt - b.createdAt); },
  async recentComments(n = 5) { const s = await F.getDocs(F.query(F.collection(db, 'comments'), F.orderBy('createdAt', 'desc'), F.limit(n))); return s.docs.map(norm); },
  async addComment({postId, body}, u) { const post = await this.getPost(postId); if (!post) throw Error('Post not found.'); const c = {postId, moduleId:post.moduleId, blogId: post.blogId || '', body, authorId: u.uid, authorName: u.penName || 'student', createdAt: Date.now()}; const ref = await F.addDoc(F.collection(db, 'comments'), c); notify(); return {id: ref.id, ...c}; },
  async deleteComment(id) { await F.deleteDoc(F.doc(db, 'comments', id)); notify(); },

  // ---- people (staff only, enforced by the rules) ----
  async listUsers(moduleId = '') {
    if (moduleId || role !== 'admin') {
      const ids = moduleId ? [moduleId] : managedModuleIds;
      const lists = await Promise.all(ids.map(id => F.getDocs(F.collection(db,'modules',id,'members')).then(s=>s.docs.map(d=>({uid:d.id,...d.data(),role:'student'})))));
      return [...new Map(lists.flat().map(x=>[x.uid,x])).values()];
    }
    const [dir, roles, profiles] = await Promise.all([F.getDocs(F.collection(db, 'userDirectory')), F.getDocs(F.collection(db, 'roles')), F.getDocs(F.collection(db, 'profiles'))]);
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
      const s=await F.getDocs(F.collection(db,'modules',m.id,'members'));
      return s.docs.map(d=>({uid:d.id,...d.data(),moduleId:m.id}));
    }))).flat();
    const [users,instructorInvites,studentInvites]=await Promise.all([
      role==='admin'&&!moduleId?this.listUsers():Promise.resolve([]),
      role==='admin'&&!moduleId?this.listTeacherInvites():Promise.resolve([]),
      Promise.all(modules.map(m=>this.listModuleInvites(m.id))).then(a=>a.flat())
    ]);
    const report=buildPeopleReport({users,memberships,modules,instructorInvites,studentInvites,includePlatformUsers:role==='admin'&&!moduleId});
    const [posts,sessions]=await Promise.all([this.listAllPosts(),this.listWritingSessions(moduleId)]);
    report.writing=writingReport(posts,sessions,modules,report.users);return report;
  },
  async getAdminGuide(){const s=await F.getDoc(F.doc(db,'adminContent','guide'));if(!s.exists())throw Error('The admin guide is not available yet.');return s.data().html;},
  async getProfile(uid) { const s = await F.getDoc(F.doc(db, 'profiles', uid)); return s.exists() ? {uid, ...s.data()} : null; },
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

  // ---- site ----
  async saveSettings(patch) { settings = {...settings, ...patch}; await F.setDoc(F.doc(db, 'settings', 'site'), settings); notify(); return settings; },
  async exportAll() { const [blogs, modules, posts, comments, users] = await Promise.all([this.listBlogs(), this.listModules(), this.listAllPosts(), F.getDocs(F.collection(db, 'comments')).then(s => s.docs.map(norm)), this.listUsers()]); return {settings, blogs, modules, posts, comments, users}; },
  async resetDemo() { throw Error('Not available with Firebase; delete documents in the Firebase console.'); },
};
