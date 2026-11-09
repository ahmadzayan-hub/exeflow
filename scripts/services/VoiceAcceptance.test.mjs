import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {VoiceBridge} from './VoiceBridge.mjs';
function wave(){const b=Buffer.alloc(6444);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(6400,40);return b;}
test('long recognised transcript explicitly marks truncation',async()=>{const v=new VoiceBridge({executable:process.execPath,model:process.execPath,runner:async(_e,args)=>writeFile(args[args.indexOf('-of')+1]+'.json',JSON.stringify({transcription:[{text:'أ'.repeat(2100)}]}))});const r=await v.transcribe(wave(),'ar');assert.equal(r.text.length,2000);assert.equal(r.truncated,true);});
test('short transcript explicitly reports no truncation',async()=>{const v=new VoiceBridge({executable:process.execPath,model:process.execPath,runner:async(_e,args)=>writeFile(args[args.indexOf('-of')+1]+'.json',JSON.stringify({transcription:[{text:'اختبار'}]}))});assert.equal((await v.transcribe(wave(),'ar')).truncated,false);});
test('known English-only filename is refused before executing Arabic CLI',async()=>{let invoked=false;const v=new VoiceBridge({executable:process.execPath,model:'/synthetic/ggml-small.en-q5_0.bin',runner:async()=>{invoked=true;}});v.status=async()=>({transcription:true});await assert.rejects(v.transcribe(wave(),'ar'),/multilingual/i);assert.equal(invoked,false);});
test('date prefix in a longer malformed numeric token does not become a due date',async()=>{const v=new VoiceBridge({aiModel:'local',fetcher:async()=>new Response(JSON.stringify({message:{content:JSON.stringify({records:[{kind:'action',text:'review plan',owner:null,due:'2026-11-20'}]})}}))});assert.equal((await v.interpret('review plan reference 2026-11-200','en')).lines,'Action: review plan');});

test('one malformed or negated record does not delete a valid sibling, and rejection is disclosed',async()=>{
 const records=[{kind:'action',text:'submit the report',owner:null,due:null},{kind:'action',text:'review the plan',owner:'Alice',due:null}];
 const v=new VoiceBridge({aiModel:'local',fetcher:async()=>new Response(JSON.stringify({message:{content:JSON.stringify({records})}}))});
 const r=await v.interpret('Do not submit the report. Alice, review the plan.','en');assert.equal(r.lines,'Action: review the plan | Owner: Alice');assert.equal(r.rejected,1);assert.ok(r.warnings.includes('proposal-rejected'));
});
