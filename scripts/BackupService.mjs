// Author: Ahmed Zaian. Explicit backup only; never changes the running register.
import {readFile,writeFile,mkdir,realpath,stat,rm,open} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join,parse} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const writeDurable=async(path,bytes)=>{const file=await open(path,'wx',0o600);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}};
const digest=b=>createHash('sha256').update(b).digest('hex');
const inside=(parent,child)=>{const r=relative(parent,child);return r===''||!r.startsWith('..')&&!isAbsolute(r);};
async function runtime(appDirectory){
 const root=await realpath(appDirectory);
 const {isRegister}=await import(pathToFileURL(join(root,'dist','CommitmentRuntime.mjs')));
 const {LocalAutomation}=await import(pathToFileURL(join(root,'scripts','services','LocalAutomation.mjs')));
 return {isRegister,LocalAutomation};
}
export async function verifyBackup(appDirectory,directory){
 const {isRegister,LocalAutomation}=await runtime(appDirectory),root=await realpath(directory);
 const manifest=JSON.parse(await readFile(join(root,'Manifest.json'),'utf8'));
 if(manifest.version!==1||!manifest.files||Object.keys(manifest.files).sort().join(',')!=='Register.json,State.json')throw Error('Unsupported backup manifest.');
 for(const [name,wanted] of Object.entries(manifest.files)){const bytes=await readFile(join(root,name));if(digest(bytes)!==wanted)throw Error('Backup checksum mismatch: '+name);}
 const state=JSON.parse(await readFile(join(root,'State.json'),'utf8')),register=JSON.parse(await readFile(join(root,'Register.json'),'utf8'));
 if(!isRegister(register)||JSON.stringify(register)!==JSON.stringify(state.register))throw Error('Register copy differs from state.');
 const graph={status:()=>({delivery:false})};await new LocalAutomation({directory:root,validator:isRegister,graph}).init();
 return {verified:true,records:register.records.length,revision:state.registerRevision,createdAt:manifest.createdAt,independence:manifest.independence};
}
export async function createBackup({appDirectory,stateDirectory,destination,allowSameVolumeForTest=false}){
 let source,target;
 try{source=await realpath(stateDirectory);}catch{throw Error('Service data folder was not found. Start ExecFlow and connect the register first.');}
 try{target=await realpath(destination);}catch{throw Error('Backup folder was not found. Connect the external drive and create the destination folder first.');}
 if(inside(source,target)||inside(target,source))throw Error('Backup destination must be outside the service data directory.');
 if(process.platform==='win32'&&target.startsWith('\\\\'))throw Error('Choose an approved local external drive, not a network share.');
 const sameVolume=process.platform==='win32'?parse(source).root.toLowerCase()===parse(target).root.toLowerCase():(await stat(source)).dev===(await stat(target)).dev;
 if(sameVolume&&!allowSameVolumeForTest)throw Error('Choose a different volume, preferably an external drive. A folder on the same volume is not independent.');
 const bytes=await readFile(join(source,'State.json'));if(bytes.length>20_000_000)throw Error('Service state exceeds the supported size.');
 const state=JSON.parse(bytes),{isRegister}=await runtime(appDirectory);if(!isRegister(state.register))throw Error('Service register is invalid; original preserved.');
 const name='ExecFlow '+new Date().toISOString().replace(/[:.]/g,'')+' '+randomUUID().slice(0,8),folder=join(target,name);await mkdir(folder,{mode:0o700});
 try{
  const register=Buffer.from(JSON.stringify(state.register,null,2)+'\n');
  await writeDurable(join(folder,'State.json'),bytes);await writeDurable(join(folder,'Register.json'),register);
  const manifest={version:1,createdAt:new Date().toISOString(),independence:sameVolume?'TEST ONLY: same volume; no independent hardware recovery claim':'Different volume; operator must verify it is an independent device and retain it safely',files:{'State.json':digest(bytes),'Register.json':digest(register)}};
  await writeDurable(join(folder,'Manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const result=await verifyBackup(appDirectory,folder);return {directory:folder,...result};
 }catch(e){await rm(folder,{recursive:true,force:true});throw e;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [mode,appDirectory,source,destination]=process.argv.slice(2);
  if(mode==='create'&&appDirectory&&source&&destination)console.log(JSON.stringify(await createBackup({appDirectory,stateDirectory:source,destination}),null,2));
  else if(mode==='verify'&&appDirectory&&source)console.log(JSON.stringify(await verifyBackup(appDirectory,source),null,2));
  else throw Error('Usage: node BackupService.mjs create "APP FOLDER" "SERVICE DATA FOLDER" "EXTERNAL BACKUP FOLDER"\nOr: node BackupService.mjs verify "APP FOLDER" "BACKUP FOLDER"');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
