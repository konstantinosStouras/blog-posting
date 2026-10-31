import {before,after,beforeEach,test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,query,where,updateDoc,writeBatch} from 'firebase/firestore';
let env;
const time=Date.now();
const profile=(email='student@ucdconnect.ie')=>({firstName:'Student',lastName:'Example',penName:'student_alias',studentId:'12345678',contactEmail:email,affiliation:'Example University',registrationKind:'student'});
const mod=(uid)=>({title:'Test module',code:'TEST',description:'',teacherName:'Teacher',teacherIds:[uid],createdBy:uid,createdAt:time,updatedAt:time,submissionsOpen:true,requireApproval:false,allowComments:true});
const post=(moduleId='one',authorId='student',status='draft')=>({moduleId,authorId,status,title:'Test post',slug:'test-post',body:'<p>Test content</p>',featured:false,authorName:'student_alias',createdAt:time,updatedAt:time});
const member=(uid='student')=>({uid,...profile(),penName:'student_alias',email:'student@ucdconnect.ie',joinedAt:time,inviteId:'student-valid'});
const invite=(extra={})=>({ucdEmail:'invited@ucd.ie',gmail:'invited@gmail.com',createdBy:'admin',createdAt:time,expiresAt:time+86400000,acceptedBy:'',revoked:false,...extra});
const db=(uid,email=uid+'@ucd.ie',verified=true)=>env.authenticatedContext(uid,{email,email_verified:verified,firebase:{sign_in_provider:'password'}}).firestore();
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-ucd-blog',firestore:{rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});});
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{
  const d=c.firestore(),b=writeBatch(d);
  for(const [path,data] of Object.entries({
   'roles/teacher-one':{role:'lecturer'},'roles/teacher-two':{role:'lecturer'},
   'modules/one':mod('teacher-one'),'modules/two':mod('teacher-two'),
   'modules/one/members/student':member(),'profiles/student':profile(),
   'profiles/invited':{...profile('invited@ucd.ie'),studentId:'',registrationKind:'teacher'},
   'teacherInvites/valid':invite(),'teacherInvites/expired':invite({expiresAt:time-1000}),
   'teacherInvites/revoked':invite({revoked:true}),'teacherInvites/used':invite({acceptedBy:'someone-else'}),
   'moduleInvites/student-valid':{moduleId:'one',code:'madrid',createdBy:'teacher-one',createdAt:time,expiresAt:time+86400000,revoked:false},
   'moduleInvites/student-expired':{moduleId:'one',code:'rome',createdBy:'teacher-one',createdAt:time,expiresAt:time-1000,revoked:false},
   'registrationCodes/madrid':{kind:'student',inviteId:'student-valid',moduleId:'one',code:'madrid',expiresAt:time+86400000,revoked:false},
   'posts/draft':post(),'posts/published':post('one','student','published'),'posts/other-draft':post('two','other'),
   'comments/comment':{postId:'published',moduleId:'one',authorId:'student',authorName:'alias',body:'Hello',createdAt:time}
  }))b.set(doc(d,path),data);
  await b.commit();
 });
});
test('public readers see modules and published posts, not drafts, rosters, profiles or invites',async()=>{
 const d=env.unauthenticatedContext().firestore();
 await assertSucceeds(getDocs(collection(d,'modules')));
 await assertSucceeds(getDocs(query(collection(d,'posts'),where('status','==','published'))));
 await assertFails(getDoc(doc(d,'posts/draft')));
 await assertFails(getDoc(doc(d,'profiles/student')));
 await assertFails(getDocs(collection(d,'modules/one/members')));
 await assertFails(getDoc(doc(d,'teacherInvites/valid')));
 await assertFails(setDoc(doc(d,'comments/anon'),{postId:'published',moduleId:'one',authorId:'anon',authorName:'x',body:'x',createdAt:time}));
});
test('student ownership and module membership constrain posts',async()=>{
 const d=db('student','student@ucdconnect.ie');
 await assertSucceeds(getDoc(doc(d,'posts/draft')));
 await assertSucceeds(setDoc(doc(d,'posts/new'),post()));
 await assertFails(updateDoc(doc(d,'posts/other-draft'),{title:'Changed'}));
 await assertFails(setDoc(doc(d,'posts/wrong-module'),post('two')));
 await assertFails(setDoc(doc(d,'posts/forged-author'),post('one','other')));
 await assertFails(updateDoc(doc(d,'posts/draft'),{featured:true}));
 await assertFails(updateDoc(doc(d,'posts/draft'),{moduleId:'two'}));
});
test('teachers moderate and read rosters only in assigned modules',async()=>{
 const d=db('teacher-one');
 await assertSucceeds(getDocs(query(collection(d,'posts'),where('moduleId','==','one'))));
 await assertSucceeds(updateDoc(doc(d,'posts/draft'),{status:'published',featured:true}));
 await assertSucceeds(getDocs(collection(d,'modules/one/members')));
 await assertFails(getDoc(doc(d,'posts/other-draft')));
 await assertFails(getDocs(collection(d,'modules/two/members')));
 await assertFails(getDoc(doc(d,'profiles/student')));
 await assertFails(updateDoc(doc(d,'modules/two'),{title:'Hijacked'}));
});
test('teachers can create several own modules but cannot appoint other teachers',async()=>{
 const d=db('teacher-one');
 await assertSucceeds(setDoc(doc(d,'modules/three'),mod('teacher-one')));
 await assertSucceeds(setDoc(doc(d,'modules/four'),mod('teacher-one')));
 await assertFails(updateDoc(doc(d,'modules/one'),{teacherIds:['teacher-one','other']}));
 await assertFails(setDoc(doc(db('student'),'modules/stolen'),mod('student')));
});
test('unverified accounts cannot post, comment, enrol or become lecturers',async()=>{
 const d=db('student','student@ucdconnect.ie',false);
 await assertFails(setDoc(doc(d,'posts/unverified'),post()));
 await assertFails(setDoc(doc(d,'modules/two/members/student'),member()));
 await assertFails(setDoc(doc(d,'roles/student'),{role:'lecturer'}));
});
test('module approval and submission controls cannot be bypassed',async()=>{
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'modules/one'),{requireApproval:true}));
 const d=db('student','student@ucdconnect.ie');
 await assertFails(updateDoc(doc(d,'posts/draft'),{status:'published'}));
 await assertSucceeds(updateDoc(doc(d,'posts/draft'),{status:'pending'}));
 await assertSucceeds(updateDoc(doc(db('teacher-one'),'posts/draft'),{status:'published'}));
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'modules/one'),{submissionsOpen:false}));
 await assertFails(setDoc(doc(d,'posts/closed'),post()));
});
test('verified users may comment on published posts only; module closure is enforced',async()=>{
 const d=db('student','student@ucdconnect.ie'),comment={postId:'published',moduleId:'one',authorId:'student',authorName:'alias',body:'Hello',createdAt:time};
 await assertSucceeds(setDoc(doc(d,'comments/new'),comment));
 await assertFails(setDoc(doc(d,'comments/on-draft'),{...comment,postId:'draft'}));
 await assertFails(setDoc(doc(d,'comments/forged'),{...comment,authorId:'other'}));
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'modules/one'),{allowComments:false}));
 await assertFails(setDoc(doc(d,'comments/closed'),comment));
});
test('student identity is private; self-written teacher profile does not grant access',async()=>{
 const d=db('student','student@ucdconnect.ie');
 await assertSucceeds(updateDoc(doc(d,'profiles/student'),{registrationKind:'teacher'}));
 await assertFails(setDoc(doc(d,'roles/student'),{role:'lecturer'}));
 await assertFails(getDocs(collection(d,'userDirectory')));
 await assertFails(setDoc(doc(d,'modules/not-a-teacher'),mod('student')));
});
async function claim(d,id='valid'){
 const b=writeBatch(d);b.set(doc(d,'roles/invited'),{role:'lecturer',inviteId:id,setBy:'invitation',setAt:time});b.update(doc(d,'teacherInvites/'+id),{acceptedBy:'invited'});return b.commit();
}
test('matching verified UCD account atomically accepts an invitation',async()=>{
 const d=db('invited','invited@ucd.ie');await assertSucceeds(claim(d));
 await assertSucceeds(setDoc(doc(d,'modules/new-teacher-module'),mod('invited')));
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'roles/invited'),{role:'student'}));
 await assertFails(claim(d));
});
test('invited Gmail also works without requiring a student ID',async()=>{await assertSucceeds(claim(db('invited','invited@gmail.com')));});
test('wrong email, unverified, expired, revoked and used invitations are rejected',async()=>{
 await assertFails(claim(db('invited','stranger@gmail.com')));
 await assertFails(claim(db('invited','invited@ucd.ie',false)));
 for(const id of ['expired','revoked','used']) await assertFails(claim(db('invited','invited@ucd.ie'),id));
});
test('invitation cannot grant admin, be accepted without role write, or mint a role without consuming it',async()=>{
 const d=db('invited','invited@ucd.ie');
 await assertFails(setDoc(doc(d,'roles/invited'),{role:'lecturer',inviteId:'valid',setBy:'invitation',setAt:time}));
 await assertFails(updateDoc(doc(d,'teacherInvites/valid'),{acceptedBy:'invited'}));
 const b=writeBatch(d);b.set(doc(d,'roles/invited'),{role:'admin',inviteId:'valid',setBy:'invitation',setAt:time});b.update(doc(d,'teacherInvites/valid'),{acceptedBy:'invited'});await assertFails(b.commit());
});
test('only admin creates invitations and admin retains platform-wide access',async()=>{
 await assertFails(setDoc(doc(db('teacher-one'),'teacherInvites/forged'),invite()));
 const d=db('admin','kstouras@gmail.com');
 await assertSucceeds(setDoc(doc(d,'teacherInvites/new'),invite()));
 await assertSucceeds(getDocs(collection(d,'profiles')));
 await assertSucceeds(getDocs(collection(d,'posts')));
 await assertSucceeds(updateDoc(doc(d,'modules/two'),{title:'Admin edit'}));
});
test('students cannot self-enrol without a valid invitation for that exact module',async()=>{
 const d=db('new-student','student@ucdconnect.ie');
 await assertFails(setDoc(doc(d,'modules/one/members/new-student'),{...member('new-student'),inviteId:''}));
 await assertFails(setDoc(doc(d,'modules/one/members/new-student'),{...member('new-student'),inviteId:'student-expired'}));
 await assertFails(setDoc(doc(d,'modules/two/members/new-student'),member('new-student')));
 await assertSucceeds(setDoc(doc(d,'modules/one/members/new-student'),member('new-student')));
});
test('city codes resolve without exposing a list of active invitations',async()=>{
 const d=env.unauthenticatedContext().firestore();
 await assertSucceeds(getDoc(doc(d,'registrationCodes/madrid')));
 await assertFails(getDocs(collection(d,'registrationCodes')));
 await assertFails(getDoc(doc(d,'moduleInvites/student-valid')));
});
test('only assigned instructors can generate and revoke module city-code invitations',async()=>{
 const data={moduleId:'one',code:'tokyo',createdBy:'teacher-one',createdAt:time,expiresAt:time+86400000,revoked:false};
 const d=db('teacher-one'),b=writeBatch(d);
 b.set(doc(d,'moduleInvites/new-city'),data);
 b.set(doc(d,'registrationCodes/tokyo'),{kind:'student',inviteId:'new-city',moduleId:'one',code:'tokyo',expiresAt:time+86400000,revoked:false});
 await assertSucceeds(b.commit());
 await assertFails(updateDoc(doc(db('teacher-two'),'moduleInvites/new-city'),{revoked:true}));
 await assertFails(setDoc(doc(db('student'),'moduleInvites/forged'),{...data,createdBy:'student'}));
 const revoke=writeBatch(d);revoke.update(doc(d,'moduleInvites/new-city'),{revoked:true});revoke.update(doc(d,'registrationCodes/tokyo'),{revoked:true});await assertSucceeds(revoke.commit());
 await assertFails(setDoc(doc(db('new-student','student@ucdconnect.ie'),'modules/one/members/new-student'),{...member('new-student'),inviteId:'new-city'}));
});
test('non-members cannot comment simply by creating a platform account',async()=>{
 await assertFails(setDoc(doc(db('outsider'),'comments/no-invitation'),{postId:'published',moduleId:'one',authorId:'outsider',authorName:'alias',body:'Hello',createdAt:time}));
});
