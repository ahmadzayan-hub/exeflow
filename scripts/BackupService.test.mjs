import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createBackup,verifyBackup} from './BackupService.mjs';
const appDirectory=resolve('.');
test('verified complete snapshot survives separate recovery; corruption is rejected and source is unchanged',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ExecFlowBackupTest'));t.after(()=>rm(root,{recursive:true,force:true}));
 const source=join(root,'Service'),target=join(root,'Backup');await mkdir(source);await mkdir(target);
 const {LocalAutomation}=await import('./services/LocalAutomation.mjs');
 const runtime=await import('../dist/CommitmentRuntime.mjs');
 const s=await new LocalAutomation({directory:source,validator:runtime.isRegister,graph:{status:()=>({delivery:false})}}).init();
 const register=runtime.acceptCandidates(runtime.emptyRegister(),runtime.extractMinutes('Action: Synthetic backup | Owner: Ali | Due: 2026-11-20','Synthetic','2026-11-09').candidates,'2026-11-09');await s.sync(register,0);
 const original=await readFile(join(source,'State.json'),'utf8');
 const b=await createBackup({appDirectory,stateDirectory:source,destination:target,allowSameVolumeForTest:true});assert.equal(b.records,1);
 const recovered=await new LocalAutomation({directory:b.directory,validator:runtime.isRegister,graph:{status:()=>({delivery:false})}}).init();assert.deepEqual(recovered.state.register,register);
 await writeFile(join(b.directory,'Register.json'),'corrupt');await assert.rejects(verifyBackup(appDirectory,b.directory),/checksum/);assert.equal(await readFile(join(source,'State.json'),'utf8'),original);
});
test('live CLI policy rejects a same-volume or nested destination',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ExecFlowBackupBoundary'));t.after(()=>rm(root,{recursive:true,force:true}));const source=join(root,'Service'),target=join(root,'Backup');await mkdir(source);await mkdir(target);
 await assert.rejects(createBackup({appDirectory,stateDirectory:source,destination:source}),/outside/);await assert.rejects(createBackup({appDirectory,stateDirectory:source,destination:target}),/different volume/);
});
