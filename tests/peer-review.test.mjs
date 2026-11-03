import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assignPeerReviews, verifyAssignments, fillGaps, reviewablePosts, seededShuffle, validateReview, roundOpen, peerPostRows, peerReviewerRows, summaryFor, buildSynthesis, buildReviewerAssessment, parseSynthesis, parseReviewerAssessment, peerPostSheet, peerReviewerSheet, PEER_POST_COLUMNS, PEER_REVIEWER_COLUMNS, PER_STUDENT, reviewId, peerCohort} from '../peer-review-model.js';

const posts = n => Array.from({length: n}, (_, i) => ({id: 'p' + i, authorId: 'u' + i, authorName: 'pen-' + i, title: 'Post ' + i, status: 'published', publishedAt: 1000 + i, body: '<p>' + 'Analysis of the organisation. '.repeat(30) + '</p>'}));

test('a seeded shuffle is reproducible and a different seed gives a different order', () => {
  const items = Array.from({length: 30}, (_, i) => i);
  assert.deepEqual(seededShuffle(items, 'abc'), seededShuffle(items, 'abc'));
  assert.notDeepEqual(seededShuffle(items, 'abc'), seededShuffle(items, 'abd'));
  assert.deepEqual([...seededShuffle(items, 'abc')].sort((a, b) => a - b), items);
});

test('every student reviews four distinct posts of others and every post gets four distinct reviewers', () => {
  for (const n of [5, 6, 11, 34, 83]) {
    const {assignments, seed} = assignPeerReviews({posts: posts(n), seed: 'round-' + n});
    assert.equal(assignments.length, n * PER_STUDENT);
    const check = verifyAssignments(assignments, {posts: posts(n)});
    assert.deepEqual(check.problems, [], `n=${n}`); assert.equal(check.ok, true);
    assert.equal(check.reviewers, n); assert.equal(check.posts, n);
    for (const a of assignments) assert.notEqual(a.reviewerUid, a.authorId);
    assert.equal(seed, 'round-' + n);
    // the same seed redraws the same round
    assert.deepEqual(assignPeerReviews({posts: posts(n), seed}).assignments, assignments);
  }
  assert.throws(() => assignPeerReviews({posts: posts(4)}), /At least 5 students/);
});

test('only the latest published post per author takes part; drafts and students without a post are left out', () => {
  const ps = [...posts(6), {id: 'd', authorId: 'u0', status: 'draft', publishedAt: null}, {id: 'p0-new', authorId: 'u0', authorName: 'pen-0', status: 'published', publishedAt: 9999}];
  const pool = reviewablePosts(ps);
  assert.equal(pool.length, 6); assert.ok(pool.some(p => p.id === 'p0-new')); assert.ok(!pool.some(p => p.id === 'p0' || p.id === 'd'));
  const {assignments} = assignPeerReviews({posts: ps, seed: 's'});
  assert.ok(!assignments.some(a => a.postId === 'p0' || a.postId === 'd'));
});

test('students without a post can be added as extra reviewers; they get the least-reviewed posts', () => {
  const {assignments, extras} = assignPeerReviews({posts: posts(6), extraReviewers: ['x1', 'u2', 'x1'], seed: 's'});
  assert.deepEqual(extras, ['x1']);   // u2 has a post already; x1 once
  const mine = assignments.filter(a => a.reviewerUid === 'x1');
  assert.equal(mine.length, 4); assert.equal(new Set(mine.map(a => a.postId)).size, 4);
  const check = verifyAssignments(assignments);
  assert.equal(check.ok, true);
  const counts = {}; for (const a of assignments) counts[a.postId] = (counts[a.postId] || 0) + 1;
  assert.deepEqual(Object.values(counts).sort(), [4, 4, 5, 5, 5, 5]);
});

