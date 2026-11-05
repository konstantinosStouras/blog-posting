import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {formatWritingTime,formatDuration,postAnalytics,writingReport,sessionHistoryReport,moduleWritingTotals,EditingActivityClock,WritingSessionHistory} from '../writing-time.js';
import {coveredSeconds,startPresence,PRESENCE_SINCE} from '../presence.js';
test('time away counts a recorded sign-out between signed-in visits',async()=>{
 const H=3600000,created=PRESENCE_SINCE+9*H;
 assert.equal(coveredSeconds([{startedAt:created,lastSeenAt:created+H},{startedAt:created+0.5*H,lastSeenAt:created+2*H},{startedAt:created+5*H,lastSeenAt:created+9*H}],created,created+4*H),7200);
 assert.equal(coveredSeconds([],created,created+H),0);
 const visits=[{uid:'a',moduleId:'m',startedAt:created-H,lastSeenAt:created+H,signedOutAt:created+H},{uid:'a',moduleId:'m',startedAt:created+3*H,lastSeenAt:created+5*H},{uid:'b',moduleId:'m',startedAt:created,lastSeenAt:created+4*H},{uid:'a',moduleId:'other',startedAt:created+2*H,lastSeenAt:created+3*H}];
 const row=writingReport([{id:'p',moduleId:'m',authorId:'a',title:'Post',createdAt:created,status:'published',publishedAt:created+4*H}],[{postId:'p',moduleId:'m',uid:'a',seconds:600,startedAt:created,endedAt:created+600000}],[{id:'m',title:'Module'}],[],created+10*H,visits)[0];
 assert.equal(row.elapsedSeconds,14400);assert.equal(row.presentSeconds,7200);assert.equal(row.awaySeconds,7200);assert.equal(row.awayTime,'2:00:00');assert.equal(row.idleTime,'3:50:00');assert.equal(row.utilisationLabel,'4%');
 const admin=writingReport([{id:'q',moduleId:'m',authorId:'k',title:'Admin post',createdAt:created,status:'published',publishedAt:created+H}],[],[{id:'m',title:'Module'}],[],created+2*H,[{uid:'k',moduleId:'',startedAt:created,lastSeenAt:created+H}])[0];
 assert.equal(admin.awaySeconds,0);assert.equal(admin.awayTime,'0:00:00');assert.equal(admin.sessionNote,'No session recorded');
 const before=postAnalytics({createdAt:PRESENCE_SINCE-H,status:'published',publishedAt:PRESENCE_SINCE+H},[],PRESENCE_SINCE+2*H,[{startedAt:PRESENCE_SINCE,lastSeenAt:PRESENCE_SINCE+H}]);
 assert.equal(before.awayTime,'');assert.equal(before.awaySeconds,'');
 // the heartbeat: one row per module of the account, the same id each beat so only lastSeenAt moves
 const saved=[];let t=created;const beat=startPresence({uid:'a',modules:()=>['m','n'],save:async r=>{saved.push({...r});},now:()=>t,newId:()=>'visit',intervalMs:1e9,doc:null});
 await new Promise(r=>setTimeout(r,0));t+=60000;await beat.beat();beat.stop();
 assert.deepEqual(saved.map(r=>r.id),['visit:m','visit:n','visit:m','visit:n']);assert.equal(saved[0].startedAt,created);assert.equal(saved[0].lastSeenAt,created);assert.equal(saved[2].lastSeenAt,created+60000);assert.equal(saved[2].startedAt,created);
 const adminBeat=startPresence({uid:'k',modules:()=>[''],save:async r=>{saved.push({...r});},now:()=>t,newId:()=>'v2',intervalMs:1e9,doc:null});await new Promise(r=>setTimeout(r,0));adminBeat.stop();
 assert.deepEqual(saved.at(-1),{id:'v2:site',uid:'k',moduleId:'',startedAt:t,lastSeenAt:t});
});
test('student module totals sum all posts, keep modules separate and include zero-post students',async()=>{
 const posts=[{postId:'a',moduleId:'one',authorId:'student',seconds:3600},{postId:'b',moduleId:'one',authorId:'student',seconds:6612},{postId:'c',moduleId:'two',authorId:'student',seconds:3},{postId:'private',moduleId:'other',authorId:'student',seconds:9999},{postId:'teacher',moduleId:'one',authorId:'teacher',seconds:20}];
 const memberships=[{uid:'student',moduleId:'one',studentId:'00123'},{uid:'student',moduleId:'two',studentId:'00123'},{uid:'zero',moduleId:'one'},{uid:'secret',moduleId:'other'}];
 const rows=moduleWritingTotals([...posts,posts[0]],memberships,[{id:'one',title:'One',code:'ONE',teacherIds:['teacher']},{id:'two',title:'Two'}],[{uid:'teacher',role:'lecturer'}]);
 assert.equal(rows.length,3);const one=rows.find(r=>r.authorId==='student'&&r.moduleId==='one');assert.equal(one.writingTime,'2:50:12');assert.equal(one.postCount,2);assert.equal(rows.find(r=>r.moduleId==='two').seconds,3);assert.equal(rows.find(r=>r.authorId==='zero').seconds,0);
 const book=createRosterWorkbook(ExcelJS,{users:[],invitations:[],moduleTotals:[one]});const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await book.xlsx.writeBuffer());const s=loaded.getWorksheet('Student module totals');assert.equal(s.getCell('K2').value,'2:50:12');assert.equal(s.getCell('H2').value,'00123');assert.equal(s.getCell('K1').font.bold,true);assert.equal(Boolean(s.getCell('K2').font.bold),false);
});
test('history ends at the last actual edit and splits pauses',()=>{
 const rows=[]; let id=0;
 const h=new WritingSessionHistory({uid:'a',postId:'p',moduleId:'m',newId:()=>String(++id),onSession:r=>rows.push(r)});
 h.activity(1000,100000);
 h.activity(2000,101000);
 h.activity(3000,102000);
 h.sample(32000,131000);
 assert.equal(rows.length,1);
 assert.equal(rows[0].seconds,2);
 assert.equal(rows[0].endedAt,102000);
 assert.equal(rows[0].endReason,'inactive');
 h.activity(60000,159000);
 h.activity(61000,160000);
 h.pause(62000,161000,'left');
 assert.equal(rows[1].seconds,1);
 assert.equal(rows[1].endedAt,160000);
});

