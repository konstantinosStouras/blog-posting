import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {formatWritingTime,writingReport,EditingActivityClock} from '../writing-time.js';
test('idle editor starts paused, counts recent edits and stops at the inactivity cutoff',()=>{
 const c=new EditingActivityClock(30000);c.sample(5000);assert.equal(c.seconds,0);c.activity(5000);
 for(let t=6000;t<=40000;t+=1000)c.sample(t);
 assert.equal(c.seconds,30);assert.equal(c.active(40000),false);c.activity(40000);c.sample(41000);assert.equal(c.seconds,31);
});
test('leaving or hiding the editor pauses time until another editing action',()=>{
 const c=new EditingActivityClock();c.activity(1000);c.sample(2000);c.pause(2000);c.sample(60000);assert.equal(c.seconds,1);
 c.activity(60000);c.sample(61000);c.sample(62000,false);c.sample(90000);assert.equal(c.seconds,2);
});
import {compareTableValues} from '../sortable-tables.js';
import {createRosterWorkbook} from '../roster-export.js';
test('writing time formats hours without wrapping after a day',()=>{assert.equal(formatWritingTime(10212),'2:50:12');assert.equal(formatWritingTime(90061),'25:01:01');assert.equal(formatWritingTime(), '0:00:00');});
test('writing report sums only the author and assigned module sessions',()=>{
 const r=writingReport([{id:'p',moduleId:'m',authorId:'a',title:'Post'},{id:'private',moduleId:'other'}],[{postId:'p',moduleId:'m',uid:'a',seconds:100},{postId:'p',moduleId:'m',uid:'a',seconds:12},{postId:'p',moduleId:'m',uid:'other',seconds:999}],[{id:'m',title:'Module'}],[{uid:'a',studentId:'00123'}]);assert.equal(r.length,1);assert.equal(r[0].writingTime,'0:01:52');assert.equal(r[0].studentId,'00123');
});
test('sort compares numerical values, natural text and blanks',()=>{assert.ok(compareTableValues(2,10)<0);assert.ok(compareTableValues('Module 2','Module 10')<0);assert.ok(compareTableValues('',1)>0);});
test('Excel includes per-post cumulative time with bold heading and normal body',async()=>{
 const book=createRosterWorkbook(ExcelJS,{users:[],invitations:[],writing:[{title:'Post',writingTime:'2:50:12',seconds:10212,studentId:'00123'}]});const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await book.xlsx.writeBuffer());const sheet=loaded.getWorksheet('Post writing time');assert.equal(sheet.getCell('I2').value,'2:50:12');assert.equal(sheet.getCell('I1').font.bold,true);assert.equal(Boolean(sheet.getCell('I2').font.bold),false);
});