test('gaps are filled for a late post and a late reviewer without touching existing assignments', () => {
  const base = assignPeerReviews({posts: posts(7), seed: 's'}).assignments;
  const late = {id: 'late', authorId: 'u-late', authorName: 'pen-late', status: 'published', publishedAt: 5000};
  const added = fillGaps({assignments: base, posts: [...posts(7), late], reviewers: [...posts(7).map(p => p.authorId), 'u-late']});
  const forLate = added.filter(a => a.postId === 'late'), byLate = added.filter(a => a.reviewerUid === 'u-late');
  assert.equal(forLate.length, 4); assert.equal(new Set(forLate.map(a => a.reviewerUid)).size, 4); assert.ok(!forLate.some(a => a.reviewerUid === 'u-late'));
  assert.equal(byLate.length, 4); assert.ok(!byLate.some(a => a.postId === 'late'));
  assert.equal(verifyAssignments([...base, ...added], {posts: [...posts(7), late]}).ok, true);
  assert.deepEqual(fillGaps({assignments: [...base, ...added], posts: [...posts(7), late], reviewers: [...posts(7).map(p => p.authorId), 'u-late']}), []);
});

test('the check reports self-reviews, duplicates and short counts', () => {
  const bad = [{postId: 'p1', authorId: 'u1', reviewerUid: 'u1'}, {postId: 'p2', authorId: 'u2', reviewerUid: 'u3'}, {postId: 'p2', authorId: 'u2', reviewerUid: 'u3'}];
  const c = verifyAssignments(bad, {perStudent: 2});
  assert.equal(c.ok, false);
  assert.ok(c.problems.some(p => /own post/.test(p)));
  assert.ok(c.problems.some(p => /Reviewer u3 has the same post/.test(p)));
  assert.ok(c.problems.some(p => /Post p2 has the same reviewer/.test(p)));
  assert.ok(c.problems.some(p => /Reviewer u1 has 1 post instead of 2/.test(p)));
});

test('a submission needs a whole-number rating from 1 to 10; the feedback has no minimum length', () => {
  const text = 'word '.repeat(60);
  assert.deepEqual(validateReview({grade: '7', assessment: text}), {grade: 7, assessment: text.trim()});
  assert.deepEqual(validateReview({grade: 8, assessment: ''}), {grade: 8, assessment: ''});
  assert.throws(() => validateReview({grade: 0, assessment: text}), /from 1 to 10/);
  assert.throws(() => validateReview({grade: 7.5, assessment: text}), /whole numbers/);
  assert.throws(() => validateReview({grade: 8, assessment: 'x'.repeat(4001)}), /under 4000/);
  assert.equal(roundOpen({status: 'open'}), true);
  assert.equal(roundOpen({status: 'closed'}), false);
  assert.equal(roundOpen({status: 'open'}, {peerDeadline: '2000-01-01'}), false);
  assert.equal(roundOpen({status: 'open'}, {peerDeadline: '2999-01-01'}), true);
  assert.equal(roundOpen({status: 'open', deadline: '2000-01-01'}), true);   // the deadline is the module's, not the round's
  assert.equal(roundOpen(null), false);
  assert.equal(reviewId('m', 'p', 'u'), 'm_p_u');
});

test('a round covers one academic year: its posts, and its students with or without a post', () => {
  const sep26 = Date.UTC(2026, 8, 15), sep25 = Date.UTC(2025, 8, 15);
  const posts = [
    {id: 'new1', authorId: 'n1', status: 'published', academicYear: '2026/27', publishedAt: sep26 + 1},
    {id: 'new2', authorId: 'n2', status: 'published', publishedAt: sep26 + 2},   // no stamp: the year of publication counts
    {id: 'old1', authorId: 'o1', status: 'published', academicYear: '2025/26', publishedAt: sep25},
    {id: 'draft', authorId: 'n3', status: 'draft', academicYear: '2026/27'},
  ];
  const students = [{uid: 'n1', joinedAt: sep26}, {uid: 'n2', joinedAt: sep26}, {uid: 'n3', joinedAt: sep26 + 5}, {uid: 'o1', joinedAt: sep25}, {uid: 'o2', joinedAt: sep25}];
  const c = peerCohort({posts, students, year: '2026/27'});
  assert.equal(c.year, '2026/27');
  assert.deepEqual(c.posts.map(p => p.id).sort(), ['new1', 'new2']);
  assert.deepEqual(c.authors.sort(), ['n1', 'n2']);
  assert.deepEqual(c.extras, ['n3']);   // joined this year, no published post: reviews all the same; last year's students do not
  const last = peerCohort({posts, students, year: '2025/26'});
  assert.deepEqual(last.posts.map(p => p.id), ['old1']); assert.deepEqual(last.extras, ['o2']);
});

