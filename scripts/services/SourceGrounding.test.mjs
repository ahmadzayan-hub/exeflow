import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundProposal } from './SourceGrounding.mjs';
const task = (text, owner = null, due = null) => ({ kind: 'action', text, owner, due });
test('fields from a different task sentence are removed, not silently borrowed', () => {
 const r=groundProposal('Alice, review the plan by 2026-11-18. Bob, draft minutes by 2026-11-22.',task('review the plan','Bob','2026-11-22'));
 assert.equal(r.owner,null);assert.equal(r.due,null);assert.deepEqual(r.warnings,['owner-unverified','date-unverified']);
});
test('owner requires a whole name rather than a substring of another name',()=>{assert.equal(groundProposal('Alistair, review plan.',task('review plan','Ali')).owner,null);});
test('explicit absent owner does not delete a valid task',()=>{const r=groundProposal('لازم نراجع قائمة المعدات. المسؤول لسه مش محدد.',task('نراجع قائمة المعدات'));assert.equal(r.text,'نراجع قائمة المعدات');assert.equal(r.owner,null);});
test('an adjacent owner label is allowed but cannot import another activity',()=>{
 assert.equal(groundProposal('We approved site A. The owner is Eva.',{...task('site A','Eva'),kind:'decision'}).owner,'Eva');
 assert.equal(groundProposal('review plan. The owner is Eva and Bob will draft minutes.',task('review plan','Bob')).owner,null);
});
test('explicit negated/cancelled task substrings cannot become proposals',()=>{
 for(const source of ['Do not submit the report.','Alice, never submit the report.','Submit the report is cancelled.'])assert.throws(()=>groundProposal(source,task(source.startsWith('Submit')?'Submit the report':'submit the report')),/negated or cancelled/);
 for(const source of ['يا حمد، لا ترسل التقرير.','لم نعتمد اختيار الموقع.'])assert.throws(()=>groundProposal(source,task(source.includes('ترسل')?'ترسل التقرير':'اختيار الموقع')),/negated or cancelled/);
});
test('do not forget reminder phrasing retains its positive task',()=>{assert.equal(groundProposal('Alice, do not forget to review plan.',task('review plan','Alice')).owner,'Alice');});
test('task spanning sentences or repeated excerpts cannot borrow fields',()=>{
 const r=groundProposal('Alice review plan. Bob review plan.',task('review plan','Bob'));assert.equal(r.owner,null);assert.ok(r.warnings.includes('source-ambiguous'));
 assert.throws(()=>groundProposal('review plan. Bob draft minutes.',task('review plan. Bob draft minutes','Bob')),/Invalid local model proposal/);
});
test('Arabic digits convert only for an explicit valid local date',()=>{
 assert.equal(groundProposal('مريم، راجعي الخطة بتاريخ ٢٠٢٦-١١-٢٣.',task('راجعي الخطة','مريم','2026-11-23')).due,'2026-11-23');
 for(const date of ['2026-11-230','2026-02-30','abc2026-11-23'])assert.equal(groundProposal('review plan '+date,task('review plan',null,date==='2026-02-30'?date:'2026-11-23')).due,null);
});

test('duplicated task text cannot bypass clear negation',()=>{assert.throws(()=>groundProposal('Do not submit the report. Do not submit the report.',task('submit the report')),/negated or cancelled/);});
