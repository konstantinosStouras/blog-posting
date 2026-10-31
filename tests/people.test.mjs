import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {buildPeopleReport,filterPeopleReport} from '../people-model.js';
import {createRosterWorkbook} from '../roster-export.js';
const report=()=>buildPeopleReport({modules:[{id:'one',title:'Module one'}],memberships:[{uid:'student',moduleId:'one',firstName:'=Example',studentId:'00123',contactEmail:'student@university.ie',inviteId:'accepted'},{uid:'other',moduleId:'two',studentId:'private'}],studentInvites:[{id:'pending',moduleId:'one',recipientEmail:'pending@university.ie',expiresAt:9999999999999},{id:'accepted',moduleId:'one',recipientEmail:'student@university.ie',expiresAt:9999999999999},{id:'private',moduleId:'two'}]});
test('module report excludes other modules and preserves pending invitation details',()=>{
 const r=report();assert.equal(r.users.length,1);assert.equal(r.invitations.length,2);assert.equal(r.invitations[0].studentId,'');assert.equal(r.invitations[1].studentId,'00123');assert.equal(filterPeopleReport(r,'','pending').invitations.length,1);
});
test('Excel download round trip keeps bold headers, normal body and text IDs',async()=>{
 const book=createRosterWorkbook(ExcelJS,report());const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await book.xlsx.writeBuffer());
 const ws=loaded.getWorksheet('Users');assert.equal(ws.getCell('A1').font.bold,true);assert.equal(Boolean(ws.getCell('A2').font.bold),false);assert.equal(ws.getCell('A2').value,'=Example');assert.equal(ws.getCell('F2').value,'00123');assert.equal(ws.views[0].ySplit,1);assert.equal(loaded.getWorksheet('Instructor invitations'),undefined);
});
