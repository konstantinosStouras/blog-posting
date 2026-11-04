// Run with application default credentials. Dry-run by default, --apply writes missing releases.
import {initializeApp, applicationDefault} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {reviewerRelease} from '../peer-review-model.js';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--apply')) throw Error('Usage: node tools/migrate-reviewer-releases.mjs [--apply]');
const apply = args.includes('--apply'), projectId = 'stouras-ucd-blog';
const db = getFirestore(initializeApp({credential: applicationDefault(), projectId}));
let eligible = 0, existing = 0;
for await (const legacy of db.collection('peerReviewerNotes').where('releasedAt', '>', 0).stream()) {
  const destination = db.collection('peerReviewerReleases').doc(legacy.id);
  const result = await db.runTransaction(async tx => {
    const [source, target] = await tx.getAll(legacy.ref, destination);
    if (target.exists) return 'existing';
    const note = source.data();
    if (!note?.releasedAt) return 'skipped';
    if (source.id !== `${note.moduleId}_${note.reviewerUid}`) throw Error('Reviewer note has a mismatched identity. Inspect it before migrating.');
    if (apply) tx.create(destination, reviewerRelease(note));
    return 'eligible';
  });
  if (result === 'eligible') eligible++;
  if (result === 'existing') existing++;
}
console.log(`${projectId}: ${eligible} release(s) ${apply ? 'created' : 'would be created'}, ${existing} already present.`);
