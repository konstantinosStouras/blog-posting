// Presence: when an account is signed in on the site. A visit (one browser tab, from the page load
// until it is closed) writes a presence row per module the account belongs to or teaches (the admin
// writes one row with no module, readable by the admin alone), stamped with the visit's start and the
// last minute it was seen; the tab beats once a minute while it is open, hidden or not, since a
// student who leaves the tab open is still signed in on the site. "Time away" on a post is the part
// of its window (creation to publication) that no visit of the author covers. Nothing can be told
// about a window from before presence was recorded, so such a post's time away stays blank.
export const PRESENCE_SINCE=Date.UTC(2026,10,4);   // 4 Nov 2026 UTC: the first day visits were recorded
export const BEAT_MS=60000;

// The seconds of [from, to] covered by the union of the intervals ({startedAt, lastSeenAt}).
export function coveredSeconds(intervals=[],from=0,to=0){
 if(!(to>from))return 0;
 const spans=intervals.map(i=>[Math.max(from,Number(i.startedAt)||0),Math.min(to,Number(i.lastSeenAt)||0)]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
 let covered=0,start=0,end=0;
 for(const [a,b] of spans){if(end&&a<=end){end=Math.max(end,b);continue;}if(end)covered+=end-start;start=a;end=b;}
 if(end)covered+=end-start;
 return Math.floor(covered/1000);
}

// One tab's heartbeat. `modules` is read on every beat, so a module joined after sign-in is picked up;
// `save` writes one row (the same row id each beat, so the server copy only moves lastSeenAt).
export function startPresence({uid,modules=()=>[],save,now=Date.now,newId=()=>crypto.randomUUID(),intervalMs=BEAT_MS,doc=globalThis.document}){
 const visitId=newId(),startedAt=now();let stopped=false,busy=false;
 async function beat(){
  if(stopped||busy)return;busy=true;
  try{const seen=now();for(const moduleId of [...new Set(modules())]){try{await save({id:`${visitId}:${moduleId||'site'}`,uid,moduleId,startedAt,lastSeenAt:seen});}catch(e){if(e?.code!=='permission-denied')console.warn('presence',e?.code||e?.message||e);}}}
  finally{busy=false;}
 }
 const timer=setInterval(beat,intervalMs);
 const onVisible=()=>{if(doc?.visibilityState==='visible')void beat();};
 doc?.addEventListener?.('visibilitychange',onVisible);
 void beat();
 return {beat,stop(){stopped=true;clearInterval(timer);doc?.removeEventListener?.('visibilitychange',onVisible);}};
}
