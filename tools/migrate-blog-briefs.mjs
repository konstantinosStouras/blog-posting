import {initializeApp} from 'firebase-admin/app';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';

// With Application Default Credentials for the live project. Dry-run unless --apply is supplied.
const db = getFirestore(initializeApp({projectId: 'stouras-ucd-blog'}));
const apply = process.argv.includes('--apply');
for (const blog of (await db.collection('blogs').get()).docs) {
  await db.runTransaction(async tx => {
    const current = await tx.get(blog.ref);
    if (!current.exists || !Object.hasOwn(current.data(), 'brief')) return;
    const ref = blog.ref.collection('private').doc('brief');
    const existing = await tx.get(ref);
    const brief = current.get('brief') || '';
    if (brief && existing.exists && brief !== existing.get('brief')) {
      throw Error('Conflicting versions of brief for ' + blog.id);
    }
    console.log((apply ? 'Migrating ' : 'Would migrate ') + blog.id);
    if (!apply) return;
    if (brief && !existing.exists) tx.set(ref, {brief});
    tx.update(blog.ref, {brief: FieldValue.delete()});
  });
}