test('history report limits scope, preserves legacy gaps and exports session timestamps',async()=>{
 const sessions=sessionHistoryReport([{id:'p',moduleId:'m',authorId:'a',title:'Post'},{id:'private',moduleId:'other',authorId:'a'}],[{id:'old',postId:'p',moduleId:'m',uid:'a',seconds:12,startedAt:1000},{id:'new',postId:'p',moduleId:'m',uid:'a',seconds:4,startedAt:10000,lastActivityAt:11000,lastRecordedAt:14000,endedAt:14000,endReason:'left'},{id:'secret',postId:'private',moduleId:'other',uid:'a',seconds:999}],[{id:'m',title:'Module'}],[{uid:'a',studentId:'00123'}]);
 assert.equal(sessions.length,2);assert.equal(sessions[1].lastRecordedAt,0);assert.equal(sessions[1].endReason,'legacy');assert.equal(sessions[0].writingTime,'0:00:04');
 const w=createRosterWorkbook(ExcelJS,{users:[],invitations:[],sessions});const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await w.xlsx.writeBuffer());const sheet=loaded.getWorksheet('Writing sessions');assert.equal(sheet.getCell('G2').value,'1970-01-01 00:00:10');assert.equal(sheet.getCell('K2').value,'0:00:04');assert.equal(sheet.getCell('F2').value,'00123');assert.equal(sheet.getCell('G1').font.bold,true);assert.equal(Boolean(sheet.getCell('G2').font.bold),false);
});
test('sampling cannot add time without further content changes',()=>{
 const c=new EditingActivityClock();
 c.sample(5000); c.activity(5000);
 for(let t=6000;t<=40000;t+=1000)c.sample(t);
 assert.equal(c.seconds,0);
 c.activity(40000); c.activity(41000); c.sample(42000);
 assert.equal(c.seconds,1);
});

test('leaving the editor prevents a subsequent edit from bridging the gap',()=>{
 const c=new EditingActivityClock();
 c.activity(1000); c.activity(2000); c.pause(2000); c.sample(60000);
 assert.equal(c.seconds,1);
 c.activity(60000); c.activity(61000); c.sample(62000,false); c.activity(63000);
 assert.equal(c.seconds,2);
});
import {compareTableValues} from '../sortable-tables.js';
import {createRosterWorkbook} from '../roster-export.js';

