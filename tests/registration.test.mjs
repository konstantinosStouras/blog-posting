import test from 'node:test';
import assert from 'node:assert/strict';
import {registrationProfile} from '../registration.js';

const student={firstName:' Jane ',lastName:' Doe ',universityEmail:' Jane.Doe@EXAMPLE.EDU ',affiliation:' Example University ',studentId:' 12345678 '};
test('student registration requires and normalizes UCD details',()=>{
  assert.deepEqual(registrationProfile(student),{firstName:'Jane',lastName:'Doe',contactEmail:'jane.doe@example.edu',affiliation:'Example University',studentId:'12345678',registrationKind:'student'});
  assert.throws(()=>registrationProfile({...student,studentId:''}),/university ID/);
  assert.throws(()=>registrationProfile({...student,universityEmail:'invalid'}),/university email/);
  assert.throws(()=>registrationProfile({...student,affiliation:''}),/school or university/);
  assert.throws(()=>registrationProfile({...student,lastName:' '}),/last name/);
});
test('teacher registration omits student ID without granting a role',()=>{
  const p=registrationProfile({...student,universityEmail:'instructor@another.edu',studentId:''},true);
  assert.equal(p.studentId,'');assert.equal(p.registrationKind,'instructor');assert.equal(p.role,undefined);
});
