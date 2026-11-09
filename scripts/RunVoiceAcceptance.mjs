// Author: Ahmed Zaian. Direct VoiceBridge probes only; no launcher, worker or Graph.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const app=resolve(process.argv[2]??'.');
const {VoiceBridge}=await import(pathToFileURL(resolve(app,'scripts/services/VoiceBridge.mjs')));
const cases=JSON.parse(await readFile(new URL('./VoiceCases.json',import.meta.url),'utf8'));
const model=process.env.EXECFLOW_LOCAL_MODEL??'qwen3:4b-instruct';
const results=[];const sourceHashes={};for(const file of ['scripts/services/VoiceBridge.mjs','scripts/services/SourceGrounding.mjs','scripts/VoiceCases.json'])sourceHashes[file]=createHash('sha256').update(await readFile(resolve(app,file))).digest('hex');const metadata=await(await fetch('http://127.0.0.1:11434/api/tags')).json();
for(const c of cases){let raw,result,error;const start=performance.now();
 const bridge=new VoiceBridge({aiModel:model,fetcher:async(...args)=>{const r=await fetch(...args);raw=await r.clone().json();return r;}});
 try{result=await bridge.interpret(c.source,c.language);}catch(e){error=e.message;}
 const actual=(result?.lines??'').split('\n').filter(Boolean).map(line=>{const [head,...fields]=line.split(' | ');const attrs=Object.fromEntries(fields.map(f=>{const i=f.indexOf(':');return [f.slice(0,i),f.slice(i+1).trim()];}));return {kind:head.startsWith('Action:')?'action':'decision',text:head.slice(head.indexOf(':')+1).trim(),owner:attrs.Owner??null,due:attrs.Due??null};});
 // Match task text, independently of owner/date. Allow a longer verbatim excerpt.
 const remaining=[...actual];const matches=c.expected.map(e=>{const i=remaining.findIndex(a=>a.kind===e.kind&&a.text.includes(e.text));return {expected:e,actual:i<0?null:remaining.splice(i,1)[0]};});
 const meaning=!error&&matches.every(m=>m.actual)&&actual.length===c.expected.length;
 const owners=meaning&&matches.every(m=>m.actual.owner===m.expected.owner);
 const dates=meaning&&matches.every(m=>m.actual.due===m.expected.due);
 results.push({id:c.id,dialect:c.dialect,category:c.category,source:c.source,expected:c.expected,actual,meaning,owners,dates,passed:meaning&&owners&&dates,warnings:result?.warnings??[],rejected:result?.rejected??null,error:error??null,seconds:(performance.now()-start)/1000,raw});
 await writeFile(resolve(process.argv[3]??'Meaning Results.json'),JSON.stringify({model,metadata,sourceHashes,platform:process.platform,node:process.version,method:'Real local model on synthetic text; not acoustic validation. Predeclared task substring plus exact kind/owner/date. Longer verbatim task excerpts allowed. All errors fail.',results},null,2));
 console.log(c.id,meaning&&owners&&dates?'PASS':'FAIL',JSON.stringify(actual),error??'');
}
console.log('PASS',results.filter(x=>x.passed).length,'/',results.length);if(results.some(x=>!x.passed))process.exitCode=1;
