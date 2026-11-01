export function formatWritingTime(seconds=0){
 const n=Math.max(0,Math.floor(Number(seconds)||0));
 return `${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
}
export function writingReport(posts=[],sessions=[],modules=[],users=[]){
 const allowed=new Map(modules.map(m=>[m.id,m])),people=new Map(users.map(u=>[u.uid,u]));
 return posts.filter(p=>allowed.has(p.moduleId)).map(p=>{
  const u=people.get(p.authorId)||{},m=allowed.get(p.moduleId);
  const seconds=sessions.filter(s=>s.postId===p.id&&s.uid===p.authorId&&s.moduleId===p.moduleId).reduce((n,s)=>n+Math.max(0,Number(s.seconds)||0),0);
  return {postId:p.id,title:p.title,moduleId:m.id,moduleTitle:m.title,authorId:p.authorId,firstName:u.firstName||'',lastName:u.lastName||'',email:u.email||'',contactEmail:u.contactEmail||'',studentId:u.studentId||'',seconds,writingTime:formatWritingTime(seconds),status:p.status};
 });
}

export function sessionHistoryReport(posts=[],sessions=[],modules=[],users=[]){
 const postsById=new Map(writingReport(posts,[],modules,users).map(p=>[p.postId,p]));
 return sessions.flatMap(s=>{const p=postsById.get(s.postId);if(!p||p.authorId!==s.uid||p.moduleId!==s.moduleId||(!s.lastActivityAt&&!s.seconds))return [];
  return [{...p,sessionId:s.id,startedAt:s.startedAt||0,lastActivityAt:s.lastActivityAt||0,lastRecordedAt:s.lastRecordedAt||0,endedAt:s.endedAt||0,endReason:s.lastActivityAt?(s.endReason||'checkpoint'):'legacy',seconds:s.seconds||0,writingTime:formatWritingTime(s.seconds)}];
 }).sort((a,b)=>b.startedAt-a.startedAt||a.sessionId.localeCompare(b.sessionId));
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
 const instanceId=crypto.randomUUID(),key=`ucd-writing-history:${uid}:${postId}`,pending=new Map();
 try{for(const r of JSON.parse(localStorage.getItem(key)||'[]')){if(!r.endedAt){r.endedAt=r.lastRecordedAt||r.lastActivityAt||r.startedAt;r.endReason='interrupted';}pending.set(r.id,r);}}catch{}
 const history=new WritingSessionHistory({uid,postId,moduleId,onSession:r=>pending.set(r.id,r)});
 history.clock.previous=performance.now();
 let stopped=false,busy=false,owned=false,release,claiming=false,error=false,needsFlush=false;
 const stash=()=>{try{localStorage.setItem(key,JSON.stringify([...pending.values()]));}catch{}};
 const total=()=>baseSeconds+Math.floor(history.clock.seconds);
 const show=()=>onTick(total(),error);
 const eligible=()=>!stopped&&document.visibilityState==='visible'&&document.hasFocus()&&isEditing();
 const unlock=()=>{owned=false;release?.();release=null;};
 const sample=()=>{history.sample(performance.now(),Date.now(),owned&&eligible(),isEditing()?'away':'preview');if(!history.current)unlock();stash();show();};
 async function flush(){
  if(busy){needsFlush=true;return;}busy=true;error=false;
  try{for(const [id,r] of [...pending]){const snapshot={...r};try{await store.saveWritingHistory(snapshot);if(history.current?.id!==id&&JSON.stringify(r)===JSON.stringify(snapshot))pending.delete(id);}catch{error=true;}}stash();}finally{busy=false;show();if(needsFlush){needsFlush=false;void flush();}}
 }
 const leaseKey=`ucd-writing-lock:${uid}`;
 function claim(){
  if(owned||claiming||!eligible())return;
  const acquired=()=>{owned=true;history.activity(performance.now(),Date.now());stash();void flush();};
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
