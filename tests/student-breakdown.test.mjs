import {test} from 'node:test';import assert from 'node:assert/strict';
import {studentWritingBreakdown} from '../student-breakdown-model.js';
test('breakdown uses student and module identity for posts and sessions',()=>{
 const report={moduleTotals:[{authorId:'a',moduleId:'one',seconds:12}],writing:[{postId:'p',authorId:'a',moduleId:'one'},{postId:'other-module',authorId:'a',moduleId:'two'},{postId:'other-student',authorId:'b',moduleId:'one'}],sessions:[{postId:'p',authorId:'a',moduleId:'one',seconds:12},{postId:'p',authorId:'b',moduleId:'one',seconds:999},{postId:'p',authorId:'a',moduleId:'two',seconds:999}]};
 const result=studentWritingBreakdown(report,'a','one');assert.equal(result.posts.length,1);assert.equal(result.posts[0].sessions.length,1);assert.equal(result.posts[0].sessions[0].seconds,12);assert.equal(studentWritingBreakdown(report,'a','two'),null);
});
test('zero-post totals have an empty drill-down without inventing sessions',()=>{const result=studentWritingBreakdown({moduleTotals:[{authorId:'a',moduleId:'one',seconds:0}]},'a','one');assert.deepEqual(result.posts,[]);});
