// The organisation field of a post names one or more organisations, separated by
// commas or semicolons. orgList gives the names; orgPhrase joins them for prose.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orgList, orgPhrase} from '../util.js';

test('orgList splits on commas and semicolons, trims, drops blanks and repeats', () => {
  assert.deepEqual(orgList('Ryanair'), ['Ryanair']);
  assert.deepEqual(orgList(' FaceBook , JPMorgan ;  ; facebook'), ['FaceBook', 'JPMorgan']);
  assert.deepEqual(orgList(''), []);
  assert.deepEqual(orgList(undefined), []);
  assert.deepEqual(orgList(' , ; '), []);
});

test('orgPhrase reads as prose', () => {
  assert.equal(orgPhrase(''), '');
  assert.equal(orgPhrase('Ryanair'), 'Ryanair');
  assert.equal(orgPhrase('Ryanair, Aer Lingus'), 'Ryanair and Aer Lingus');
  assert.equal(orgPhrase('A; B; C'), 'A, B and C');
});
