import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JOIN_CITIES, isJoinCity, cityLabel, normalizeCode, isRetiredStudentCode, randomCode} from '../invitation-codes.js';

test('the eight invitation cities are fixed, lowercase, distinct and valid in a URL', () => {
  assert.deepEqual(JOIN_CITIES, ['madrid', 'dublin', 'paris', 'berlin', 'athens', 'seattle', 'singapore', 'milano']);
  assert.equal(new Set(JOIN_CITIES).size, 8);
  for (const c of JOIN_CITIES) assert.match(c, /^[a-z]+$/);
});
test('a code is matched to a city without regard to case or spacing', () => {
  assert.equal(isJoinCity('Madrid'), true); assert.equal(isJoinCity('  milano '), true);
  assert.equal(isJoinCity('madrid-483'), false); assert.equal(isJoinCity('milan'), false); assert.equal(isJoinCity(''), false);
  assert.equal(normalizeCode(' Seattle '), 'seattle'); assert.equal(cityLabel('singapore'), 'Singapore'); assert.equal(cityLabel(''), '');
});
test('student codes from before the cities are retired; instructor codes keep their digits', () => {
  assert.equal(isRetiredStudentCode({code: 'ottawa-521'}), true);
  assert.equal(isRetiredStudentCode({code: 'madrid', blogId: 'pm'}), false);
  assert.equal(isRetiredStudentCode({kind: 'instructor', code: 'ottawa-521'}), false);
  assert.equal(isRetiredStudentCode({code: ''}), false);
  assert.match(randomCode(), /^[A-Z][a-z]+-[0-9]{3}$/);
});
