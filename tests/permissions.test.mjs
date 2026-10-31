import test from 'node:test';
import assert from 'node:assert/strict';
import {can} from '../permissions.js';
const teacher={uid:'teacher',role:'lecturer',managedModuleIds:['one']};
test('teachers can moderate only their assigned modules',()=>{
  for(const action of ['edit','publish','unpublish','feature','approve','deleteComment']){
    assert.equal(can(teacher,action,{moduleId:'one',authorId:'student'}),true,action);
    assert.equal(can(teacher,action,{moduleId:'two',authorId:'other'}),false,action);
  }
});
test('students edit their own posts but cannot bypass module approval',()=>{
  const student={uid:'s',role:'student',managedModuleIds:[]},post={authorId:'s',moduleId:'one',status:'draft'};
  assert.equal(can(student,'edit',post),true);
  assert.equal(can(student,'edit',{...post,authorId:'other'}),false);
  assert.equal(can(student,'publish',post,{requireApproval:true}),false);
  assert.equal(can(student,'feature',post),false);
});
