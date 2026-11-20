import {cert, initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {scheduledYear, scheduledDraw, reviewId, PER_STUDENT} from '../peer-review-model.js';

const db = getFirestore(initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? {projectId: 'demo-ucd-blog'} : {credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))}));
async function draw(moduleRef) {
  return db.runTransaction(async tx => {
    const m = (await tx.get(moduleRef)).data();
    const roundRef = db.collection('peerRounds').doc(moduleRef.id);
    const prior = (await tx.get(roundRef)).data();
    const year = scheduledYear(m, prior);
    if (!year) return;
    const [roster, documents] = await Promise.all([
      tx.get(moduleRef.collection('members').select('penName')),
      tx.get(db.collection('posts').where('moduleId', '==', moduleRef.id).select('status','authorId','publishedAt','academicYear','authorName'))
    ]);
    const members = new Map(roster.docs.map(d => [d.id, d.get('penName') || '']));
    const posts = documents.docs.map(d => ({...d.data(), id: d.id}));
    const draw = scheduledDraw(m, year, posts, members);
    if (!draw) {
      console.log(moduleRef.id + ': fewer than five eligible authors');
      return;
    }
    const {assignments, seed} = draw;
    const now = Date.now();
    for (const row of assignments) {
      const ref = db.collection('peerReviews').doc(reviewId(moduleRef.id, row.postId, row.reviewerUid));
      tx.create(ref, {...row, moduleId: moduleRef.id, blogId: m.blogId, reviewerName: members.get(row.reviewerUid),
        assignedAt: now, updatedAt: now, grade: null, assessment: '', submittedAt: null});
    }
    tx.set(roundRef, {moduleId: moduleRef.id, blogId: m.blogId, status: 'open', academicYear: year,
      perStudent: PER_STUDENT, seed, assignedAt: now, openedAt: now, updatedAt: now, assignedBy: 'scheduler'});
    return assignments.length;
  });
}
const modules = await db.collection('modules').where('peerReview','==',true).select('deadline').get();
for (const m of modules.docs) {
  try {
    const count = await draw(m.ref);
    if (count) console.log(m.id + ': delivered ' + count + ' assignments');
  } catch (error) {
    console.error(m.id + ': ' + error.message);
    process.exitCode = 1;
  }
}