test('writing time formats hours without wrapping after a day',()=>{assert.equal(formatWritingTime(10212),'2:50:12');assert.equal(formatWritingTime(90061),'25:01:01');assert.equal(formatWritingTime(), '0:00:00');});
test('writing report sums only the author and assigned module sessions',()=>{
 const r=writingReport([{id:'p',moduleId:'m',authorId:'a',title:'Post'},{id:'private',moduleId:'other'}],[{postId:'p',moduleId:'m',uid:'a',seconds:100},{postId:'p',moduleId:'m',uid:'a',seconds:12},{postId:'p',moduleId:'m',uid:'other',seconds:999}],[{id:'m',title:'Module'}],[{uid:'a',studentId:'00123'}]);assert.equal(r.length,1);assert.equal(r[0].writingTime,'');assert.equal(r[0].sessionNote,'Incomplete older timing records');assert.equal(r[0].studentId,'00123');
});
test('sort compares numerical values, natural text and blanks',()=>{assert.ok(compareTableValues(2,10)<0);assert.ok(compareTableValues('Module 2','Module 10')<0);assert.ok(compareTableValues('',1)>0);});
test('Excel includes per-post analytics with bold heading and normal body',async()=>{
 const book=createRosterWorkbook(ExcelJS,{users:[],invitations:[],writing:[{title:'Post',writingTime:'2:50:12',seconds:10212,studentId:'00123',open:true,status:'pending',idleTime:'1 day 0:00:00',awayTime:'20:00:00',awaySeconds:72000,utilisationLabel:'11%',sessionLines:['2:50:12 · 2026-11-01 09:00'],breakLines:[]}]});const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await book.xlsx.writeBuffer());const sheet=loaded.getWorksheet('Blog posting analytics');
 assert.equal(sheet.getCell('K2').value,'2:50:12');assert.equal(sheet.getCell('J2').value,'awaiting review');assert.equal(sheet.getCell('M2').value,'1 day 0:00:00');assert.equal(sheet.getCell('O1').value,'Time away (estimated)');assert.equal(sheet.getCell('O2').value,'20:00:00');assert.equal(String(sheet.getCell('P2').value),'72000');assert.equal(sheet.getCell('Q2').value,'11%');assert.equal(sheet.getCell('R2').value,'2:50:12 · 2026-11-01 09:00');assert.equal(sheet.getCell('K1').font.bold,true);assert.equal(Boolean(sheet.getCell('K2').font.bold),false);
});

test('first publication fixes the window even after updates and later sessions',()=>{
 const t=PRESENCE_SINCE+86400000, sec=1000;
 const post={createdAt:t,publishedAt:t+60*sec,updatedAt:t+3600*sec,status:'published'};
 const sessions=[{startedAt:t-10*sec,endedAt:t+70*sec,seconds:80},{startedAt:t+80*sec,endedAt:t+90*sec,seconds:10}];
 const r=postAnalytics(post,sessions);
 assert.equal(r.windowStart,t); assert.equal(r.windowEnd,t+60000);
 assert.equal(r.elapsedSeconds,60); assert.equal(r.seconds,60);
 assert.equal(r.idleSeconds,0); assert.equal(r.utilisation,1);
 assert.equal(r.lastPublishedAt,post.publishedAt);
 assert.equal(r.awaySeconds,0); // editing itself establishes signed-in presence
});

test('nested overlapping sessions neither double count nor invent breaks',()=>{
 const t=PRESENCE_SINCE+86400000;
 const r=postAnalytics({createdAt:t,publishedAt:t+60000},[[0,50],[10,20],[40,60]].map(([a,b])=>({startedAt:t+a*1000,endedAt:t+b*1000,seconds:b-a})));
 assert.equal(r.seconds,60); assert.equal(r.idleSeconds,0);
 assert.equal(r.sessionCount,1); assert.deepEqual(r.breakLines,[]);
});

test('idle includes leading, trailing and inter-session gaps',()=>{
 const t=PRESENCE_SINCE+86400000;
 const r=postAnalytics({createdAt:t,publishedAt:t+60000},[[5,15],[45,55]].map(([a,b])=>({startedAt:t+a*1000,endedAt:t+b*1000,seconds:b-a})));
 assert.equal(r.seconds,20); assert.equal(r.idleSeconds,40);
 assert.equal(r.utilisation,1/3); assert.equal(r.breakLines.length,1);
 assert.ok(r.breakLines[0].startsWith('0:00:30'));
 assert.equal(r.awaySeconds,''); // no presence baseline
});

