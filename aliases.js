// Student aliases. Every student writes and comments under a pen name that is
// generated at random when the account is created (adjective-noun-number) and
// cannot be edited, so no name, initials or student number can leak into the
// byline. Instructors see who is behind each alias in the roster; readers and
// classmates do not. The pattern is mirrored in firestore.rules.
const ADJECTIVES = ['amber', 'brisk', 'calm', 'clever', 'coral', 'crisp', 'deft', 'eager', 'fair', 'fleet', 'gentle', 'hardy', 'humble', 'ivory', 'jade', 'keen', 'lively', 'lucid', 'mellow', 'merry', 'nimble', 'noble', 'olive', 'quiet', 'rapid', 'rosy', 'sage', 'sandy', 'sharp', 'silver', 'sleek', 'snowy', 'solid', 'steady', 'sunny', 'swift', 'tidy', 'vivid', 'warm', 'witty'];
const NOUNS = ['badger', 'beacon', 'birch', 'canyon', 'cedar', 'comet', 'coral', 'crane', 'delta', 'dune', 'ember', 'falcon', 'fjord', 'glacier', 'harbour', 'heron', 'island', 'juniper', 'kestrel', 'lantern', 'lark', 'linnet', 'maple', 'meadow', 'meteor', 'orchid', 'osprey', 'otter', 'pebble', 'pine', 'plover', 'quartz', 'raven', 'reef', 'river', 'robin', 'saffron', 'summit', 'tern', 'willow'];
export const ALIAS_PATTERN = /^[a-z]+-[a-z]+-\d{3}$/;

function pick(n) {
  if (globalThis.crypto?.getRandomValues) { const a = new Uint32Array(1); globalThis.crypto.getRandomValues(a); return a[0] % n; }
  return Math.floor(Math.random() * n);
}
export function randomAlias() {
  return `${ADJECTIVES[pick(ADJECTIVES.length)]}-${NOUNS[pick(NOUNS.length)]}-${String(100 + pick(900))}`;
}
export const isAlias = name => ALIAS_PATTERN.test(String(name || ''));
