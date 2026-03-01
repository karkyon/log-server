'use strict';
const { prisma } = require('../lib/prisma');
const fs = require('fs'), path = require('path');
const FEAT_DIR = path.join(__dirname,'..','logs','features');
const SS_DIR   = path.join(__dirname,'..','logs','screenshots');
const PROJECT_ID = 1;
async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nTLog v3.0 — .jsonl → PostgreSQL 移行\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  let tl=0,tc=0,ts=0;
  if (fs.existsSync(FEAT_DIR)) {
    for (const f of fs.readdirSync(FEAT_DIR).filter(f=>f.endsWith('.jsonl')&&!f.endsWith('.console.jsonl'))) {
      const fid=path.basename(f,'.jsonl'); if(fid==='UNKNOWN')continue;
      const data=fs.readFileSync(path.join(FEAT_DIR,f),'utf8').split('\n').filter(Boolean).flatMap(l=>{
        try{const e=JSON.parse(l);return[{projectId:PROJECT_ID,featureId:fid,
          traceId:e.traceId||'legacy',type:e.type||'UNKNOWN',payload:e,
          ts:new Date(e.ts||e._savedAt||Date.now())}];}catch{return[];}
      });
      if(!data.length)continue;
      for(let i=0;i<data.length;i+=500)await prisma.log.createMany({data:data.slice(i,i+500),skipDuplicates:true});
      console.log(`  ✅ ログ ${fid}: ${data.length}件`); tl+=data.length;
    }
    for (const f of fs.readdirSync(FEAT_DIR).filter(f=>f.endsWith('.console.jsonl'))) {
      const fid=path.basename(f,'.console.jsonl');
      const data=fs.readFileSync(path.join(FEAT_DIR,f),'utf8').split('\n').filter(Boolean).flatMap(l=>{
        try{const e=JSON.parse(l);return[{projectId:PROJECT_ID,featureId:fid,
          traceId:e.lastTraceId||null,level:e.level||'log',args:e.args||[],
          stack:e.stack||null,ts:new Date(e.ts||Date.now())}];}catch{return[];}
      });
      if(!data.length)continue;
      for(let i=0;i<data.length;i+=500)await prisma.consoleLog.createMany({data:data.slice(i,i+500),skipDuplicates:true});
      console.log(`  ✅ Console ${fid}: ${data.length}件`); tc+=data.length;
    }
  }
  if (fs.existsSync(SS_DIR)) {
    const data=[];
    for(const fid of fs.readdirSync(SS_DIR)){
      const dir=path.join(SS_DIR,fid);if(!fs.statSync(dir).isDirectory())continue;
      for(const fname of fs.readdirSync(dir)){
        if(!/\.(jpg|jpeg|png)$/i.test(fname))continue;
        const parts=fname.replace(/\.(jpg|jpeg|png)$/i,'').split('_');
        const ti=parts.findIndex(p=>/^TR-/.test(p));
        const stat=fs.statSync(path.join(dir,fname));
        data.push({projectId:PROJECT_ID,featureId:fid,
          traceId:ti>=0?parts[ti]:'legacy',trigger:ti>=2?parts.slice(2,ti).join('_'):'UNKNOWN',
          fileName:fname,filePath:path.join(SS_DIR,fid,fname),ts:stat.birthtime||stat.mtime});
      }
    }
    for(let i=0;i<data.length;i+=500)await prisma.screenshot.createMany({data:data.slice(i,i+500),skipDuplicates:true});
    console.log(`  ✅ スクショ: ${data.length}件`); ts=data.length;
  }
  console.log(`\n移行完了 — ログ:${tl} / Console:${tc} / SS:${ts}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}
main().catch(e=>{console.error('❌',e.message);process.exit(1);}).finally(()=>prisma.$disconnect());
