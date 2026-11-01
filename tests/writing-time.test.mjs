import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {formatWritingTime,writingReport,sessionHistoryReport,moduleWritingTotals,EditingActivityClock,WritingSessionHistory} from '../writing-time.js';
test('student module totals sum all posts, keep modules separate and include zero-post students',async()=>{
 const posts=[{postId:'a',moduleId:'one',authorId:'student',seconds:3600},{postId:'b',moduleId:'one',authorId:'student',seconds:6612},{postId:'c',moduleId:'two',authorId:'student',seconds:3},{postId:'private',moduleId:'other',authorId:'student',seconds:9999},{postId:'teacher',moduleId:'one',authorId:'teacher',seconds:20}];
 const memberships=[{uid:'student',moduleId:'one',studentId:'00123'},{uid:'student',moduleId:'two',studentId:'00123'},{uid:'zero',moduleId:'one'},{uid:'secret',moduleId:'other'}];
 const rows=moduleWritingTotals([...posts,posts[0]],memberships,[{id:'one',title:'One',code:'ONE',teacherIds:['teacher']},{id:'two',title:'Two'}],[{uid:'teacher',role:'lecturer'}]);
 assert.equal(rows.length,3);const one=rows.find(r=>r.authorId==='student'&&r.moduleId==='one');assert.equal(one.writingTime,'2:50:12');assert.equal(one.postCount,2);assert.equal(rows.find(r=>r.moduleId==='two').seconds,3);assert.equal(rows.find(r=>r.authorId==='zero').seconds,0);
 const book=createRosterWorkbook(ExcelJS,{users:[],invitations:[],moduleTotals:[one]});const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await book.xlsx.writeBuffer());const s=loaded.getWorksheet('Student module totals');assert.equal(s.getCell('K2').value,'2:50:12');assert.equal(s.getCell('H2').value,'00123');assert.equal(s.getCell('K1').font.bold,true);assert.equal(Boolean(s.getCell('K2').font.bold),false);
});
test('history splits inactivity and returns into independent active sessions',()=>{
 const rows=[];let id=0;const h=new WritingSessionHistory({uid:'a',postId:'p',moduleId:'m',newId:()=>String(++id),onSession:r=>rows.push(r)});
 h.activity(1000,100000);for(let t=2000;t<=32000;t+=1000)h.sample(t,99000+t);
 assert.equal(rows.length,1);assert.equal(rows[0].seconds,30);assert.equal(rows[0].endReason,'inactive');assert.equal(rows[0].endedAt,130000);
 h.activity(60000,159000);h.sample(61000,160000);h.pause(62000,161000,'left');
 assert.equal(rows.length,2);assert.equal(rows[1].seconds,2);assert.equal(rows[1].endReason,'left');assert.equal(rows[0].seconds+rows[1].seconds,32);
});
test('history report limits scope, preserves legacy gaps and exports session timestamps',async()=>{
 const sessions=sessionHistoryReport([{id:'p',moduleId:'m',authorId:'a',title:'Post'},{id:'private',moduleId:'other',authorId:'a'}],[{id:'old',postId:'p',moduleId:'m',uid:'a',seconds:12,startedAt:1000},{id:'new',postId:'p',moduleId:'m',uid:'a',seconds:4,startedAt:10000,lastActivityAt:11000,lastRecordedAt:14000,endedAt:14000,endReason:'left'},{id:'secret',postId:'private',moduleId:'other',uid:'a',seconds:999}],[{id:'m',title:'Module'}],[{uid:'a',studentId:'00123'}]);
 assert.equal(sessions.length,2);assert.equal(sessions[1].lastRecordedAt,0);assert.equal(sessions[1].endReason,'legacy');assert.equal(sessions[0].writingTime,'0:00:04');
 const w=createRosterWorkbook(ExcelJS,{users:[],invitations:[],sessions});const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await w.xlsx.writeBuffer());const sheet=loaded.getWorksheet('Writing sessions');assert.equal(sheet.getCell('G2').value,'1970-01-01 00:00:10');assert.equal(sheet.getCell('K2').value,'0:00:04');assert.equal(sheet.getCell('F2').value,'00123');assert.equal(sheet.getCell('G1').font.bold,true);assert.equal(Boolean(sheet.getCell('G2').font.bold),false);
});
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
