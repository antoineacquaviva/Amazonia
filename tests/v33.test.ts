import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runSingleGame} from '../src/sim/engine';
import {DEFAULT_SIMULATION_CONFIG as D} from '../src/sim/i18n';
const fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures/v33.json',import.meta.url),'utf8'));
for(const g of fixtures)test(`${g.botProfiles[0]} seed ${g.seed}: full historical result and traces`,()=>{
 const result=runSingleGame(D,g.botProfiles,g.seed,'historical',true);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),g);
 assert.equal(result.violations.length,0);
 assert(result.traces!.every(t=>t.placements.length===2*D.numPlayers));
});
test('historical shared RNG and ignored initial state remain unchanged',()=>{
 const a=runSingleGame(D,['BLIND'],42001,'x',true),b=runSingleGame(D,['PROB_ONLY'],42001,'x',true);
 assert.deepEqual(a.traces![0].draws,b.traces![0].draws);assert.notDeepEqual(a.traces![1].draws,b.traces![1].draws);
 const custom={...D,initialMachinesState:Array.from({length:4},()=>({harvesterPos:4,bulldozerPos:3,harvesterStatus:'HS' as const,bulldozerStatus:'HS' as const,initialStumpsCell1:2}))};
 assert.deepEqual(runSingleGame(custom,['PROB_ONLY'],42001,'x',true).traces,b.traces);
});
test('boundary configurations retain defender count, finite scores and invariants',()=>{
 for(const n of [3,6])for(const cap of [1,99] as const)for(const rule of ['STANDARD_S3','SYNERGY_TRAP_SAB'] as const){const r=runSingleGame({...D,numPlayers:n,numTurns:12,initialTreesPerCell:3,tacticalDefenderCap:cap,combatThresholdShift:1,parryHsRule:rule,shuffleTacticsTrack:true,tacticsTrackPreset:'ASSAULT_HIGH'},['COORD_HYBRID','BLIND'],42003,'boundary',true);assert.equal(r.violations.length,0);assert(r.traces!.every(t=>t.placements.length===2*n));assert(Number.isFinite(r.survivalRateHorizon));assert(r.survivalRateHorizon>=0&&r.survivalRateHorizon<=1);}
});
