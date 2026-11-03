import test from 'node:test';
import assert from 'node:assert/strict';
import {credits, hashtag, boldText} from '../share.js';

const school = boldText('UCD Michael Smurfit Graduate Business School');
test('a module becomes hashtags: code as is, the title run together and capitalised', () => {
  assert.equal(hashtag('BMGT2017D'), '#BMGT2017D');
  assert.equal(hashtag('Project Management'), '#ProjectManagement');
  assert.equal(hashtag('managing innovative projects (2026/27)'), '#ManagingInnovativeProjects202627');
});
test('the LinkedIn credit tags the module and bolds the school and the instructor; the plain credit keeps words and the address', () => {
  const c = credits({code: 'BMGT2017D', title: 'Project Management', teacherName: 'Konstantinos Stouras'});
  assert.equal(c.linkedin, `Read my blog as part of the #BMGT2017D #ProjectManagement ${school} module of Prof. ${boldText('Kostas Stouras')}`);
  assert.equal(c.plain, 'Read my blog as part of the BMGT2017D Project Management UCD Michael Smurfit Graduate Business School module of Prof. Kostas Stouras (https://www.linkedin.com/in/stouras/)');
});
test('another instructor is credited by their own name and address', () => {
  const c = credits({code: 'MIS40000', title: 'Operations', teacherName: 'Eve Lecturer', teacherLinkedin: 'https://www.linkedin.com/in/eve/'});
  assert.equal(c.linkedin, `Read my blog as part of the #MIS40000 #Operations ${school} module of Prof. ${boldText('Eve Lecturer')}`);
  assert.equal(c.plain, 'Read my blog as part of the MIS40000 Operations UCD Michael Smurfit Graduate Business School module of Prof. Eve Lecturer (https://www.linkedin.com/in/eve/)');
  assert.ok(!credits({code: 'X', title: 'Y', teacherName: 'Eve Lecturer'}).plain.includes('('), 'no address when the module has none');
});
test('without a module the credit names the owner alone', () => {
  assert.equal(credits(null).linkedin, `Read my blog of Prof. ${boldText('Kostas Stouras')}`);
  assert.equal(credits(null).plain, 'Read my blog of Prof. Kostas Stouras (https://www.linkedin.com/in/stouras/)');
});
