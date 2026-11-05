import {coveredSeconds,PRESENCE_SINCE,authenticatedPresence} from './presence.js';
export function formatWritingTime(seconds=0){
 const n=Math.max(0,Math.floor(Number(seconds)||0));
 return `${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
}
export function formatDuration(seconds=0){
 const n=Math.max(0,Math.floor(Number(seconds)||0)),days=Math.floor(n/86400);
 return (days?`${days} day${days===1?'':'s'} `:'')+formatWritingTime(n-days*86400);
}
export const utcMinute=t=>t?new Date(t).toISOString().replace('T',' ').slice(0,16):'';
const postRow=(p,m,u={})=>({postId:p.id,title:p.title,slug:p.slug||'',blogId:p.blogId||'',publishedAt:p.publishedAt||0,moduleId:m.id,moduleTitle:m.title,code:m.code||'',moduleLabel:m.code?`${m.code}: ${m.title}`:m.title,authorId:p.authorId,firstName:u.firstName||'',lastName:u.lastName||'',email:u.email||'',contactEmail:u.contactEmail||'',studentId:u.studentId||'',status:p.status});

// All report durations use the same creation-to-first-publication window.
// A session is a continuous run of content changes. Merge runs before counting seconds.
function mergeSpans(spans) {
 const merged = [];
 for (const span of spans.sort((a, b) => a.startedAt - b.startedAt)) {
  const previous = merged.at(-1);
  if (previous && span.startedAt <= previous.lastSeenAt) {
   previous.lastSeenAt = Math.max(previous.lastSeenAt, span.lastSeenAt);
  } else merged.push({...span});
 }
 return merged;
}

export function postAnalytics(post={}, sessions=[], now=Date.now(), presence=[]) {
 const startedAt = Number(post.createdAt) || 0;
 const publishedAt = Number(post.publishedAt) || 0;
 const endedAt = publishedAt || now;
 const placed = startedAt > 0 && endedAt >= startedAt;
 const elapsed = placed ? Math.floor((endedAt - startedAt) / 1000) : 0;
 const spans = [];
 let unplaced = 0;
 for (const session of sessions) {
  const start = Number(session.startedAt) || 0;
  const end = Number(session.lastActivityAt || session.endedAt || session.lastRecordedAt) || 0;
  const seconds = Math.max(0, Number(session.seconds) || 0);
  if (!start || end < start) { if (seconds) unplaced++; continue; }
  if (!placed || end < startedAt || start > endedAt) continue;
  // Old aggregate counters cannot locate edits within a sparse or interrupted visit.
  if (Math.abs((end - start) / 1000 - seconds) >= 1) { unplaced++; continue; }
  spans.push({startedAt: Math.max(startedAt, start), lastSeenAt: Math.min(endedAt, end)});
 }
 const merged = mergeSpans(spans);
 const recorded = placed && merged.length > 0 && unplaced === 0;
 const active = coveredSeconds(merged, startedAt, endedAt);
 const idle = elapsed - active;
 const utilisation = recorded && elapsed > 0 ? active / elapsed : null;
 const breakLines = [];
 for (let i = 1; i < merged.length; i++) {
  const from = merged[i - 1].lastSeenAt;
  const gap = Math.floor((merged[i].startedAt - from) / 1000);
  if (gap > 0) breakLines.push(`${formatDuration(gap)} · ${utcMinute(from)}`);
 }
 const visits = authenticatedPresence(presence.filter(v => v.lastSeenAt >= v.startedAt))
  .filter(v=>v.startedAt<=endedAt);
 // An uncovered interval is unknown unless its preceding presence interval ends
 // with a recorded sign-out. Never turn missing heartbeats into time away.
 const presenceSpans = mergeSpans([...visits, ...merged].map(v=>({startedAt:v.startedAt,lastSeenAt:v.lastSeenAt})));
 let cursor=startedAt, previousEnd=null, unknown=false;
 const awaySpans=[],unknownSpans=[];
 const signedOutAt = new Set(visits.filter(v=>v.signedOutAt===v.lastSeenAt).map(v=>v.signedOutAt));
 const gap=(from,to)=>{
  if(!(to>from))return;
  const span={startedAt:from,lastSeenAt:to};
  if(signedOutAt.has(previousEnd))awaySpans.push(span);
  else {unknown=true;unknownSpans.push(span);}
 };
 for(const span of presenceSpans) {
  if(span.lastSeenAt < startedAt) { previousEnd=span.lastSeenAt; continue; }
  if(span.startedAt > cursor && cursor < endedAt) gap(cursor,Math.min(span.startedAt,endedAt));
  cursor=Math.max(cursor,span.lastSeenAt);
  previousEnd=span.lastSeenAt;
 }
 if(cursor < endedAt) gap(cursor,endedAt);
 const presenceKnown = placed && startedAt >= PRESENCE_SINCE && !unknown;
 const present = coveredSeconds(presenceSpans, startedAt, endedAt);
 const away = coveredSeconds(awaySpans,startedAt,endedAt);
 return {
  createdAt: startedAt, lastPublishedAt: publishedAt, submittedAt: publishedAt,
  windowStart: startedAt, windowEnd: placed ? endedAt : 0, open: !publishedAt,
  recorded, elapsedSeconds: elapsed, elapsedTime: placed ? formatDuration(elapsed) : '', seconds: recorded ? active : '',
  writingTime: recorded ? formatWritingTime(active) : '',
  idleSeconds: recorded ? idle : '', idleTime: recorded ? formatDuration(idle) : '',
  presentSeconds: presenceKnown ? present : '', awaySeconds: presenceKnown ? away : '',
  awayTime: presenceKnown ? formatDuration(away) : '', utilisation,
  presenceLines:visits.filter(v=>v.lastSeenAt>=startedAt).map(v=>`${new Date(Math.max(startedAt,v.startedAt)).toISOString()} → ${new Date(Math.min(endedAt,v.lastSeenAt)).toISOString()}${v.signedOutAt&&v.signedOutAt<=endedAt?' · signed out':''}`),
  awayLines:awaySpans.map(v=>`${formatDuration((v.lastSeenAt-v.startedAt)/1000)} · ${new Date(v.startedAt).toISOString()} → ${new Date(v.lastSeenAt).toISOString()}`),
  unknownPresenceLines:unknownSpans.map(v=>`${new Date(v.startedAt).toISOString()} → ${new Date(v.lastSeenAt).toISOString()}`),
  utilisationLabel: utilisation === null ? '' : utilisation > 0 && utilisation < 0.005 ? '<1%' : `${Math.round(utilisation * 100)}%`,
  sessionCount: merged.length, untimedSessions: unplaced,
  sessionNote: unplaced ? 'Incomplete older timing records' : recorded ? '' : 'No session recorded',
  sessionLines: merged.map(s => `${formatWritingTime((s.lastSeenAt-s.startedAt)/1000)} · ${utcMinute(s.startedAt)}`),
  breakLines
 };
}

export function writingReport(posts=[],sessions=[],modules=[],users=[],now=Date.now(),presence=[]) {
 const allowed = new Map(modules.map(m => [m.id,m]));
 const people = new Map(users.map(u => [u.uid,u]));
 return posts.filter(p => allowed.has(p.moduleId)).map(p => {
  const own = sessions.filter(s => s.postId === p.id && s.uid === p.authorId && s.moduleId === p.moduleId);
  const visits = presence.filter(v => v.uid === p.authorId && (!v.moduleId || v.moduleId === p.moduleId));
  return {...postRow(p,allowed.get(p.moduleId),people.get(p.authorId)), ...postAnalytics(p,own,now,visits)};
 });
}

export function sessionHistoryReport(posts=[],sessions=[],modules=[],users=[]){
 const allowed=new Map(modules.map(m=>[m.id,m])),people=new Map(users.map(u=>[u.uid,u]));
 const postsById=new Map(posts.filter(p=>allowed.has(p.moduleId)).map(p=>[p.id,postRow(p,allowed.get(p.moduleId),people.get(p.authorId))]));
 return sessions.flatMap(s=>{const p=postsById.get(s.postId);if(!p||p.authorId!==s.uid||p.moduleId!==s.moduleId||(!s.lastActivityAt&&!s.seconds))return [];
  return [{...p,sessionId:s.id,startedAt:s.startedAt||0,lastActivityAt:s.lastActivityAt||0,lastRecordedAt:s.lastRecordedAt||0,endedAt:s.endedAt||0,endReason:s.lastActivityAt?(s.endReason||'checkpoint'):'legacy',seconds:s.seconds||0,writingTime:formatWritingTime(s.seconds)}];
 }).sort((a,b)=>b.startedAt-a.startedAt||a.sessionId.localeCompare(b.sessionId));
}

export function moduleWritingTotals(writing=[],memberships=[],modules=[],users=[]){
 const allowed=new Map(modules.map(m=>[m.id,m])),people=new Map(users.map(u=>[u.uid,u])),rows=new Map(),seen=new Set();
 const ensure=(uid,moduleId,details={})=>{const m=allowed.get(moduleId),u=people.get(uid)||{};if(!m)return null;
  const key=moduleId+':'+uid;if(!rows.has(key))rows.set(key,{authorId:uid,moduleId,moduleTitle:m.title,code:m.code||'',academicYear:m.academicYear||'',firstName:details.firstName||u.firstName||'',lastName:details.lastName||u.lastName||'',email:details.email||u.email||'',contactEmail:details.contactEmail||u.contactEmail||'',studentId:details.studentId||u.studentId||'',affiliation:details.affiliation||u.affiliation||'',postCount:0,seconds:0});return rows.get(key);};
 for(const member of memberships)if(!['teacher','instructor'].includes(member.registrationKind))ensure(member.uid,member.moduleId,member);
 for(const p of writing){if(!allowed.has(p.moduleId))continue;const key=p.moduleId+':'+p.authorId,postKey=p.moduleId+':'+p.postId;
  if(seen.has(postKey))continue;seen.add(postKey);
  const m=allowed.get(p.moduleId),u=people.get(p.authorId)||{};
  if(!rows.has(key)&&(['lecturer','admin'].includes(u.role)||m.teacherIds?.includes(p.authorId)))continue;
  const r=ensure(p.authorId,p.moduleId,p);r.postCount++;if(p.seconds==='')r.incomplete=true;r.seconds+=Math.max(0,Number(p.seconds)||0);
 }
 return [...rows.values()].map(r=>({...r,seconds:r.incomplete?'':r.seconds,writingTime:r.incomplete?'Incomplete records':formatWritingTime(r.seconds)})).sort((a,b)=>[a.moduleTitle,a.lastName,a.firstName,a.authorId].join(' ').localeCompare([b.moduleTitle,b.lastName,b.firstName,b.authorId].join(' ')));
}

// Count only intervals bounded by actual changes, never a tail after the last edit.
export class EditingActivityClock {
 constructor(idleMs=2000) { this.idleMs=idleMs; this.seconds=0; this.previous=null; this.deadline=0; }
 sample(now,eligible=true) { if (!eligible || now > this.deadline) this.previous=null; return this.seconds; }
 activity(now,eligible=true) {
  if (!eligible) { this.pause(); return; }
  if (this.previous !== null && now >= this.previous && now-this.previous <= this.idleMs) this.seconds += (now-this.previous)/1000;
  this.previous=now;
  this.deadline=now+this.idleMs;
 }
 pause() { this.previous=null; this.deadline=0; }
 active(now) { return this.previous !== null && now <= this.deadline; }
}

export class WritingSessionHistory {
 constructor({uid,postId,moduleId,newId=()=>crypto.randomUUID(),onSession=()=>{}}) {
  Object.assign(this,{uid,postId,moduleId,newId,onSession});
  this.clock=new EditingActivityClock(); this.current=null;
 }
 sample(now,wall,eligible=true,reason='away') {
  this.clock.sample(now,eligible);
  if (this.current && !this.clock.active(now)) this.close(eligible?'inactive':reason);
 }
 activity(now,wall) {
  this.sample(now,wall);
  if (!this.current) {
   this.current={id:this.newId(),uid:this.uid,postId:this.postId,moduleId:this.moduleId,seconds:0,startedAt:wall,lastActivityAt:wall,lastRecordedAt:wall};
   this.onSession(this.current);
  }
  this.clock.activity(now);
  this.current.lastActivityAt=Math.max(wall,this.current.lastActivityAt);
  this.current.lastRecordedAt=this.current.lastActivityAt;
  this.current.seconds=Math.floor((this.current.lastActivityAt-this.current.startedAt)/1000);
 }
 close(reason) {
  if (!this.current) return;
  this.current.endedAt=this.current.lastRecordedAt;
  this.current.endReason=reason;
  this.current=null;
  this.clock.pause();
 }
 pause(now,wall,reason='away') { this.close(reason); this.clock.pause(); }
}

// New session records are write-only for students; history is read by staff only.
export function startWritingTimer({uid,postId,moduleId,store,baseSeconds=0,onTick=()=>{},isEditing=()=>true}){
 const instanceId=crypto.randomUUID(),prefix=`ucd-writing-history:${uid}:${postId}`,key=`${prefix}:${instanceId}`,pending=new Map();
 // Each editor instance keeps its own local copy of unsent rows. Rows left behind by earlier instances of this
 // post (a closed tab, a crash) are adopted only once this instance holds the writing lock: while another tab
 // is live its open session must stay its own, or the server copy would be frozen with the wrong end.
 const adopt=()=>{for(const k of Object.keys(localStorage)){if((k!==prefix&&!k.startsWith(prefix+':'))||k===key)continue;try{for(const r of JSON.parse(localStorage.getItem(k)||'[]')){if(pending.has(r.id))continue;if(!r.endedAt){r.endedAt=r.lastRecordedAt||r.lastActivityAt||r.startedAt;r.endReason='interrupted';}pending.set(r.id,r);}}catch{}try{localStorage.removeItem(k);}catch{}}};
 const history=new WritingSessionHistory({uid,postId,moduleId,onSession:r=>pending.set(r.id,r)});
 history.clock.previous=performance.now();
 let stopped=false,busy=false,owned=false,release,claiming=false,error=false,needsFlush=false;
 const stash=()=>{try{if(pending.size)localStorage.setItem(key,JSON.stringify([...pending.values()]));else localStorage.removeItem(key);}catch{}};
 const total=()=>baseSeconds+Math.floor(history.clock.seconds);
 const show=()=>onTick(total(),error);
 const eligible=()=>!stopped&&document.visibilityState==='visible'&&document.hasFocus()&&isEditing();
 const unlock=()=>{owned=false;release?.();release=null;};
 const sample=()=>{history.sample(performance.now(),Date.now(),owned&&eligible(),isEditing()?'away':'preview');stash();if(!history.current)unlock();show();};
 async function flush(){
  if(busy){needsFlush=true;return;}busy=true;error=false;
  try{for(const [id,r] of [...pending]){const snapshot={...r};try{await store.saveWritingHistory(snapshot);if(history.current?.id!==id&&JSON.stringify(r)===JSON.stringify(snapshot))pending.delete(id);}catch(e){if(e?.code==='permission-denied'&&r.endedAt)pending.delete(id);else error=true;}}stash();}finally{busy=false;show();if(needsFlush){needsFlush=false;void flush();}}
 }
 const leaseKey=`ucd-writing-lock:${uid}`;
 function claim(){
  if(owned||claiming||!eligible())return;
  const acquired=()=>{owned=true;adopt();history.activity(performance.now(),Date.now());stash();void flush();};
  if(navigator.locks){claiming=true;navigator.locks.request(`ucd-writing-${uid}`,{ifAvailable:true},lock=>{claiming=false;if(!lock||!eligible())return;acquired();return new Promise(r=>{release=r;});}).catch(()=>{claiming=false;});}
  else try{const lease=JSON.parse(localStorage.getItem(leaseKey)||'null');if(!lease||lease.id===instanceId||lease.until<Date.now()){localStorage.setItem(leaseKey,JSON.stringify({id:instanceId,until:Date.now()+2500}));acquired();release=()=>{try{if(JSON.parse(localStorage.getItem(leaseKey)||'null')?.id===instanceId)localStorage.removeItem(leaseKey);}catch{}};}}catch{}
 }
 function activity() {
  if (!eligible()) return;
  sample();
  if (owned) history.activity(performance.now(),Date.now()); else claim();
  stash();
 }
 const leaseTimer=setInterval(()=>{if(!navigator.locks&&owned)try{localStorage.setItem(leaseKey,JSON.stringify({id:instanceId,until:Date.now()+2500}));}catch{}},1000);
 const tick=setInterval(sample,1000),sync=setInterval(flush,15000);
 const pause=()=>{history.pause(performance.now(),Date.now(),'away');sample();unlock();void flush();};
 document.addEventListener('visibilitychange',pause);addEventListener('blur',pause);

 void flush();show();
 return {activity,pause,sample,flush,total,stop(){if(stopped)return;history.pause(performance.now(),Date.now(),'left');stopped=true;clearInterval(tick);clearInterval(sync);clearInterval(leaseTimer);document.removeEventListener('visibilitychange',pause);removeEventListener('blur',pause);stash();unlock();void flush();}};
}
