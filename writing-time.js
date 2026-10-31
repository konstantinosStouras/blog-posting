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

export class EditingActivityClock {
 constructor(idleMs=30000){this.idleMs=idleMs;this.seconds=0;this.previous=0;this.deadline=0;}
 sample(now,eligible=true){const end=Math.min(now,this.deadline);if(eligible&&end>this.previous)this.seconds+=Math.min(2000,end-this.previous)/1000;this.previous=now;if(!eligible)this.deadline=0;return this.seconds;}
 activity(now,eligible=true){this.sample(now,eligible);if(eligible)this.deadline=now+this.idleMs;}
 pause(now){this.sample(now);this.deadline=0;}
 active(now){return now<this.deadline;}
}

// Only recent editing in the visible, focused editor counts. One lock per account
// prevents two editor tabs counting the same student's time simultaneously.
export function startWritingTimer({uid,postId,moduleId,store,baseSeconds=0,onTick=()=>{},isEditing=()=>true}){
 const key=`ucd-writing:${uid}:${postId}`,sessionId=crypto.randomUUID();
 const clock=new EditingActivityClock();clock.previous=performance.now();
 let stopped=false,busy=false,owned=false,release,ready=false,error=false,claiming=false;
 const pending=new Map();
 try{for(const row of JSON.parse(localStorage.getItem(key)||'[]'))pending.set(row.id,row);}catch{}
 const row={id:sessionId,uid,postId,moduleId,seconds:0,startedAt:Date.now()};pending.set(sessionId,row);
 const stash=()=>{try{localStorage.setItem(key,JSON.stringify([...pending.values()]));}catch{}};
 const total=()=>baseSeconds+Math.floor(clock.seconds);
 const show=()=>onTick(total(),error);
 const eligible=()=>!stopped&&document.visibilityState==='visible'&&document.hasFocus()&&isEditing();
 const unlock=()=>{owned=false;release?.();release=null;};
 const sample=()=>{const now=performance.now();clock.sample(now,owned&&eligible());row.seconds=Math.floor(clock.seconds);if(!clock.active(now))unlock();stash();show();};
 async function flush(){
  if(busy)return;busy=true;
  try{
   if(!ready){await store.beginWritingSession(row);ready=true;}
   for(const [id,r] of pending){if(id===sessionId&&!ready)continue;await store.saveWritingSession(r);if(id!==sessionId)pending.delete(id);}
   error=false;stash();
  }catch{error=true;}finally{busy=false;show();}
 }
 const leaseKey=`ucd-writing-lock:${uid}`;
 function claim(){
  if(owned||claiming||!eligible())return;
  if(navigator.locks){claiming=true;navigator.locks.request(`ucd-writing-${uid}`,{ifAvailable:true},lock=>{claiming=false;if(!lock||!eligible())return;owned=true;clock.activity(performance.now());return new Promise(r=>{release=r;});}).catch(()=>{claiming=false;});}
  else try{const lease=JSON.parse(localStorage.getItem(leaseKey)||'null');if(!lease||lease.id===sessionId||lease.until<Date.now()){localStorage.setItem(leaseKey,JSON.stringify({id:sessionId,until:Date.now()+2500}));owned=true;clock.activity(performance.now());release=()=>{try{if(JSON.parse(localStorage.getItem(leaseKey)||'null')?.id===sessionId)localStorage.removeItem(leaseKey);}catch{}};}}catch{}
 }
 function activity(event){
  if(!event.isTrusted||!event.target?.closest?.('.writer, #sheet')||!eligible())return;
  if(event.type==='keydown'&&!(['Backspace','Delete','Enter'].includes(event.key)||event.key.length===1))return;
  if(event.type==='pointerdown'&&!event.target.closest('.toolbar [data-cmd]'))return;
  if(owned)clock.activity(performance.now());else claim();
 }
 const leaseTimer=setInterval(()=>{if(!navigator.locks&&owned)try{localStorage.setItem(leaseKey,JSON.stringify({id:sessionId,until:Date.now()+2500}));}catch{}},1000);
 const tick=setInterval(sample,1000),sync=setInterval(flush,15000);
 const pause=()=>{clock.pause(performance.now());sample();unlock();void flush();};
 document.addEventListener('visibilitychange',pause);addEventListener('blur',pause);
 for(const type of ['input','keydown','pointerdown'])document.addEventListener(type,activity,true);
 void flush();show();
 return {sample,flush,stop(){if(stopped)return;sample();stopped=true;clearInterval(tick);clearInterval(sync);clearInterval(leaseTimer);document.removeEventListener('visibilitychange',pause);removeEventListener('blur',pause);for(const type of ['input','keydown','pointerdown'])document.removeEventListener(type,activity,true);unlock();void flush();},total};
}
