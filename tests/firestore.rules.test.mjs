import {before,after,beforeEach,test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,query,where,updateDoc,deleteDoc,writeBatch,arrayUnion,arrayRemove} from 'firebase/firestore';
let env;
const time=Date.now();
const profile=(email='student@ucdconnect.ie')=>({firstName:'Student',lastName:'Example',penName:'quiet-heron-482',studentId:'12345678',contactEmail:email,affiliation:'Example University',registrationKind:'student'});
// Blogs are the public canvases (and exercises); modules are cohorts attached to one blog.
const blog=(uid)=>({title:'Test blog',description:'',teacherIds:[uid],createdBy:uid,createdAt:time,updatedAt:time,brief:'',categoryLabel:'Megatrend',categories:[{slug:'sustainability',name:'Sustainability'}],organisationLabel:'Organisation',minWords:900,maxWords:1100,outline:'',checklist:[],allowComments:true});
const mod=(uid,blogId='pm')=>({title:'Test module',code:'TEST',description:'',teacherName:'Teacher',teacherIds:[uid],createdBy:uid,createdAt:time,updatedAt:time,submissionsOpen:true,requireApproval:false,blogId,academicYear:'2026/27',deadline:''});
const post=(moduleId='one',authorId='student',status='draft',blogId='pm')=>({moduleId,blogId,academicYear:'2026/27',authorId,status,title:'Test post',slug:'test-post',body:'<p>Test content</p>',featured:false,authorName:'quiet-heron-482',createdAt:time,updatedAt:time});
const member=(uid='student')=>({uid,...profile(),penName:'quiet-heron-482',email:'student@ucdconnect.ie',joinedAt:time,inviteId:'student-valid'});
const invite=(extra={})=>({ucdEmail:'invited@ucd.ie',gmail:'invited@gmail.com',createdBy:'admin',createdAt:time,expiresAt:time+86400000,acceptedBy:'',revoked:false,...extra});
const comment=(extra={})=>({postId:'published',moduleId:'one',blogId:'pm',authorId:'student',authorName:'quiet-heron-482',body:'Hello',createdAt:time,...extra});
const db=(uid,email=uid+'@ucd.ie',verified=true)=>env.authenticatedContext(uid,{email,email_verified:verified,firebase:{sign_in_provider:'password'}}).firestore();
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-ucd-blog',firestore:{rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});});
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{
  const d=c.firestore(),b=writeBatch(d);
  for(const [path,data] of Object.entries({
   'roles/teacher-one':{role:'lecturer'},'roles/teacher-two':{role:'lecturer'},
   // teacher-one owns the shared "pm" blog written on by modules one and three; teacher-two owns "ops" with module two
   'blogs/pm':blog('teacher-one'),'blogs/ops':blog('teacher-two'),
   'modules/one':mod('teacher-one'),'modules/three':mod('teacher-one'),'modules/two':mod('teacher-two','ops'),
   'modules/one/members/student':member(),'blogs/pm/members/student':{uid:'student',moduleId:'one',joinedAt:time},
   'modules/three/members/peer':{...member('peer'),email:'peer@ucd.ie',contactEmail:'peer@ucd.ie'},'blogs/pm/members/peer':{uid:'peer',moduleId:'three',joinedAt:time},
   'profiles/student':profile(),'profiles/peer':profile('peer@ucd.ie'),
   'profiles/invited':{...profile('invited@ucd.ie'),studentId:'',registrationKind:'teacher'},
   'teacherInvites/valid':invite(),'teacherInvites/expired':invite({expiresAt:time-1000}),
   'teacherInvites/revoked':invite({revoked:true}),'teacherInvites/used':invite({acceptedBy:'someone-else'}),
   'moduleInvites/student-valid':{moduleId:'one',blogId:'pm',code:'madrid',createdBy:'teacher-one',createdAt:time,expiresAt:time+86400000,revoked:false},
   'moduleInvites/student-expired':{moduleId:'one',blogId:'pm',code:'paris',createdBy:'teacher-one',createdAt:time,expiresAt:time-1000,revoked:false},
   // a code from before 3 Nov 2026 (random city and digits, no blog): retired, so it enrols nobody
   'moduleInvites/student-old':{moduleId:'one',code:'ottawa-521',createdBy:'teacher-one',createdAt:time,expiresAt:Date.UTC(9999,11,31),revoked:false},
   'registrationCodes/madrid':{kind:'student',inviteId:'student-valid',moduleId:'one',blogId:'pm',code:'madrid',expiresAt:time+86400000,revoked:false},
   'registrationCodes/ottawa-521':{kind:'student',inviteId:'student-old',moduleId:'one',code:'ottawa-521',expiresAt:Date.UTC(9999,11,31),revoked:false},
   // dublin was module two's code once and was revoked: free for any module to take over
   'moduleInvites/student-dublin':{moduleId:'two',blogId:'ops',code:'dublin',createdBy:'teacher-two',createdAt:time,expiresAt:Date.UTC(9999,11,31),revoked:true},
   'registrationCodes/dublin':{kind:'student',inviteId:'student-dublin',moduleId:'two',blogId:'ops',code:'dublin',expiresAt:Date.UTC(9999,11,31),revoked:true},
   'posts/draft':post(),'posts/published':post('one','student','published'),'posts/other-draft':post('two','other','draft','ops'),'posts/peer-published':post('three','peer','published'),
   'posts/published/content/body':{body:'<p>Test content</p>'},'posts/draft/content/body':{body:'<p>Test content</p>'},
   'comments/comment':comment()
  }))b.set(doc(d,path),data);
  await b.commit();
 });
});
test('session history is write-only for its student and readable only by admin or module instructor',async()=>{
 const d=db('student','student@ucdconnect.ie'),row={uid:'student',postId:'draft',moduleId:'one',seconds:0,startedAt:Date.now()-10000,lastActivityAt:Date.now()-10000,lastRecordedAt:Date.now()-10000};
 await assertSucceeds(setDoc(doc(d,'writingHistory/one'),row));
 const ended={...row,seconds:8,lastRecordedAt:row.startedAt+8000,endedAt:row.startedAt+8000,endReason:'left'};
 await assertSucceeds(setDoc(doc(d,'writingHistory/one'),ended));
 await assertFails(getDoc(doc(d,'writingHistory/one')));
 await assertFails(getDocs(query(collection(d,'writingHistory'),where('uid','==','student'))));
 await assertSucceeds(getDoc(doc(db('teacher-one'),'writingHistory/one')));
 await assertSucceeds(getDoc(doc(db('admin','kstouras@gmail.com'),'writingHistory/one')));
 await assertSucceeds(getDocs(query(collection(db('teacher-one'),'writingHistory'),where('moduleId','==','one'))));
 await assertFails(getDoc(doc(db('teacher-two'),'writingHistory/one')));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'writingHistory/one')));
 await assertFails(setDoc(doc(d,'writingHistory/one'),{...ended,seconds:7}));
 await assertFails(setDoc(doc(d,'writingHistory/forged'),{...row,uid:'peer'}));
 await assertFails(setDoc(doc(d,'writingHistory/wrong-module'),{...row,moduleId:'two'}));
});
test('writing time is private, author-owned, monotonic and bounded by elapsed time',async()=>{
 const d=db('student','student@ucdconnect.ie'),row={uid:'student',postId:'draft',moduleId:'one',seconds:0,startedAt:Date.now()-10000};
 await assertFails(getDoc(doc(d,'writingSessions/new')));
 await assertSucceeds(setDoc(doc(d,'writingSessions/session'),row));
 await assertSucceeds(updateDoc(doc(d,'writingSessions/session'),{seconds:8}));
 await assertFails(getDoc(doc(d,'writingSessions/session')));
 await assertFails(updateDoc(doc(d,'writingSessions/session'),{seconds:7}));
 await assertFails(updateDoc(doc(d,'writingSessions/session'),{seconds:99999}));
 await assertFails(updateDoc(doc(d,'writingSessions/session'),{postId:'published'}));
 await assertSucceeds(getDocs(query(collection(db('teacher-one'),'writingSessions'),where('moduleId','==','one'))));
 await assertFails(getDoc(doc(db('teacher-two'),'writingSessions/session')));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'writingSessions/session')));
 await assertFails(setDoc(doc(d,'writingSessions/forged'),{...row,uid:'peer'}));
 await assertFails(setDoc(doc(d,'writingSessions/wrong-module'),{...row,moduleId:'two'}));
});
test('AI reviews and the grader persona are private to the platform administrator',async()=>{
 const admin=db('admin','kstouras@gmail.com'),review={postId:'published',moduleId:'one',blogId:'pm',authorId:'student',provider:'anthropic',model:'claude-fable-5-1',effort:'high',grade:7.5,summary:'S',feedback:'F',raw:'{}',usage:{input:1,output:1},reviewedAt:time,updatedAt:time};
 await assertSucceeds(setDoc(doc(admin,'aiReviews/published'),review));
 await assertSucceeds(setDoc(doc(admin,'aiReviews/published'),{finalGrade:'A',finalFeedback:'Well done',finalEditedAt:time,postId:'published'},{merge:true}));
 await assertSucceeds(getDocs(query(collection(admin,'aiReviews'),where('moduleId','==','one'))));
 await assertFails(setDoc(doc(admin,'aiReviews/published'),{...review,postId:'draft'}));
 await assertFails(setDoc(doc(admin,'aiReviews/missing'),{...review,postId:'missing'}));
 await assertFails(setDoc(doc(admin,'aiReviews/published'),{...review,apiKey:'sk-secret'}));
 await assertSucceeds(setDoc(doc(admin,'adminContent/grader'),{persona:'P',instructions:'I',polish:'Q',updatedAt:time,updatedBy:'admin'}));
 for(const d of [db('teacher-one'),db('student'),env.unauthenticatedContext().firestore()]){
  await assertFails(getDoc(doc(d,'aiReviews/published')));
  await assertFails(getDocs(query(collection(d,'aiReviews'),where('moduleId','==','one'))));
  await assertFails(setDoc(doc(d,'aiReviews/published'),review));
  await assertFails(getDoc(doc(d,'adminContent/grader')));
 }
});
test('peer review: the admin assigns, the reviewer alone grades while the round is open, the author sees only the released summary',async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  const d=c.firestore();
  await setDoc(doc(d,'modules/one/members/other'),{...member('other'),email:'other@ucd.ie',contactEmail:'other@ucd.ie'});
  await setDoc(doc(d,'posts/other-published'),post('one','other','published'));
  await setDoc(doc(d,'posts/other-published/content/body'),{body:'<p>Other content</p>'});
  await setDoc(doc(d,'peerRounds/one'),{moduleId:'one',blogId:'pm',status:'open',perStudent:4,seed:'abc',academicYear:'2026/27',assignedAt:time,assignedBy:'admin',updatedAt:time,updatedBy:'admin'});
 });
 const admin=db('admin','kstouras@gmail.com'),student=db('student','student@ucdconnect.ie'),author=db('other','other@ucd.ie'),teacher=db('teacher-one');
 const row={moduleId:'one',blogId:'pm',postId:'other-published',authorId:'other',reviewerUid:'student',reviewerName:'quiet-heron-482',order:1,assignedAt:time,grade:null,assessment:'',submittedAt:null,updatedAt:time};
 const id='one_other-published_student';
 // the round: the admin writes it; the module's students read it; other instructors do not
 await assertSucceeds(setDoc(doc(admin,'peerRounds/one'),{moduleId:'one',blogId:'pm',status:'open',perStudent:4,seed:'abc',academicYear:'2026/27',updatedAt:time,updatedBy:'admin'}));
 await assertSucceeds(getDoc(doc(student,'peerRounds/one')));
 await assertFails(getDoc(doc(teacher,'peerRounds/one')));
 await assertFails(setDoc(doc(teacher,'peerRounds/one'),{moduleId:'one',status:'open',updatedAt:time}));
 await assertFails(setDoc(doc(admin,'peerRounds/one'),{moduleId:'one',status:'paused',updatedAt:time}));
 // the assignment: the admin only, never one's own post, never a draft, never a non-member, never with a grade
 // (each refusal is tried before the row exists: a set on an existing document is an update, not a create)
 await assertFails(setDoc(doc(teacher,'peerReviews/'+id),row));
 await assertFails(setDoc(doc(admin,'peerReviews/one_published_student'),{...row,postId:'published',authorId:'student'}));
 await assertFails(setDoc(doc(admin,'peerReviews/one_draft_other'),{...row,postId:'draft',authorId:'student',reviewerUid:'other'}));
 await assertFails(setDoc(doc(admin,'peerReviews/one_other-published_peer'),{...row,reviewerUid:'peer'}));
 await assertFails(setDoc(doc(admin,'peerReviews/'+id),{...row,authorId:'student'}));
 await assertFails(setDoc(doc(admin,'peerReviews/wrong-id'),row));
 await assertFails(setDoc(doc(admin,'peerReviews/'+id),{...row,grade:8}));   // the grade comes from the reviewer, never with the assignment
 await assertSucceeds(setDoc(doc(admin,'peerReviews/'+id),row));
 await assertSucceeds(setDoc(doc(admin,'peerReviews/'+id),{...row,order:2}));   // once assigned, the admin may correct a row within its shape
 // reading: the reviewer and the admin; not the author, not another instructor, not a classmate
 await assertSucceeds(getDoc(doc(student,'peerReviews/'+id)));
 await assertSucceeds(getDocs(query(collection(student,'peerReviews'),where('reviewerUid','==','student'))));
 await assertSucceeds(getDocs(query(collection(admin,'peerReviews'),where('moduleId','==','one'))));
 await assertFails(getDoc(doc(author,'peerReviews/'+id)));
 await assertFails(getDoc(doc(teacher,'peerReviews/'+id)));
 await assertFails(getDocs(query(collection(db('peer','peer@ucd.ie'),'peerReviews'),where('moduleId','==','one'))));
 // submitting: the reviewer, a whole-number grade from 1 to 10, feedback of any length, nothing else changed
 const text='This post explains the organisation and its megatrend clearly. '.repeat(5);
 await assertFails(updateDoc(doc(student,'peerReviews/'+id),{grade:11,assessment:text,submittedAt:time,updatedAt:time}));
 await assertFails(updateDoc(doc(student,'peerReviews/'+id),{grade:0.5,assessment:text,submittedAt:time,updatedAt:time}));
 await assertFails(updateDoc(doc(student,'peerReviews/'+id),{grade:7.5,assessment:text,submittedAt:time,updatedAt:time}));   // whole numbers only
 await assertFails(updateDoc(doc(student,'peerReviews/'+id),{grade:8,assessment:text,submittedAt:time,updatedAt:time,postId:'published'}));
 await assertFails(updateDoc(doc(student,'peerReviews/'+id),{grade:8,assessment:text,submittedAt:time,updatedAt:time,aiScore:10}));
 await assertFails(updateDoc(doc(author,'peerReviews/'+id),{grade:10,assessment:text,submittedAt:time,updatedAt:time}));
 await assertSucceeds(updateDoc(doc(student,'peerReviews/'+id),{grade:7,assessment:'Nice.',submittedAt:time,updatedAt:time}));   // no minimum length
 await assertSucceeds(updateDoc(doc(student,'peerReviews/'+id),{grade:8,assessment:text+' Revised.',submittedAt:time+1,updatedAt:time+1}));
 await assertSucceeds(setDoc(doc(admin,'peerReviews/'+id),{aiScore:8,aiNote:'Specific and fair'},{merge:true}));
 await assertSucceeds(setDoc(doc(admin,'peerRounds/one'),{status:'closed',closedAt:time},{merge:true}));
 await assertFails(updateDoc(doc(student,'peerReviews/'+id),{grade:9,assessment:text,submittedAt:time+2,updatedAt:time+2}));
 await assertFails(deleteDoc(doc(student,'peerReviews/'+id)));
 // reviewer notes: the admin writes; the reviewer reads theirs once released
 await assertSucceeds(setDoc(doc(admin,'peerReviewerNotes/one_student'),{moduleId:'one',reviewerUid:'student',aiScore:8,aiNote:'Good reviewing',aiPerReview:[{postId:'other-published',score:8,note:'specific'}],aiScoredAt:time,aiModel:'claude-fable-5-1',updatedAt:time}));
 await assertSucceeds(setDoc(doc(admin,'peerReviewerNotes/one_student'),{noticeSentAt:time,noticeTo:'student@ucdconnect.ie'},{merge:true}));   // the letter was sent
 await assertFails(getDoc(doc(student,'peerReviewerNotes/one_student')));
 await assertSucceeds(setDoc(doc(admin,'peerReviewerNotes/one_student'),{grade:'A',note:'Thank you',releasedAt:time},{merge:true}));
 await assertSucceeds(getDoc(doc(student,'peerReviewerNotes/one_student')));
 await assertFails(getDoc(doc(author,'peerReviewerNotes/one_student')));
 await assertFails(setDoc(doc(student,'peerReviewerNotes/one_student'),{moduleId:'one',reviewerUid:'student',grade:'A+',updatedAt:time},{merge:true}));
 // the released summary: the admin writes it; the author reads it; the reviewer, other students and other instructors do not
 const summary={postId:'other-published',moduleId:'one',authorId:'other',count:1,mean:8,adjustedMean:8,feedback:'Merged feedback',assessments:[{grade:8,assessment:text}],releasedAt:time,updatedAt:time};
 await assertSucceeds(setDoc(doc(admin,'peerSummaries/other-published'),summary));
 await assertFails(setDoc(doc(admin,'peerSummaries/missing'),{...summary,postId:'missing'}));
 await assertFails(setDoc(doc(teacher,'peerSummaries/other-published'),summary));
 await assertSucceeds(getDoc(doc(author,'peerSummaries/other-published')));
 await assertFails(getDoc(doc(student,'peerSummaries/other-published')));
 await assertFails(getDoc(doc(teacher,'peerSummaries/other-published')));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'peerSummaries/other-published')));
 // the AI's synthesis of the peer reviews sits beside the admin's review of the post
 await assertSucceeds(setDoc(doc(admin,'aiReviews/other-published'),{postId:'other-published',moduleId:'one',peerSynthesis:'Merged',peerSummary:'Agree',peerSuggestedGrade:8,peerSynthesisAt:time,peerSynthesisModel:'anthropic · claude-fable-5-1 · high',updatedAt:time},{merge:true}));
});
test('students write under generated aliases and cannot pick an identifying pen name',async()=>{
 const d=db('student','student@ucdconnect.ie');
 await assertFails(updateDoc(doc(d,'profiles/student'),{penName:'Aoife Byrne'}));
 await assertFails(updateDoc(doc(d,'profiles/student'),{penName:'student_26000001'}));
 await assertSucceeds(updateDoc(doc(d,'profiles/student'),{penName:'amber-falcon-731'}));
 await assertSucceeds(updateDoc(doc(d,'profiles/student'),{bio:'Hello',linkedin:'https://www.linkedin.com/in/quiet-heron'}));
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'profiles/legacy'),{...profile('legacy@ucd.ie'),penName:'student_legacy12'}));
 await assertSucceeds(updateDoc(doc(db('legacy','legacy@ucd.ie'),'profiles/legacy'),{bio:'Kept my old pen name'}));
 await assertFails(updateDoc(doc(db('legacy','legacy@ucd.ie'),'profiles/legacy'),{penName:'Legacy Name'}));
 await assertFails(setDoc(doc(db('fresh','fresh@ucd.ie'),'profiles/fresh'),{...profile('fresh@ucd.ie'),penName:'Fresh Name'}));
 await assertSucceeds(setDoc(doc(db('fresh','fresh@ucd.ie'),'profiles/fresh'),{...profile('fresh@ucd.ie'),penName:'sunny-reef-105'}));
 await assertSucceeds(setDoc(doc(db('staff','staff@ucd.ie'),'profiles/staff'),{...profile('staff@ucd.ie'),studentId:'',registrationKind:'teacher',penName:'dr_staff'}));
});
test('admin guide is private to the platform administrator',async()=>{
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'adminContent/guide'),{html:'Private guide'}));
 await assertSucceeds(getDoc(doc(db('admin','kstouras@gmail.com'),'adminContent/guide')));
 await assertFails(getDoc(doc(db('teacher-one'),'adminContent/guide')));
 await assertFails(getDoc(doc(db('student'),'adminContent/guide')));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'adminContent/guide')));
});
test('named student invitations can only be read and redeemed by the intended university email',async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  const d=c.firestore();await setDoc(doc(d,'moduleInvites/named'),{moduleId:'one',code:'paris',recipientEmail:'new@university.ie',createdBy:'teacher-one',createdAt:time,expiresAt:time+86400000,revoked:false});
  await setDoc(doc(d,'profiles/new'),profile('new@university.ie'));
 });
 await assertSucceeds(getDoc(doc(db('teacher-one'),'moduleInvites/named')));
 await assertSucceeds(getDoc(doc(db('new','new@university.ie'),'moduleInvites/named')));
 await assertFails(getDoc(doc(db('student','student@ucdconnect.ie'),'moduleInvites/named')));
 const ownMember={...member('new'),contactEmail:'new@university.ie',email:'new@university.ie',inviteId:'named'};
 await assertSucceeds(setDoc(doc(db('new','new@university.ie'),'modules/one/members/new'),ownMember));
 await assertFails(setDoc(doc(db('outsider','outsider@university.ie'),'modules/one/members/outsider'),{...member('outsider'),email:'outsider@university.ie',contactEmail:'outsider@university.ie',inviteId:'named'}));
});
test('signed-out visitors read blog and module titles and published posts with their text: no comments, drafts, rosters, profiles or invites',async()=>{
 const d=env.unauthenticatedContext().firestore();
 await assertSucceeds(getDocs(collection(d,'blogs')));
 await assertSucceeds(getDocs(collection(d,'modules')));
 await assertSucceeds(getDocs(query(collection(d,'posts'),where('status','==','published'))));
 await assertSucceeds(getDocs(query(collection(d,'posts'),where('blogId','==','pm'),where('status','==','published'))));
 await assertSucceeds(getDoc(doc(d,'posts/published')));
 await assertSucceeds(getDoc(doc(d,'posts/published/content/body')));
 await assertFails(getDocs(collection(d,'posts')));   // a list that could return a draft
 await assertFails(getDocs(query(collection(d,'posts'),where('blogId','==','pm'))));
 await assertFails(getDocs(collection(d,'comments')));
 await assertFails(getDocs(query(collection(d,'comments'),where('moduleId','==','one'))));
 await assertFails(getDoc(doc(d,'posts/draft')));
 await assertFails(getDoc(doc(d,'posts/draft/content/body')));
 await assertFails(getDocs(collection(d,'posts/published/likes')));
 const member=db('peer','peer@ucd.ie');   // signed in, the comments of one's own module can be read, and a query names that module
 await assertSucceeds(getDocs(query(collection(member,'posts'),where('moduleId','==','three'),where('status','==','published'))));
 await assertSucceeds(getDoc(doc(member,'posts/peer-published')));
 await assertSucceeds(getDocs(query(collection(member,'comments'),where('moduleId','==','three'))));
 await assertFails(getDocs(query(collection(member,'comments'),where('moduleId','==','one'))));
 await assertFails(getDocs(collection(member,'comments')));
 await assertFails(getDoc(doc(d,'profiles/student')));
 await assertFails(getDocs(collection(d,'modules/one/members')));
 await assertFails(getDocs(collection(d,'blogs/pm/members')));
 await assertFails(getDoc(doc(d,'teacherInvites/valid')));
 await assertFails(setDoc(doc(d,'comments/anon'),comment({authorId:'anon'})));
});
test('a student reads any published post (they are public) but no draft of a classmate, and the comments of their own module only',async()=>{
 const d=db('student','student@ucdconnect.ie');   // student is in module one; peer in module three, which shares the pm blog
 await assertSucceeds(getDoc(doc(d,'posts/published')));
 await assertSucceeds(getDocs(query(collection(d,'posts'),where('moduleId','==','one'),where('status','==','published'))));
 await assertSucceeds(getDocs(query(collection(d,'posts'),where('slug','==','test-post'),where('moduleId','==','one'),where('status','==','published'))));
 await assertSucceeds(getDoc(doc(d,'posts/published/content/body')));
 await assertSucceeds(getDoc(doc(d,'posts/peer-published')));   // another module's published post: public, like the canvas it is on
 await assertSucceeds(getDoc(doc(d,'posts/peer-published/content/body')));
 await assertSucceeds(getDocs(query(collection(d,'posts'),where('moduleId','==','three'),where('status','==','published'))));
 await assertSucceeds(getDocs(query(collection(d,'posts'),where('blogId','==','pm'),where('status','==','published'))));
 await assertFails(getDoc(doc(d,'posts/other-draft')));   // another student's draft
 await assertFails(getDocs(query(collection(d,'posts'),where('moduleId','==','three'))));
 await assertFails(getDocs(query(collection(d,'posts'),where('moduleId','==','one'))));   // drafts of classmates stay private
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'comments/peer-comment'),comment({postId:'peer-published',moduleId:'three',authorId:'peer'})));
 await assertSucceeds(getDocs(query(collection(d,'comments'),where('postId','==','published'),where('moduleId','==','one'))));
 await assertFails(getDocs(query(collection(d,'comments'),where('postId','==','peer-published'),where('moduleId','==','three'))));
 await assertFails(getDoc(doc(d,'comments/peer-comment')));
 await assertFails(getDocs(query(collection(d,'comments'),where('blogId','==','pm'))));
});
test('student ownership and module membership constrain posts; posts carry their module’s blog',async()=>{
 const d=db('student','student@ucdconnect.ie');
 await assertSucceeds(getDoc(doc(d,'posts/draft')));
 await assertSucceeds(setDoc(doc(d,'posts/new'),post()));
 await assertSucceeds(setDoc(doc(d,'posts/industries'),{...post(),industries:['energy-utilities','manufacturing']}));
 await assertFails(setDoc(doc(d,'posts/too-many-industries'),{...post(),industries:['a','b','c','d','e','f']}));
 await assertFails(setDoc(doc(d,'posts/wrong-blog'),post('one','student','draft','ops')));
 await assertFails(setDoc(doc(d,'posts/no-blog'),(()=>{const p=post();delete p.blogId;return p;})()));
 await assertFails(updateDoc(doc(d,'posts/other-draft'),{title:'Changed'}));
 await assertFails(setDoc(doc(d,'posts/wrong-module'),post('two','student','draft','ops')));
 await assertFails(setDoc(doc(d,'posts/forged-author'),post('one','other')));
 await assertFails(updateDoc(doc(d,'posts/draft'),{featured:true}));
 await assertFails(updateDoc(doc(d,'posts/draft'),{moduleId:'three'}));
});
test('teachers moderate posts in their modules and on the blogs they own, and read rosters only in assigned modules',async()=>{
 const d=db('teacher-one');
 await assertSucceeds(getDocs(query(collection(d,'posts'),where('moduleId','==','one'))));
 await assertSucceeds(getDocs(query(collection(d,'posts'),where('blogId','==','pm'))));
 await assertSucceeds(updateDoc(doc(d,'posts/draft'),{status:'published',featured:true}));
 await assertSucceeds(getDocs(collection(d,'modules/one/members')));
 await assertSucceeds(getDocs(collection(d,'blogs/pm/members')));
 await assertFails(getDoc(doc(d,'posts/other-draft')));
 await assertFails(getDocs(collection(d,'modules/two/members')));
 await assertFails(getDoc(doc(d,'profiles/student')));
 await assertFails(updateDoc(doc(d,'modules/two'),{title:'Hijacked'}));
 await assertFails(updateDoc(doc(d,'blogs/ops'),{title:'Hijacked'}));
 // a blog owner may moderate a post from another instructor’s module on the owner’s blog
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'modules/guest'),mod('teacher-two','pm')));
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'posts/guest-draft'),post('guest','someone','draft','pm')));
 await assertSucceeds(getDoc(doc(d,'posts/guest-draft')));
 await assertSucceeds(updateDoc(doc(d,'posts/guest-draft'),{status:'published'}));
 // staff delete the posts they moderate together with the likes and votes under them (one batch, as the app does); nothing elsewhere
 await env.withSecurityRulesDisabled(async c=>{const f=c.firestore();await setDoc(doc(f,'posts/published/likes/peer'),{t:time});await setDoc(doc(f,'posts/published/votes/poll-a_peer'),{pollId:'poll-a',uid:'peer',option:0,t:time});});
 const wipe=writeBatch(d);wipe.delete(doc(d,'posts/published/likes/peer'));wipe.delete(doc(d,'posts/published/votes/poll-a_peer'));wipe.delete(doc(d,'posts/published'));
 await assertSucceeds(wipe.commit());
 await assertSucceeds(deleteDoc(doc(d,'posts/guest-draft')));
 await assertFails(deleteDoc(doc(d,'posts/other-draft')));
 await assertFails(deleteDoc(doc(db('student'),'posts/peer-published')));
 await assertFails(deleteDoc(doc(db('peer','peer@ucd.ie'),'posts/peer-published')));
 // an author deletes their own post only while it is unpublished: posts/draft went live at the top of this test
 await assertFails(deleteDoc(doc(db('student'),'posts/draft')));
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'posts/own-draft'),post()));
 await assertSucceeds(deleteDoc(doc(db('student'),'posts/own-draft')));
});
test('teachers create blogs and modules on their own blogs only; nobody appoints other teachers',async()=>{
 const d=db('teacher-one');
 await assertSucceeds(setDoc(doc(d,'blogs/new-blog'),blog('teacher-one')));
 await assertSucceeds(setDoc(doc(d,'modules/four'),mod('teacher-one','new-blog')));
 await assertSucceeds(setDoc(doc(d,'modules/five'),mod('teacher-one','pm')));
 await assertFails(setDoc(doc(d,'modules/on-others-blog'),mod('teacher-one','ops')));
 await assertFails(setDoc(doc(d,'modules/no-such-blog'),mod('teacher-one','missing')));
 await assertFails(updateDoc(doc(d,'modules/one'),{blogId:'ops'}));
 await assertSucceeds(updateDoc(doc(d,'modules/one'),{academicYear:'2027/28',deadline:'2027-11-30'}));
 await assertFails(updateDoc(doc(d,'modules/one'),{peerReview:true,peerDeadline:'2027-12-14'}));   // the peer-review option is the admin's alone
 await assertFails(setDoc(doc(d,'modules/six'),{...mod('teacher-one','pm'),peerReview:true}));
 await assertFails(updateDoc(doc(d,'modules/one'),{teacherIds:['teacher-one','other']}));
 await assertFails(updateDoc(doc(d,'blogs/pm'),{teacherIds:['teacher-one','other']}));
 await assertFails(setDoc(doc(db('student'),'modules/stolen'),mod('student')));
 await assertFails(setDoc(doc(db('student'),'blogs/stolen'),blog('student')));
 await assertSucceeds(setDoc(doc(db('admin','kstouras@gmail.com'),'modules/admin-module'),{...mod('admin','ops'),teacherIds:['admin']}));
});
test('a teacher deletes their own module with its roster and the blog memberships it brought; nobody else’s',async()=>{
 const d=db('teacher-one');
 await assertFails(deleteDoc(doc(d,'modules/two')));
 await assertFails(deleteDoc(doc(db('teacher-two'),'modules/one')));
 await assertFails(deleteDoc(doc(db('student'),'modules/one')));
 await assertFails(deleteDoc(doc(db('teacher-two'),'modules/one/members/student')));
 await assertFails(deleteDoc(doc(db('teacher-two'),'blogs/pm/members/student')));
 // one batch, as the app does: the roster, the blog memberships pointing at the module, then the module itself
 const b=writeBatch(d);b.delete(doc(d,'modules/one/members/student'));b.delete(doc(d,'blogs/pm/members/student'));b.delete(doc(d,'modules/one'));
 await assertSucceeds(b.commit());
 await assertSucceeds(deleteDoc(doc(db('admin','kstouras@gmail.com'),'modules/two')));
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
test('members of a module comment on its published posts and on no other module’s; the blog decides whether comments are open',async()=>{
 const d=db('student','student@ucdconnect.ie');
 await assertSucceeds(setDoc(doc(d,'comments/new'),comment()));
 // peer belongs to module three, which shares the pm blog with module one: module one's posts are out of peer's reach
 await assertFails(setDoc(doc(db('peer','peer@ucd.ie'),'comments/cross-module'),comment({authorId:'peer'})));
 await assertSucceeds(setDoc(doc(db('peer','peer@ucd.ie'),'comments/own-module'),comment({authorId:'peer',postId:'peer-published',moduleId:'three'})));
 // an instructor of a guest module on the blog reaches that module's posts only; enrolled in a module, they comment under a staff pen name, not an alias
 await env.withSecurityRulesDisabled(c=>{const f=c.firestore();return Promise.all([setDoc(doc(f,'modules/guest'),mod('teacher-two','pm')),setDoc(doc(f,'blogs/pm/members/teacher-two'),{uid:'teacher-two',moduleId:'guest',joinedAt:time}),setDoc(doc(f,'modules/one/members/teacher-two'),{...member('teacher-two'),email:'teacher-two@ucd.ie',contactEmail:'teacher-two@ucd.ie'}),setDoc(doc(f,'profiles/teacher-two'),{...profile('two@ucd.ie'),studentId:'',registrationKind:'teacher',penName:'dr_two'})]);});
 await assertSucceeds(setDoc(doc(db('teacher-two'),'comments/staff-cross'),comment({authorId:'teacher-two',authorName:'dr_two'})));
 await assertFails(setDoc(doc(db('teacher-two'),'comments/staff-forged'),comment({authorId:'teacher-two',authorName:'someone-else-101'})));
 await assertFails(setDoc(doc(d,'comments/on-draft'),comment({postId:'draft'})));
 await assertFails(setDoc(doc(d,'comments/forged'),comment({authorId:'other'})));
 await assertFails(setDoc(doc(d,'comments/wrong-blog'),comment({blogId:'ops'})));
 await assertFails(setDoc(doc(d,'comments/other-blog'),comment({postId:'other-draft',moduleId:'two',blogId:'ops'})));
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'blogs/pm'),{allowComments:false}));
 await assertFails(setDoc(doc(d,'comments/closed'),comment()));
});
test('a reply names its thread; a like is an account adding or removing only itself from likedBy',async()=>{
 const d=db('student','student@ucdconnect.ie'), peer=db('peer','peer@ucd.ie');
 await assertSucceeds(setDoc(doc(d,'comments/reply'),comment({parentId:'comment',likedBy:[]})));
 await assertFails(setDoc(doc(d,'comments/pre-liked'),comment({likedBy:['student']})));   // a comment cannot be born liked
 await assertSucceeds(updateDoc(doc(peer,'comments/comment'),{likedBy:arrayUnion('peer')}));
 await assertFails(updateDoc(doc(peer,'comments/comment'),{likedBy:arrayUnion('student')}));   // not on someone else's behalf
 await assertFails(updateDoc(doc(peer,'comments/comment'),{likedBy:['peer'],body:'edited'}));   // nothing but likedBy changes
 await assertSucceeds(updateDoc(doc(peer,'comments/comment'),{likedBy:arrayRemove('peer')}));
 await assertFails(updateDoc(doc(db('outsider','o@ucd.ie',false),'comments/comment'),{likedBy:arrayUnion('outsider')}));   // unverified
 // the author rewrites the body, nothing else; nobody else rewrites it
 await assertSucceeds(updateDoc(doc(d,'comments/comment'),{body:'Hello, revised',editedAt:time+1}));
 await assertFails(updateDoc(doc(d,'comments/comment'),{body:'',editedAt:time+1}));
 await assertFails(updateDoc(doc(d,'comments/comment'),{body:'x',editedAt:time+1,authorName:'someone-else-101'}));
 await assertFails(updateDoc(doc(peer,'comments/comment'),{body:'Not mine',editedAt:time+1}));
 await assertFails(updateDoc(doc(db('teacher-one'),'comments/comment'),{body:'Staff rewrite',editedAt:time+1}));
});
test('joining a module writes the blog membership only alongside a valid module membership',async()=>{
 const d=db('new-student','student@ucdconnect.ie');
 const b=writeBatch(d);b.set(doc(d,'modules/one/members/new-student'),member('new-student'));b.set(doc(d,'blogs/pm/members/new-student'),{uid:'new-student',moduleId:'one',joinedAt:time});
 await assertSucceeds(b.commit());
 await assertFails(setDoc(doc(db('intruder','intruder@ucd.ie'),'blogs/pm/members/intruder'),{uid:'intruder',moduleId:'one',joinedAt:time}));
 await assertFails(setDoc(doc(d,'blogs/ops/members/new-student'),{uid:'new-student',moduleId:'one',joinedAt:time}));
});
test('likes are one per verified account on published posts and countable by signed-in accounts',async()=>{
 const d=db('peer','peer@ucd.ie');
 await assertSucceeds(setDoc(doc(d,'posts/published/likes/peer'),{t:time}));
 await assertFails(setDoc(doc(d,'posts/published/likes/student'),{t:time}));
 await assertFails(setDoc(doc(d,'posts/draft/likes/peer'),{t:time}));
 await assertFails(setDoc(doc(db('peer','peer@ucd.ie',false),'posts/peer-published/likes/peer'),{t:time}));
 await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(),'posts/published/likes')));
 await assertSucceeds(getDocs(collection(d,'posts/published/likes')));
 await assertSucceeds(deleteDoc(doc(d,'posts/published/likes/peer')));
});
test('bookmark markers are one per verified account on published posts, countable by signed-in accounts, cleared by staff',async()=>{
 const d=db('peer','peer@ucd.ie');
 await assertSucceeds(setDoc(doc(d,'posts/published/bookmarks/peer'),{t:time}));
 await assertFails(setDoc(doc(d,'posts/published/bookmarks/student'),{t:time}));
 await assertFails(setDoc(doc(d,'posts/draft/bookmarks/peer'),{t:time}));
 await assertFails(setDoc(doc(db('peer','peer@ucd.ie',false),'posts/peer-published/bookmarks/peer'),{t:time}));
 await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(),'posts/published/bookmarks')));
 await assertSucceeds(getDocs(collection(d,'posts/published/bookmarks')));
 await assertFails(deleteDoc(doc(db('student','student@ucdconnect.ie'),'posts/published/bookmarks/peer')));
 await assertSucceeds(deleteDoc(doc(db('teacher-one'),'posts/published/bookmarks/peer')));
});
test('bookmarks are two id lists an account keeps on its own profile',async()=>{
 const d=db('student','student@ucdconnect.ie');
 await assertSucceeds(setDoc(doc(d,'profiles/student'),{bookmarkedPosts:arrayUnion('published'),bookmarkedComments:arrayUnion('comment')},{merge:true}));
 await assertSucceeds(setDoc(doc(d,'profiles/student'),{bookmarkedPosts:arrayRemove('published')},{merge:true}));
 await assertFails(setDoc(doc(d,'profiles/student'),{bookmarkedPosts:'published'},{merge:true}));
 await assertFails(setDoc(doc(db('peer','peer@ucd.ie'),'profiles/student'),{bookmarkedPosts:arrayUnion('published')},{merge:true}));
});
test('poll votes are one per poll and account on published posts, changeable, countable by signed-in accounts',async()=>{
 const d=db('peer','peer@ucd.ie'),vote={pollId:'poll-a',uid:'peer',option:0,t:time};
 await assertSucceeds(setDoc(doc(d,'posts/published/votes/poll-a_peer'),vote));
 await assertSucceeds(setDoc(doc(d,'posts/published/votes/poll-a_peer'),{...vote,option:1}));
 await assertFails(setDoc(doc(d,'posts/published/votes/poll-a_student'),{...vote,uid:'student'}));
 await assertFails(setDoc(doc(d,'posts/published/votes/poll-b_peer'),vote));
 await assertFails(setDoc(doc(d,'posts/published/votes/poll-a_peer'),{...vote,option:42}));
 await assertFails(setDoc(doc(d,'posts/draft/votes/poll-a_peer'),vote));
 await assertFails(getDocs(query(collection(env.unauthenticatedContext().firestore(),'posts/published/votes'),where('pollId','==','poll-a'))));
 await assertSucceeds(getDocs(query(collection(d,'posts/published/votes'),where('pollId','==','poll-a'))));
});
test('the writer may probe a fresh post id and save a first draft under it',async()=>{
 const d=db('student','student@ucdconnect.ie');
 await assertSucceeds(getDoc(doc(d,'posts/fresh-client-id')));
 await assertSucceeds(setDoc(doc(d,'posts/fresh-client-id'),post()));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'posts/another-fresh-id')));
});
test('student bylines are their alias; registrationKind cannot be self-declared to escape it; dates stay honest',async()=>{
 const d=db('student','student@ucdconnect.ie');
 await assertFails(setDoc(doc(d,'posts/named'),{...post(),authorName:'Konstantinos Stouras'}));
 await assertFails(setDoc(doc(d,'comments/named'),comment({authorName:'Aoife Byrne (12345678)'})));
 await assertFails(updateDoc(doc(d,'posts/published'),{createdAt:time-30*86400000}));
 await assertFails(updateDoc(doc(d,'posts/published'),{publishedAt:time-30*86400000}));
 await assertSucceeds(updateDoc(doc(db('teacher-one'),'posts/published'),{publishedAt:time-30*86400000}));
 // declaring oneself a teacher renames the private profile but cannot put a real name on a post
 await assertSucceeds(updateDoc(doc(d,'profiles/student'),{registrationKind:'teacher',penName:'Aoife Byrne'}));
 await assertFails(setDoc(doc(d,'posts/real-name'),{...post(),authorName:'Aoife Byrne'}));
 await assertFails(setDoc(doc(d,'comments/real-name'),comment({authorName:'Aoife Byrne'})));
 // staff by role may use their own name
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'profiles/admin'),{...profile('kstouras@gmail.com'),studentId:'',penName:'kstouras'}));
 await assertSucceeds(updateDoc(doc(db('admin','kstouras@gmail.com'),'profiles/admin'),{penName:'Konstantinos'}));
 await assertSucceeds(updateDoc(doc(db('teacher-one'),'profiles/teacher-one'),{penName:'Dr Teacher'}).catch(async e=>{await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'profiles/teacher-one'),{...profile('teacher-one@ucd.ie'),studentId:'',penName:'quiet-heron-482'}));return updateDoc(doc(db('teacher-one'),'profiles/teacher-one'),{penName:'Dr Teacher'});}));
});
test('an instructor becomes a member of the blog their module writes on',async()=>{
 const d=db('teacher-two');
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'modules/guest'),mod('teacher-two','pm')));
 await assertSucceeds(setDoc(doc(d,'blogs/pm/members/teacher-two'),{uid:'teacher-two',moduleId:'guest',joinedAt:time}));
 await assertFails(setDoc(doc(d,'blogs/ops/members/teacher-two'),{uid:'teacher-two',moduleId:'guest',joinedAt:time}));
 await assertFails(setDoc(doc(db('teacher-one'),'blogs/pm/members/teacher-one'),{uid:'teacher-one',moduleId:'guest',joinedAt:time}));
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
 await assertSucceeds(setDoc(doc(d,'blogs/invited-blog'),blog('invited')));
 await assertSucceeds(setDoc(doc(d,'modules/new-teacher-module'),mod('invited','invited-blog')));
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
 await assertSucceeds(updateDoc(doc(d,'modules/two'),{peerReview:true,peerDeadline:'2027-12-14'}));
 await assertSucceeds(updateDoc(doc(d,'blogs/ops'),{title:'Admin edit'}));
});
test('students cannot self-enrol without a valid invitation for that exact module',async()=>{
 const d=db('new-student','student@ucdconnect.ie');
 await assertFails(setDoc(doc(d,'modules/one/members/new-student'),{...member('new-student'),inviteId:''}));
 await assertFails(setDoc(doc(d,'modules/one/members/new-student'),{...member('new-student'),inviteId:'student-expired'}));
 await assertFails(setDoc(doc(d,'modules/one/members/new-student'),{...member('new-student'),inviteId:'student-old'}));   // retired format
 await assertFails(setDoc(doc(d,'modules/two/members/new-student'),member('new-student')));
 await assertSucceeds(setDoc(doc(d,'modules/one/members/new-student'),member('new-student')));
});
test('city codes resolve without exposing a list of active invitations',async()=>{
 const d=env.unauthenticatedContext().firestore();
 await assertSucceeds(getDoc(doc(d,'registrationCodes/madrid')));
 await assertFails(getDocs(collection(d,'registrationCodes')));
 await assertFails(getDoc(doc(d,'moduleInvites/student-valid')));
});
// A module's code is one of eight fixed cities, standing until replaced or revoked; the index
// names the module's blog (the link is /<blog>/join/<city>); a city serves one module at a time.
const cityInvite=(code,moduleId='one',blogId='pm',uid='teacher-one',extra={})=>({moduleId,blogId,code,createdBy:uid,createdAt:time,expiresAt:Date.UTC(9999,11,31),revoked:false,...extra});
const cityCode=(code,inviteId,moduleId='one',blogId='pm')=>({kind:'student',inviteId,moduleId,blogId,code,expiresAt:Date.UTC(9999,11,31),revoked:false});
test('only assigned instructors can generate and revoke module city-code invitations',async()=>{
 const d=db('teacher-one'),b=writeBatch(d);
 b.set(doc(d,'moduleInvites/new-city'),cityInvite('berlin'));
 b.set(doc(d,'registrationCodes/berlin'),cityCode('berlin','new-city'));
 await assertSucceeds(b.commit());
 await assertFails(updateDoc(doc(db('teacher-two'),'moduleInvites/new-city'),{revoked:true}));
 await assertFails(setDoc(doc(db('student'),'moduleInvites/forged'),cityInvite('athens','one','pm','student')));
 const revoke=writeBatch(d);revoke.update(doc(d,'moduleInvites/new-city'),{revoked:true});revoke.update(doc(d,'registrationCodes/berlin'),{revoked:true});await assertSucceeds(revoke.commit());
 await assertFails(setDoc(doc(db('new-student','student@ucdconnect.ie'),'modules/one/members/new-student'),{...member('new-student'),inviteId:'new-city'}));
});
test('a student code is one of the eight cities, carries the module’s own blog, and a city serves one module at a time',async()=>{
 const d=db('teacher-one');
 // not a city, or a city with three digits (the old format), is refused
 for(const code of ['tokyo','madrid-483','lima']){const b=writeBatch(d);b.set(doc(d,'moduleInvites/x-'+code),cityInvite(code));b.set(doc(d,'registrationCodes/'+code),cityCode(code,'x-'+code));await assertFails(b.commit());}
 // the blog must be the module's own
 const wrong=writeBatch(d);wrong.set(doc(d,'moduleInvites/wrong-blog'),cityInvite('athens','one','ops'));wrong.set(doc(d,'registrationCodes/athens'),cityCode('athens','wrong-blog','one','ops'));await assertFails(wrong.commit());
 const mismatch=writeBatch(d);mismatch.set(doc(d,'moduleInvites/mismatch'),cityInvite('athens'));mismatch.set(doc(d,'registrationCodes/athens'),cityCode('athens','mismatch','one','ops'));await assertFails(mismatch.commit());
 // madrid is module one's live code: module two cannot take it, even by overwriting the index entry
 const two=db('teacher-two'),steal=writeBatch(two);steal.set(doc(two,'moduleInvites/steal'),cityInvite('madrid','two','ops','teacher-two'));steal.set(doc(two,'registrationCodes/madrid'),cityCode('madrid','steal','two','ops'));await assertFails(steal.commit());
 // dublin was revoked: module one takes it over, replacing its own code in the same batch
 const take=writeBatch(d);
 take.set(doc(d,'moduleInvites/take-dublin'),cityInvite('dublin'));take.set(doc(d,'registrationCodes/dublin'),cityCode('dublin','take-dublin'));
 take.update(doc(d,'moduleInvites/student-valid'),{revoked:true});take.update(doc(d,'registrationCodes/madrid'),{revoked:true});
 take.update(doc(d,'moduleInvites/student-old'),{revoked:true});take.update(doc(d,'registrationCodes/ottawa-521'),{revoked:true});
 await assertSucceeds(take.commit());
 await assertSucceeds(setDoc(doc(db('new-student','student@ucdconnect.ie'),'modules/one/members/new-student'),{...member('new-student'),inviteId:'take-dublin'}));
 await assertFails(setDoc(doc(db('late','late@ucdconnect.ie'),'modules/one/members/late'),{...member('late'),inviteId:'student-valid'}));
 // anyone can resolve a code, and the index still cannot be listed
 const anon=env.unauthenticatedContext().firestore();
 await assertSucceeds(getDoc(doc(anon,'registrationCodes/dublin')));await assertFails(getDocs(collection(anon,'registrationCodes')));
});
test('non-members cannot comment simply by creating a platform account',async()=>{
 await assertFails(setDoc(doc(db('outsider'),'comments/no-invitation'),comment({authorId:'outsider'})));
});
test('feedback: anyone submits one bounded message with attachments in a batch; only the admin reads, closes and deletes',async()=>{
 const entry=(extra={})=>({text:'The Publish button is hidden on my phone.',name:'Ada',email:'ada@ucd.ie',uid:null,role:'visitor',ticket:'BLOG-261031-K3QP',url:'https://www.stouras.com/ucd-blog/#/write',route:'#/write',ua:'UA',viewport:'390×844',imageCount:1,audioCount:1,status:'new',createdAt:time,...extra});
 const shot={kind:'image',mime:'image/jpeg',dataUrl:'data:image/jpeg;base64,AAAA',bytes:27,seconds:0,order:0},note={kind:'audio',mime:'audio/webm',dataUrl:'data:audio/webm;base64,AAAA',bytes:27,seconds:42,order:1};
 const anon=env.unauthenticatedContext().firestore(),b=writeBatch(anon);
 b.set(doc(anon,'feedback/anon'),entry());b.set(doc(anon,'feedback/anon/attachments/0'),shot);b.set(doc(anon,'feedback/anon/attachments/1'),note);
 await assertSucceeds(b.commit());
 const student=db('student','student@ucdconnect.ie');
 await assertSucceeds(setDoc(doc(student,'feedback/mine'),entry({uid:'student',role:'student',imageCount:0,audioCount:0})));
 await assertFails(setDoc(doc(student,'feedback/forged'),entry({uid:'peer'})));
 await assertFails(setDoc(doc(anon,'feedback/claims-uid'),entry({uid:'student'})));
 await assertFails(setDoc(doc(anon,'feedback/empty'),entry({text:'',imageCount:0,audioCount:0})));
 await assertFails(setDoc(doc(anon,'feedback/closed'),entry({status:'closed'})));
 await assertFails(setDoc(doc(anon,'feedback/too-many'),entry({imageCount:6})));
 await assertFails(setDoc(doc(anon,'feedback/extra'),entry({resolution:'self-closed'})));
 await assertFails(setDoc(doc(anon,'feedback/anon/attachments/2'),{...shot,kind:'video',dataUrl:'data:video/mp4;base64,AAAA'}));
 await assertFails(setDoc(doc(anon,'feedback/anon/attachments/3'),{...shot,dataUrl:'data:text/html;base64,AAAA'}));
 await assertFails(setDoc(doc(anon,'feedback/orphan/attachments/0'),shot));
 await assertFails(setDoc(doc(anon,'feedback/anon/attachments/4'),{...note,seconds:999}));
 for(const d of [anon,student,db('teacher-one')]){
  await assertFails(getDoc(doc(d,'feedback/anon')));
  await assertFails(getDocs(collection(d,'feedback')));
  await assertFails(getDoc(doc(d,'feedback/anon/attachments/0')));
  await assertFails(updateDoc(doc(d,'feedback/anon'),{status:'closed'}));
  await assertFails(deleteDoc(doc(d,'feedback/anon')));
 }
 const admin=db('admin','kstouras@gmail.com');
 await assertSucceeds(getDocs(collection(admin,'feedback')));
 await assertSucceeds(getDocs(collection(admin,'feedback/anon/attachments')));
 await assertSucceeds(updateDoc(doc(admin,'feedback/anon'),{status:'closed',resolution:'Fixed.',closedAt:time}));
 await assertSucceeds(updateDoc(doc(admin,'feedback/anon'),{status:'reopened'}));
 await assertFails(updateDoc(doc(admin,'feedback/anon'),{text:'rewritten'}));
 await assertFails(updateDoc(doc(admin,'feedback/anon/attachments/0'),{dataUrl:'data:image/jpeg;base64,BBBB'}));
 const del=writeBatch(admin);del.delete(doc(admin,'feedback/anon/attachments/0'));del.delete(doc(admin,'feedback/anon/attachments/1'));del.delete(doc(admin,'feedback/anon'));
 await assertSucceeds(del.commit());
});
test('a post’s text lives under posts/{id}/content/body and follows the post’s own access',async()=>{
 const d=db('student','student@ucdconnect.ie');
 await assertSucceeds(getDoc(doc(d,'posts/published/content/body')));
 await assertSucceeds(getDoc(doc(d,'posts/draft/content/body')));   // the author's own draft
 await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(),'posts/published/content/body')));   // a published post is public, text included
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'posts/draft/content/body')));
 await assertFails(getDoc(doc(db('peer','peer@ucd.ie'),'posts/draft/content/body')));   // another student's draft
 const split=(()=>{const p=post();delete p.body;return {...p,text:'Test content',bodyBytes:19};})();   // the record without its text, as the app now saves it
 const b=writeBatch(d);b.set(doc(d,'posts/split'),split);b.set(doc(d,'posts/split/content/body'),{body:'<p>Test content</p>'});
 await assertSucceeds(b.commit());
 await assertFails(setDoc(doc(d,'posts/split/content/body'),{body:'<p>x</p>',extra:1}));
 await assertFails(setDoc(doc(d,'posts/split/content/notes'),{body:'<p>x</p>'}));
 await assertFails(setDoc(doc(d,'posts/other-draft/content/body'),{body:'<p>x</p>'}));
 await assertSucceeds(setDoc(doc(db('teacher-one','teacher-one@ucd.ie'),'posts/published/content/body'),{body:'<p>Edited by staff</p>'}));
 const del=writeBatch(d);del.delete(doc(d,'posts/split/content/body'));del.delete(doc(d,'posts/split'));
 await assertSucceeds(del.commit());
});
