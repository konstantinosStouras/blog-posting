// Local, isolated browser QA. Never used by the public website.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(!/^\/(?:[a-z-]+\.(?:js|css|svg|html))?$/.test(path)){res.writeHead(404);res.end();return;}
  try{
    let body=await readFile(new URL(path==='/'?'index.html':path.slice(1),root),'utf8');
    if(path==='/backend-firebase.js') body=body.replace('app = appM.initializeApp(firebaseConfig); auth = A.getAuth(app); db = F.getFirestore(app);',`app = appM.initializeApp({...firebaseConfig,apiKey:'demo-key',projectId:'demo-ucd-blog',authDomain:'localhost'}); auth = A.getAuth(app); db = F.getFirestore(app); A.connectAuthEmulator(auth,'http://localhost:9099',{disableWarnings:true}); F.connectFirestoreEmulator(db,'localhost',8080);`);
    res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/html','Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end();}
}).listen(8765,'127.0.0.1',()=>console.log('Isolated QA preview: http://localhost:8765'));