const reviews = [
  {postId: 'p1', authorId: 'a', reviewerUid: 'r1', order: 1, grade: 8, assessment: 'Specific praise and a suggestion. '.repeat(10), submittedAt: 5},
  {postId: 'p1', authorId: 'a', reviewerUid: 'r2', order: 1, grade: 4, assessment: 'Harsh but fair. '.repeat(10), submittedAt: 6},
  {postId: 'p1', authorId: 'a', reviewerUid: 'r3', order: 2, grade: null, assessment: ''},
  {postId: 'p2', authorId: 'b', reviewerUid: 'r1', order: 2, grade: 10, assessment: 'Great. '.repeat(10), submittedAt: 7},
  {postId: 'p2', authorId: 'b', reviewerUid: 'r2', order: 2, grade: 6, assessment: 'Fine. '.repeat(10), submittedAt: 8},
];
const users = [{uid: 'a', firstName: 'Ann', lastName: 'Author', studentId: '1', contactEmail: 'ann@ucd.ie'}, {uid: 'r1', firstName: 'Rae', lastName: 'One', penName: 'pen-r1'}, {uid: 'r2', firstName: 'Ray', lastName: 'Two', penName: 'pen-r2'}];
const twoPosts = [{id: 'p1', authorId: 'a', authorName: 'pen-a', title: 'One', academicYear: '2026/27', body: '<p>Body</p>'}, {id: 'p2', authorId: 'b', authorName: 'pen-b', title: 'Two'}];

test('post rows carry the grades received, the mean, a leniency-adjusted mean and a spread flag', () => {
  const rows = peerPostRows({reviews, posts: twoPosts, users, aiReviews: [{postId: 'p1', grade: 7, feedback: 'AI says', peerSynthesis: 'Merged', peerSuggestedGrade: 7.5, finalGrade: 'B+'}]});
  const p1 = rows.find(r => r.postId === 'p1'), p2 = rows.find(r => r.postId === 'p2');
  assert.equal(p1.assigned, 3); assert.equal(p1.received, 2); assert.deepEqual(p1.grades, [8, 4]); assert.equal(p1.mean, 6); assert.equal(p1.spread, 4); assert.equal(p1.flagged, true);
  assert.equal(p1.lastName, 'Author'); assert.equal(p1.email, 'ann@ucd.ie'); assert.equal(p1.penName, 'pen-a');
  // r1 averages 9 and r2 averages 5 across their reviews; the class mean is 7, so p1's adjusted grades are 8-9+7=6 and 4-5+7=6
  assert.equal(p1.adjustedMean, 6); assert.equal(p2.adjustedMean, 8); assert.equal(p2.mean, 8); assert.equal(p2.flagged, true);
  assert.equal(p1.aiGrade, 7); assert.equal(p1.synthesis, 'Merged'); assert.equal(p1.suggestedGrade, 7.5); assert.equal(p1.finalGrade, 'B+');
  assert.equal(p1.pending.length, 1);
  const s = summaryFor(p1);
  assert.equal(s.count, 2); assert.equal(s.feedback, 'Merged'); assert.deepEqual(Object.keys(s.assessments[0]), ['grade', 'assessment']);
  assert.ok(!JSON.stringify(s).includes('r1'));
});