test('pending posts run to now and missing or sparse data stays unknown',()=>{
 const t=PRESENCE_SINCE+86400000;
 const post={createdAt:t,status:'pending',updatedAt:t+10000};
 const r=postAnalytics(post,[],t+60000);
 assert.equal(r.elapsedSeconds,60); assert.equal(r.utilisation,null);
 assert.equal(r.idleSeconds,''); assert.equal(r.awaySeconds,'');
 const sparse=postAnalytics(post,[{startedAt:t,endedAt:t+60000,seconds:10}],t+60000);
 assert.equal(sparse.utilisation,null);
 assert.equal(sparse.sessionNote,'Incomplete older timing records');
});

test('editing supplies presence even when a heartbeat ends before publication',()=>{
 const t=PRESENCE_SINCE+86400000;
 const r=postAnalytics({createdAt:t,publishedAt:t+60000},[{startedAt:t+30000,endedAt:t+60000,seconds:30}],t+60000,[{startedAt:t,lastSeenAt:t+10000}]);
 assert.equal(r.seconds,30); assert.equal(r.idleSeconds,30);
 assert.equal(r.presentSeconds,''); assert.equal(r.awaySeconds,'');
});

test('heartbeat delays do not turn a still signed-in visit into time away',async()=>{
 let t=PRESENCE_SINCE+86400000, id=0;
 const rows=new Map();
 const tracker=startPresence({uid:'a',modules:()=>['m'],save:async row=>rows.set(row.id,{...row}),now:()=>t,newId:()=>String(++id),intervalMs:60000,doc:null,win:null});
 try {
  await tracker.beat();
  t+=60000; await tracker.beat();
  t+=3600000; await tracker.beat();
  assert.equal(rows.size,1);
  assert.equal(coveredSeconds([...rows.values()],t-3660000,t),3660);
 } finally { await tracker.stop(); }
});

test('clipped union preserves active plus idle equals elapsed for overlapping inputs',()=>{
 const t=PRESENCE_SINCE+86400000;
 for(let offset=-20;offset<=80;offset+=5) {
  const sessions=[{startedAt:t+offset*1000,endedAt:t+(offset+20)*1000,seconds:20},{startedAt:t+10000,endedAt:t+30000,seconds:20}];
  const r=postAnalytics({createdAt:t,publishedAt:t+60000},sessions);
  assert.equal(r.seconds+r.idleSeconds,60);
  assert.ok(r.seconds>=0&&r.seconds<=60);
  assert.equal(r.utilisation,r.seconds/60);
 }
});

test('presence flush finishes within its deadline when a write cannot complete',async()=>{
 const tracker=startPresence({uid:'a',modules:()=>['m'],save:()=>new Promise(()=>{}),intervalMs:1e9,doc:null,win:null});
 await tracker.flush(10);
 tracker.stop();
});

test('explicit sign-out closes presence and subsequent beats cannot reopen it',async()=>{
 let t=PRESENCE_SINCE+86400000;
 const rows=new Map();
 const tracker=startPresence({uid:'a',modules:()=>['m'],save:async r=>rows.set(r.id,{...r}),now:()=>t,newId:()=>'visit',intervalMs:1e9,doc:null,win:null});
 try {
  await tracker.beat();t+=20000;await tracker.signOut();t+=20000;await tracker.beat();
  const row=[...rows.values()][0];assert.equal(row.signedOutAt,t-20000);assert.equal(row.lastSeenAt,row.signedOutAt);
  const result=postAnalytics({createdAt:t-40000,publishedAt:t+20000},[],t,[row,{startedAt:t,lastSeenAt:t+20000}]);
  assert.equal(result.awaySeconds,20);
 } finally { await tracker.stop(); }
});

test('reloads, delayed login initialisation and late tab heartbeats preserve the actual away interval',()=>{
 const t=PRESENCE_SINCE+86400000,post={createdAt:t+5000,publishedAt:t+80000};
 const visits=[
  {uid:'a',authStartedAt:t,startedAt:t+1000,lastSeenAt:t+20000},
  {uid:'a',authStartedAt:t,startedAt:t+25000,lastSeenAt:t+40000,signedOutAt:t+40000},
  {uid:'a',authStartedAt:t,startedAt:t+2000,lastSeenAt:t+60000}, // another tab, stale heartbeat after sign-out
  {uid:'a',authStartedAt:t+50000,startedAt:t+55000,lastSeenAt:t+65000},
  {uid:'a',authStartedAt:t+50000,startedAt:t+70000,lastSeenAt:t+81000}
 ];
 const result=postAnalytics(post,[],t,visits);
 assert.equal(result.awaySeconds,10);assert.equal(result.presentSeconds,65);
 assert.equal(result.unknownPresenceLines.length,0);assert.equal(result.awayLines.length,1);
 const otherDevice={uid:'a',authStartedAt:t+1000,startedAt:t+1000,lastSeenAt:t+81000};
 assert.equal(postAnalytics(post,[],t,[...visits,otherDevice]).awaySeconds,0);
});

