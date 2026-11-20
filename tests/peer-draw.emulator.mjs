import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {academicYearOf} from '../util.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('This test requires the Firestore emulator');
const db = getFirestore(initializeApp({projectId: 'demo-ucd-blog'}));
const run = () => execFileSync(process.execPath, ['tools/assign-peer-reviews.mjs'], {stdio:'inherit'});
const publishedAt = Date.parse('2025-10-01T12:00:00Z');
const academicYear = academicYearOf(publishedAt);
const moduleRef = db.doc('modules/draw-test');
await moduleRef.set({teacherIds:['draw-owner'],peerReview:false, blogId:'pm', deadline:'2025-10-01'});
for (let i=0; i<5; i++) {
  const authorId = 'test-author-' + i;
  await moduleRef.collection('members').doc(authorId).set({penName:authorId});
  await db.doc('posts/draw-'+i).set({authorId, publishedAt, academicYear, moduleId:moduleRef.id, status:i===4?'draft':'published'});
}
const rows = () => db.collection('peerReviews').where('moduleId','==',moduleRef.id).get();
run();
assert.equal((await rows()).size,0);
await moduleRef.update({peerReview:true});
run();
assert.equal((await rows()).size,0);
await db.doc('posts/draw-4').update({status:'published'});
await db.doc('posts/draw-late').set({authorId:'test-author-4',publishedAt:publishedAt+86400000,academicYear,moduleId:moduleRef.id,status:'published'});
await db.doc('posts/draw-revision').set({authorId:'test-author-0',publishedAt:publishedAt+1000,academicYear,moduleId:moduleRef.id,status:'published'});
run();
assert.equal((await rows()).size,0);
await db.doc('roles/draw-owner').set({role:'lecturer',peerAccess:true});
run();
const first = await rows();
assert.equal(first.size,20);
const targets = new Map(), reviewers = new Map();
for (const d of first.docs) {
  const {postId,authorId,reviewerUid} = d.data();
  assert.notEqual(authorId,reviewerUid);
  assert.ok(!['draw-late','draw-0'].includes(postId));
  if (!targets.has(postId)) targets.set(postId,new Set());
  if (!reviewers.has(reviewerUid)) reviewers.set(reviewerUid,new Set());
  targets.get(postId).add(reviewerUid);
  reviewers.get(reviewerUid).add(postId);
}
for (const group of [...targets.values(),...reviewers.values()]) assert.equal(group.size,4);
await first.docs[0].ref.update({grade:8});
run();
assert.equal((await first.docs[0].ref.get()).get('grade'),8);
assert.equal((await rows()).size,20);
