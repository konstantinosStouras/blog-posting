import {isRetiredStudentCode} from './invitation-codes.js';
const emailKey=value=>String(value||'').trim().toLowerCase();
export function buildPeopleReport({users=[],memberships=[],modules=[],instructorInvites=[],studentInvites=[],includePlatformUsers=false,now=Date.now()}){
 const byModule=new Map(modules.map(m=>[m.id,m]));
 const people=new Map(includePlatformUsers?users.map(u=>[u.uid,{...u}]):[]);
 for(const member of memberships){
  if(!byModule.has(member.moduleId))continue;
  if(!people.has(member.uid))people.set(member.uid,{...member,role:'student'});
 }
 const records=[...people.values()].map(u=>{
  const rows=memberships.filter(m=>m.uid===u.uid&&byModule.has(m.moduleId));
  const joined=[...new Set(rows.map(m=>byModule.get(m.moduleId).title))];
  const taught=modules.filter(m=>m.teacherIds?.includes(u.uid)).map(m=>m.title);
  const lastSeen=Math.max(u.seen||0,...rows.map(m=>m.lastSeenAt||0));
  const lastSignIn=Math.max(u.signedInAt||0,...rows.map(m=>m.lastSignInAt||0));
  return {...u,moduleNames:joined,teachingModuleNames:taught,moduleIds:rows.map(m=>m.moduleId),firstSeen:u.first||0,lastSeen,lastSignIn,status:lastSeen?'Signed in':'Registered / profile saved'};
 }).sort((a,b)=>[a.lastName,a.firstName,a.email].join(' ').localeCompare([b.lastName,b.firstName,b.email].join(' ')));
 const inviteRows=[];
 const nameOf=uid=>{const x=users.find(u=>u.uid===uid);return x?[x.firstName,x.lastName].filter(Boolean).join(' ')||x.email||'':'';};
 for(const i of instructorInvites){
  const registered=records.find(u=>u.uid===i.acceptedBy);
  const status=i.revoked?'Revoked':i.acceptedBy?'Accepted':i.expiresAt<now?'Expired':'Pending registration';
  inviteRows.push({...i,kind:'instructor',invitedBy:nameOf(i.createdBy),universityEmail:i.ucdEmail||'',googleEmail:i.gmail||'',moduleTitle:'Platform instructor access',firstName:registered?.firstName||'',lastName:registered?.lastName||'',studentId:'',affiliation:registered?.affiliation||'',registeredCount:i.acceptedBy?1:0,status,pending:status==='Pending registration'});
 }
 for(const i of studentInvites){
  if(!byModule.has(i.moduleId))continue;
  const recipient=emailKey(i.recipientEmail);
  const accepted=memberships.filter(m=>m.moduleId===i.moduleId&&(m.inviteId===i.id||(recipient&&emailKey(m.contactEmail)===recipient)));
  const first=recipient?accepted[0]:null;
  // A student code is one of the eight cities since 3 Nov 2026; the earlier random codes are retired (no longer accepted) until revoked.
  const status=i.revoked?'Revoked':i.expiresAt<now?'Expired':isRetiredStudentCode(i)?'Retired':recipient?(accepted.length?'Registered':'Pending registration'):'Shared link active';
  inviteRows.push({...i,kind:'student',invitedBy:nameOf(i.createdBy),universityEmail:i.recipientEmail||'',googleEmail:first?.email&&emailKey(first.email)!==recipient?first.email:'',moduleTitle:byModule.get(i.moduleId).title,firstName:first?.firstName||'',lastName:first?.lastName||'',studentId:first?.studentId||'',affiliation:first?.affiliation||'',registeredCount:accepted.length,status,pending:status==='Pending registration'||status==='Shared link active'});
 }
 return {users:records,invitations:inviteRows.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)),modules,generatedAt:now};
}

// What the Delete button at the end of a People row asks before it acts (people.js; app.js uses the same words for the prototype's tables).
export const deleteWording={
 account:name=>`Delete ${name||'this account'} from the site? The profile, role and every module place are removed and unpublished posts are deleted; published posts stay on the blog. The person can sign in again, but must enter a module’s invitation code before writing. This cannot be undone.`,
 member:(name,modules=[])=>`Remove ${name||'this student'} from ${modules.length?modules.join(', '):'the module'}? They keep their account and their posts, but cannot write or edit in the module until they enter its invitation code again.`,
 invite:(kind,code)=>`Delete this ${kind==='instructor'?'instructor':'student'} invitation${code?` (${code})`:''}? ${kind==='instructor'?'An instructor who already accepted it keeps their role.':'Students who already joined through it keep their place, and the city is free for another module.'} This cannot be undone.`,
 post:title=>`Delete “${title||'this post'}” permanently? Its comments, likes, votes and bookmarks go with it.`,
};

export function filterPeopleReport(report,search='',status='all'){
 const q=search.trim().toLowerCase();
 const matches=row=>!q||[row.firstName,row.lastName,row.penName,row.email,row.contactEmail,row.studentId,row.affiliation,row.universityEmail,row.googleEmail,row.moduleTitle,row.code,...(row.moduleNames||[]),...(row.teachingModuleNames||[])].join(' ').toLowerCase().includes(q);
 return {...report,users:report.users.filter(matches),moduleTotals:(report.moduleTotals||[]).filter(matches),writing:(report.writing||[]).filter(row=>matches({...row,moduleNames:[row.title,row.moduleTitle]})),sessions:(report.sessions||[]).filter(row=>matches({...row,moduleNames:[row.title,row.moduleTitle]})),invitations:report.invitations.filter(i=>matches(i)&&(status==='all'||(status==='pending'?i.pending:i.status.toLowerCase().startsWith(status))))};
}
