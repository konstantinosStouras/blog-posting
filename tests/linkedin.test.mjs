import {test} from 'node:test';
import assert from 'node:assert/strict';
import {linkedinUrl} from '../util.js';

test('a LinkedIn profile address is stored in one canonical form however it was typed', () => {
  const want = 'https://www.linkedin.com/in/aoife-byrne';
  for (const typed of ['aoife-byrne', 'in/aoife-byrne', 'linkedin.com/in/aoife-byrne', 'www.linkedin.com/in/aoife-byrne/', 'https://www.linkedin.com/in/aoife-byrne', 'https://ie.linkedin.com/in/aoife-byrne/?trk=share', '  https://www.linkedin.com/in/aoife-byrne/  '])
    assert.equal(linkedinUrl(typed), want, typed);
  assert.equal(linkedinUrl('https://www.linkedin.com/in/Aoife-Byrne-1a2b3c'), 'https://www.linkedin.com/in/Aoife-Byrne-1a2b3c');
});

test('an empty field stays empty and anything that is not a LinkedIn profile is refused', () => {
  assert.equal(linkedinUrl(''), '');
  assert.equal(linkedinUrl('   '), '');
  assert.equal(linkedinUrl(undefined), '');
  for (const bad of ['https://example.com/in/aoife', 'example.com', 'https://www.linkedin.com/company/ucd', 'https://www.linkedin.com/', 'aoife@ucd.ie', 'javascript:alert(1)', 'linkedin.com/in/'])
    assert.equal(linkedinUrl(bad), null, bad);
});
