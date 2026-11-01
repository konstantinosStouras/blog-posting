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
 for(const i of instructorInvites){
  const registered=records.find(u=>u.uid===i.acceptedBy);
  const status=i.revoked?'Revoked':i.acceptedBy?'Accepted':i.expiresAt<now?'Expired':'Pending registration';
  inviteRows.push({...i,kind:'instructor',universityEmail:i.ucdEmail||'',googleEmail:i.gmail||'',moduleTitle:'Platform instructor access',firstName:registered?.firstName||'',lastName:registered?.lastName||'',studentId:'',affiliation:registered?.affiliation||'',registeredCount:i.acceptedBy?1:0,status,pending:status==='Pending registration'});
 }
 for(const i of studentInvites){
  if(!byModule.has(i.moduleId))continue;
  const recipient=emailKey(i.recipientEmail);
  const accepted=memberships.filter(m=>m.moduleId===i.moduleId&&(m.inviteId===i.id||(recipient&&emailKey(m.contactEmail)===recipient)));
  const first=recipient?accepted[0]:null;
  const status=i.revoked?'Revoked':i.expiresAt<now?'Expired':recipient?(accepted.length?'Registered':'Pending registration'):'Shared link active';
  inviteRows.push({...i,kind:'student',universityEmail:i.recipientEmail||'',googleEmail:first?.email&&emailKey(first.email)!==recipient?first.email:'',moduleTitle:byModule.get(i.moduleId).title,firstName:first?.firstName||'',lastName:first?.lastName||'',studentId:first?.studentId||'',affiliation:first?.affiliation||'',registeredCount:accepted.length,status,pending:status==='Pending registration'||status==='Shared link active'});
 }
 return {users:records,invitations:inviteRows.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)),modules,generatedAt:now};
}

export function filterPeopleReport(report,search='',status='all'){
 const q=search.trim().toLowerCase();
 const matches=row=>!q||[row.firstName,row.lastName,row.penName,row.email,row.contactEmail,row.studentId,row.affiliation,row.universityEmail,row.googleEmail,row.moduleTitle,row.code,...(row.moduleNames||[]),...(row.teachingModuleNames||[])].join(' ').toLowerCase().includes(q);
 return {...report,users:report.users.filter(matches),moduleTotals:(report.moduleTotals||[]).filter(matches),writing:(report.writing||[]).filter(row=>matches({...row,moduleNames:[row.title,row.moduleTitle]})),sessions:(report.sessions||[]).filter(row=>matches({...row,moduleNames:[row.title,row.moduleTitle]})),invitations:report.invitations.filter(i=>matches(i)&&(status==='all'||(status==='pending'?i.pending:i.status.toLowerCase().startsWith(status))))};
}