test('reviewer rows list each student’s assigned posts in order with what they submitted', () => {
  const rows = peerReviewerRows({reviews, posts: twoPosts, users, notes: [{reviewerUid: 'r1', aiScore: 8, aiNote: 'Good', grade: 'A', note: 'Thanks'}]});
  const r1 = rows.find(r => r.reviewerUid === 'r1'), r3 = rows.find(r => r.reviewerUid === 'r3');
  assert.equal(r1.assigned, 2); assert.equal(r1.done, 2); assert.equal(r1.meanGiven, 9); assert.deepEqual(r1.items.map(i => i.post.title), ['One', 'Two']);
  assert.equal(r1.aiScore, 8); assert.equal(r1.grade, 'A'); assert.equal(r1.lastSubmittedAt, 7); assert.ok(r1.wordsWritten > 0);
  assert.equal(r3.done, 0); assert.equal(r3.meanGiven, null); assert.equal(r3.lastSubmittedAt, null);
});

test('the Excel sheets spread the reviews over numbered columns', () => {
  const rows = peerPostRows({reviews, posts: twoPosts, users});
  const sheet = peerPostSheet(rows, p => 'https://x/' + p.id);
  const p1 = sheet.find(r => r.postId === 'p1');
  assert.equal(p1.g1, 8); assert.equal(p1.g2, 4); assert.equal(p1.g3, undefined); assert.equal(p1.url, 'https://x/p1');
  for (const [, key] of PEER_POST_COLUMNS) assert.ok(key in p1 || /^[gf][3-5]$/.test(key), key);
  const rs = peerReviewerSheet(peerReviewerRows({reviews, posts: twoPosts, users}), p => 'https://x/' + p.id);
  const r1 = rs.find(r => r.reviewerUid === 'r1');
  assert.equal(r1.u1, 'https://x/p1'); assert.equal(r1.s2, 10); assert.ok(r1.c2.startsWith('Great.'));
  for (const [, key] of PEER_REVIEWER_COLUMNS) assert.ok(key in r1 || /^[usc][3-5]$/.test(key), key);
});

test('the synthesis prompt carries the reviews, the AI review and the post; the reviewer prompt carries the reviews', () => {
  const row = peerPostRows({reviews, posts: twoPosts, users, aiReviews: [{postId: 'p1', grade: 7, feedback: 'AI says'}]}).find(r => r.postId === 'p1');
  const s = buildSynthesis({persona: 'Professor of {module}', row, post: twoPosts[0], blog: {title: 'PM', brief: '<p>Brief</p>'}, module: {code: 'BMGT45540', title: 'MIP'}});
  assert.equal(s.system, 'Professor of BMGT45540 MIP');
  assert.match(s.user, /reviewed by 2 classmates/); assert.match(s.user, /average is 6\.0/); assert.match(s.user, /Review 1 \(rating 8\/10\)/); assert.match(s.user, /My own AI review \(grade 7\.0\/10\)/); assert.match(s.user, /Brief/); assert.match(s.user, /titled "One"/);
  assert.throws(() => buildSynthesis({row: {...row, reviews: []}, post: twoPosts[0]}), /No peer reviews/);
  const rr = peerReviewerRows({reviews, posts: twoPosts, users}).find(r => r.reviewerUid === 'r1');
  const a = buildReviewerAssessment({row: rr, module: {code: 'X'}, postText: p => 'TEXT OF ' + p.id});
  assert.match(a.user, /rate 2 classmates/); assert.match(a.user, /Review 1 of the post "One" \(rating given: 8\/10\)/); assert.match(a.user, /TEXT OF p2/);
  assert.throws(() => buildReviewerAssessment({row: {...rr, items: []}}), /not submitted/);
});

test('replies parse as JSON or fall back to text', () => {
  assert.deepEqual(parseSynthesis('{"grade": 7.25, "summary": "S", "feedback": "F"}'), {grade: 7.3, summary: 'S', feedback: 'F', raw: '{"grade": 7.25, "summary": "S", "feedback": "F"}'});
  assert.equal(parseSynthesis('plain words').grade, null);
  const r = parseReviewerAssessment('```json\n{"score": 8, "feedback": "Good", "perReview": [{"score": 9, "note": "specific"}, {"score": "7", "note": 1}]}\n```');
  assert.equal(r.score, 8); assert.equal(r.perReview.length, 2); assert.equal(r.perReview[1].score, 7); assert.equal(r.perReview[1].note, '1');
  assert.deepEqual(parseReviewerAssessment('no json').perReview, []);
});
