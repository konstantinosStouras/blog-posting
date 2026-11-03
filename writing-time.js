export function formatWritingTime(seconds=0){
 const n=Math.max(0,Math.floor(Number(seconds)||0));
 return `${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
}
export function formatDuration(seconds=0){
 const n=Math.max(0,Math.floor(Number(seconds)||0)),days=Math.floor(n/86400);
 return (days?`${days} day${days===1?'':'s'} `:'')+formatWritingTime(n-days*86400);
}
export const utcMinute=t=>t?new Date(t).toISOString().replace('T',' ').slice(0,16):'';
const postRow=(p,m,u={})=>({postId:p.id,title:p.title,moduleId:m.id,moduleTitle:m.title,authorId:p.authorId,firstName:u.firstName||'',lastName:u.lastName||'',email:u.email||'',contactEmail:u.contactEmail||'',studentId:u.studentId||'',status:p.status});

// How a post's recorded work sits in calendar time. The window runs from the post's creation (or its first
// recorded session, if earlier) to its submission — publication, or the last save of a post awaiting review —
// extended by any session recorded after that; a draft's window is still open and is measured up to `now`.
// Active time is the sum of the sessions, idle time the rest of the window (so the gaps before the first and
// after the last session count too) and utilisation their ratio. Sessions, and the breaks between consecutive
// sessions, are listed oldest first in UTC. Legacy visits without timestamps count towards active time but
// cannot be placed, so they appear in neither list.
export function postAnalytics(post={},sessions=[],now=Date.now()){
 const active=sessions.reduce((n,s)=>n+Math.max(0,Number(s.seconds)||0),0);
 const timed=sessions.filter(s=>s.startedAt>0).sort((a,b)=>a.startedAt-b.startedAt);
 const endOf=s=>Math.max(s.startedAt,s.endedAt||0,s.lastRecordedAt||0,s.lastActivityAt||0);
 const submittedAt=post.status==='published'?post.publishedAt||post.updatedAt||0:post.status==='pending'?post.updatedAt||0:0;
 const startedAt=Math.min(...[post.createdAt,timed[0]?.startedAt].filter(t=>t>0));
 const placed=Number.isFinite(startedAt),open=!submittedAt;
 const endedAt=open?now:Math.max(submittedAt,timed.length?endOf(timed[timed.length-1]):0);
 const elapsed=placed?Math.max(0,Math.floor((endedAt-startedAt)/1000)):0;
 const idle=Math.max(0,elapsed-active),utilisation=elapsed>0?Math.min(1,active/elapsed):null;
 const breakLines=[];
 for(let i=1;i<timed.length;i++){const from=endOf(timed[i-1]),gap=Math.floor((timed[i].startedAt-from)/1000);if(gap>0)breakLines.push(`${formatDuration(gap)} · ${utcMinute(from)}`);}
 return {createdAt:post.createdAt||0,submittedAt,windowStart:placed?startedAt:0,windowEnd:placed?endedAt:0,open,elapsedSeconds:elapsed,idleSeconds:idle,idleTime:formatDuration(idle),utilisation,utilisationLabel:utilisation===null?'':utilisation>0&&utilisation<0.005?'<1%':`${Math.round(utilisation*100)}%`,sessionCount:timed.length,untimedSessions:sessions.length-timed.length,sessionLines:timed.map(s=>`${formatWritingTime(s.seconds)} · ${utcMinute(s.startedAt)}`),breakLines};
}

export function writingReport(posts=[],sessions=[],modules=[],users=[],now=Date.now()){
 const allowed=new Map(modules.map(m=>[m.id,m])),people=new Map(users.map(u=>[u.uid,u]));
 return posts.filter(p=>allowed.has(p.moduleId)).map(p=>{
  const own=sessions.filter(s=>s.postId===p.id&&s.uid===p.authorId&&s.moduleId===p.moduleId);
  const seconds=own.reduce((n,s)=>n+Math.max(0,Number(s.seconds)||0),0);
  return {...postRow(p,allowed.get(p.moduleId),people.get(p.authorId)),seconds,writingTime:formatWritingTime(seconds),...postAnalytics(p,own,now)};
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
  const r=ensure(p.authorId,p.moduleId,p);r.postCount++;r.seconds+=Math.max(0,Number(p.seconds)||0);
 }
 return [...rows.values()].map(r=>({...r,writingTime:formatWritingTime(r.seconds)})).sort((a,b)=>[a.moduleTitle,a.lastName,a.firstName,a.authorId].join(' ').localeCompare([b.moduleTitle,b.lastName,b.firstName,b.authorId].join(' ')));
}

export class EditingActivityClock {
 constructor(idleMs=30000){this.idleMs=idleMs;this.seconds=0;this.previous=0;this.deadline=0;}
 sample(now,eligible=true){const end=Math.min(now,this.deadline);if(eligible&&end>this.previous)this.seconds+=Math.min(2000,end-this.previous)/1000;this.previous=now;if(!eligible)this.deadline=0;return this.seconds;}
 activity(now,eligible=true){this.sample(now,eligible);if(eligible)this.deadline=now+this.idleMs;}
 pause(now){this.sample(now);this.deadline=0;}
 active(now){return now<this.deadline;}
}

export class WritingSessionHistory {
 constructor({uid,postId,moduleId,newId=()=>crypto.randomUUID(),onSession=()=>{}}){Object.assign(this,{uid,postId,moduleId,newId,onSession});this.clock=new EditingActivityClock();this.current=null;this.base=0;}
 sample(now,wall,eligible=true,reason='away'){
  this.clock.sample(now,eligible);
  if(this.current){this.current.seconds=Math.floor(this.clock.seconds-this.base);this.current.lastRecordedAt=Math.min(wall,this.current.lastActivityAt+30000);
   if(!this.clock.active(now))this.close(eligible?'inactive':reason);}
 }
 activity(now,wall){
  this.sample(now,wall);if(!this.current){this.base=this.clock.seconds;this.current={id:this.newId(),uid:this.uid,postId:this.postId,moduleId:this.moduleId,seconds:0,startedAt:wall,lastActivityAt:wall,lastRecordedAt:wall};this.onSession(this.current);}
  this.clock.activity(now);this.current.lastActivityAt=wall;this.current.lastRecordedAt=wall;
 }
 close(reason){if(!this.current)return;this.current.endedAt=this.current.lastRecordedAt;this.current.endReason=reason;this.current=null;this.clock.deadline=0;}
 pause(now,wall,reason='away'){this.sample(now,wall);this.close(reason);}
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
 function activity(event){
  if(!event.isTrusted||!event.target?.closest?.('.writer, #sheet')||!eligible())return;
  if(event.type==='keydown'&&!(['Backspace','Delete','Enter'].includes(event.key)||event.key.length===1))return;
  if(event.type==='pointerdown'&&!event.target.closest('.toolbar [data-cmd]'))return;
  sample();if(owned)history.activity(performance.now(),Date.now());else claim();stash();
 }
 const leaseTimer=setInterval(()=>{if(!navigator.locks&&owned)try{localStorage.setItem(leaseKey,JSON.stringify({id:instanceId,until:Date.now()+2500}));}catch{}},1000);
 const tick=setInterval(sample,1000),sync=setInterval(flush,15000);
 const pause=()=>{history.pause(performance.now(),Date.now(),'away');sample();unlock();void flush();};
 document.addEventListener('visibilitychange',pause);addEventListener('blur',pause);
 for(const type of ['input','keydown','pointerdown'])document.addEventListener(type,activity,true);
 void flush();show();
 return {sample,flush,total,stop(){if(stopped)return;history.pause(performance.now(),Date.now(),'left');stopped=true;clearInterval(tick);clearInterval(sync);clearInterval(leaseTimer);document.removeEventListener('visibilitychange',pause);removeEventListener('blur',pause);for(const type of ['input','keydown','pointerdown'])document.removeEventListener(type,activity,true);stash();unlock();void flush();}};
}
