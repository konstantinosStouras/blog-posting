import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomAlias, isAlias, ALIAS_PATTERN} from '../aliases.js';

test('aliases are random adjective-noun-number names that reveal nothing about the student', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) { const a = randomAlias(); assert.match(a, ALIAS_PATTERN); seen.add(a); }
  assert.ok(seen.size > 400, 'aliases vary');
  assert.equal(isAlias('quiet-heron-482'), true);
  for (const bad of ['Aoife Byrne', 'student_26000001', 'aoife.b', 'quiet-heron-48', 'Quiet-Heron-482', '']) assert.equal(isAlias(bad), false, bad);
});
