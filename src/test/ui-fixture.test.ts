import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { createUiFixture,seedUiFixture,UI_CLOCK,UI_DATE,UI_ZONE } from './ui-fixture';
import { InMemoryTransactionalEngine, STORE_NAMES } from '../storage/db';
import { validateDomainSnapshot } from '../domain/validation';
import { selectTaskReviewState } from '../domain/projections';
describe('UI fixture isolation and coherence',()=>{
  it('validates the filled fixture, dependencies and local media using the canonical validator',async()=>{
    const engine=new InMemoryTransactionalEngine('fixture-validation');const {snapshot,mediaBlobs}=await seedUiFixture(engine);
    validateDomainSnapshot(snapshot,new Map(mediaBlobs.map(b=>[b.id,b.bytes])));
    assert.equal(snapshot.lifeAreaQuestions.length,10);assert.equal(snapshot.stages.length,6);assert.equal(snapshot.habits.length,4);
    assert.equal(snapshot.events.filter(e=>e.id==='night-4').length,1);assert.equal(snapshot.goals[0].checkpoints?.length,2);
    assert.equal(selectTaskReviewState(snapshot.tasks.find(t=>t.id==='triage')!,UI_DATE,snapshot.reservations,UI_ZONE),'needs_triage');
    assert.equal(new Date(UI_CLOCK).toISOString(),'2026-11-05T03:41:00.000Z');
  });
  it('empty is fresh and does not mutate later filled fixtures',()=>{
    const empty=createUiFixture('empty');assert.equal(empty.snapshot.tasks.length,0);assert.equal(empty.snapshot.lifeAreaQuestions.length,10);assert.equal(empty.snapshot.lifeAreaAssessments.length,0);
    assert.equal(createUiFixture().snapshot.tasks.length,5);empty.snapshot.settings.theme='light';assert.equal(createUiFixture().snapshot.settings.theme,'dark');
  });
  it('refuses a persistent engine before starting a transaction',async()=>{
    let wrote=false;await assert.rejects(seedUiFixture({dbName:'real',close(){},async runTransaction(){wrote=true;throw new Error('must not run');}}),/InMemoryTransactionalEngine/);assert.equal(wrote,false);
  });
  it('replaces memory contents deterministically without leaving fixture data in empty variant',async()=>{
    const engine=new InMemoryTransactionalEngine();await seedUiFixture(engine);await seedUiFixture(engine,'empty');
    const tasks=await engine.runTransaction([STORE_NAMES.tasks],'readonly',tx=>tx.getAll(STORE_NAMES.tasks));assert.deepEqual(tasks,[]);
  });
});
