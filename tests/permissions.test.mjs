import test from 'node:test';
import assert from 'node:assert/strict';
import {can} from '../permissions.js';
const teacher={uid:'teacher',role:'lecturer',managedModuleIds:['one']};
test('teachers can moderate only their assigned modules',()=>{
  for(const action of ['edit','publish','approve','deleteComment']){
    assert.equal(can(teacher,action,{moduleId:'one',authorId:'student'}),true,action);
    assert.equal(can(teacher,action,{moduleId:'two',authorId:'other'}),false,action);
  }
});
test('students edit their own posts but cannot bypass module approval',()=>{
  const student={uid:'s',role:'student',managedModuleIds:[]},post={authorId:'s',moduleId:'one',status:'draft'};
  assert.equal(can(student,'edit',post),true);
  assert.equal(can(student,'edit',{...post,authorId:'other'}),false);
  assert.equal(can(student,'publish',post,{requireApproval:true}),false);
  // once a module closes submissions the rules refuse every student update, so the UI must not offer it
  assert.equal(can(student,'edit',post,{submissionsOpen:false}),false);
  assert.equal(can(teacher,'edit',{...post,moduleId:'one'},{submissionsOpen:false}),true);
});
test('a published post stays as it is once the module deadline has passed; drafts and staff are unaffected',()=>{
  const student={uid:'s',role:'student',managedModuleIds:[]},post={authorId:'s',moduleId:'one',status:'published'};
  assert.equal(can(student,'edit',post,{deadline:'2000-01-01'}),false);
  assert.equal(can(student,'edit',{...post,status:'draft'},{deadline:'2000-01-01'}),true);
  assert.equal(can(student,'edit',post,{deadline:'2999-01-01'}),true);
  assert.equal(can(student,'edit',post,{deadline:''}),true);
  assert.equal(can(teacher,'edit',post,{deadline:'2000-01-01'}),true);
});