test('sign-out awaits acknowledgement and surfaces a failed write so authentication is not lost',async()=>{
 let acknowledge, rejectWrite, fail=false, t=PRESENCE_SINCE+86400000;
 const tracker=startPresence({uid:'a',authStartedAt:t,modules:()=>['m'],save:r=>r.signedOutAt?new Promise((resolve,reject)=>{acknowledge=resolve;rejectWrite=reject;}):Promise.resolve(),now:()=>t,intervalMs:1e9,doc:null,win:null});
 try {
  await tracker.beat();t+=5000;
  const first=tracker.signOut();await Promise.resolve();await Promise.resolve();
  rejectWrite(new Error('network failure'));
  await assert.rejects(first,/Could not record sign-out/);
  let complete=false;const retry=tracker.signOut().then(()=>{complete=true;});
  await Promise.resolve();await Promise.resolve();assert.equal(complete,false);
  acknowledge();await retry;assert.equal(complete,true);
 } finally {await tracker.stop();}
});

test('legacy missing heartbeat gaps stay unknown, including the live 37 second regression',()=>{
 const t=PRESENCE_SINCE+86400000,post={createdAt:t,publishedAt:t+479000};
 const r=postAnalytics(post,[],t,[{startedAt:t,lastSeenAt:t+200000},{startedAt:t+237000,lastSeenAt:t+479000}]);
 assert.equal(r.awaySeconds,'');assert.equal(r.awayTime,'');
 const continuous=postAnalytics(post,[],t,[{startedAt:t,lastSeenAt:t+479000}]);
 assert.equal(continuous.awaySeconds,0);
});

test('other signed-in tabs cover a sign-out, while unexplained later gaps remain unknown',()=>{
 const t=PRESENCE_SINCE+86400000,post={createdAt:t,publishedAt:t+60000};
 const signedOut={startedAt:t,lastSeenAt:t+20000,signedOutAt:t+20000};
 assert.equal(postAnalytics(post,[],t,[signedOut,{startedAt:t+10000,lastSeenAt:t+60000}]).awaySeconds,0);
 assert.equal(postAnalytics(post,[],t,[signedOut,{startedAt:t+10000,lastSeenAt:t+30000}]).awaySeconds,'');
 assert.equal(postAnalytics(post,[],t,[{startedAt:t+10000,lastSeenAt:t+60000}]).awaySeconds,'');
});

test('browser timer records content changes and excludes a details-form pause',async()=>{
 const {startWritingTimer}=await import('../writing-time.js');
 const names=['document','navigator','localStorage','performance','addEventListener','removeEventListener','setInterval','clearInterval'];
 const saved=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const originalNow=Date.now;
 let t=1000, editing=true;
 const rows=new Map(), storage=new Map();
 try {
  const globals={
   document:{visibilityState:'visible',hasFocus:()=>true,addEventListener(){},removeEventListener(){}},
   navigator:{},
   localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
   performance:{now:()=>t},addEventListener(){},removeEventListener(){},setInterval:()=>0,clearInterval(){}
  };
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,value});
  Date.now=()=>PRESENCE_SINCE+86400000+t;
  const timer=startWritingTimer({uid:'a',postId:'p',moduleId:'m',isEditing:()=>editing,store:{saveWritingHistory:async row=>rows.set(row.id,{...row})}});
  timer.activity();
  await timer.flush();
  t+=1000; timer.activity();
  timer.pause();
  editing=false; t+=30000; timer.activity(); timer.sample();
  await timer.flush();
  timer.stop();
  await timer.flush();
  assert.equal(rows.size,1);
  const row=[...rows.values()][0];
  assert.equal(row.seconds,1);
  assert.equal(row.endedAt-row.startedAt,1000);
 } finally {
  Date.now=originalNow;
  for(const [name,descriptor] of saved) {
   if(descriptor)Object.defineProperty(globalThis,name,descriptor);
   else delete globalThis[name];
  }
 }
});
