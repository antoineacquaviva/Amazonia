import assert from 'node:assert/strict';
import {initialBoard,resolveTurn,resolveDraw} from '../../src/v4/engine.ts';
import {DEFAULT_V4_CONFIG} from '../../src/v4/types.ts';
import {pursuitTargets,redirect} from '../../src/v4/pressure.ts';
const config={...DEFAULT_V4_CONFIG,sabotageMode:'BOTH_MACHINES'};
const board=initialBoard(config);
board.eyeOrder=[1,2,0];
for(const f of board.forests) f.cells[1].stumps=Number(f.player===0);
assert.deepEqual(pursuitTargets(board),[0,0,0]);
board.forests[1].machines[1].hs=1;
assert.deepEqual(pursuitTargets(board),[0,1,0]);
board.forests[0].cells[1].stumps=0;
assert.deepEqual(pursuitTargets(board),[0,1,2]);
assert.equal(redirect({tactic:'A1',target:1},[0,0,0]).target,1);

function combat({turn=3,sabotage=['A'],trap=false,defenders=1,partial=true}={}){
  const b=initialBoard(config);
  b.turn=turn;
  const target=0;
  const candidates=Array.from({length:36},(_,i)=>resolveDraw(0,1+Math.floor(i/6),1+i%6,b.eyeOrder));
  const a=candidates.find(d=>d.target===target && d.tactic[0]==='A');
  const attackB=candidates.find(d=>d.target===target && d.tactic[0]==='B');
  const other=candidates.find(d=>d.target!==target);
  const draws=[a,attackB,other].map((d,roller)=>({...d,roller}));
  b.forests[target].cells[1].trap=trap;
  for(const m of b.forests[target].machines)m.sabotage=sabotage.includes(m.kind);
  const placements=b.eyeOrder.flatMap(owner=>[1,2].map(step=>({
    owner,step,mode:'COMBAT',target:step===1?owner:(owner+1)%3,
    cell:owner===0 && step===1 && defenders ? 2:1,sabotageChoice:'A'})));
  return resolveTurn(b,config,draws,placements,[],{pursuit:false,partialSabotage:partial}).combats.find(c=>c.target===target);
}
for(const [options,expected] of [
  [{},[0,1,false]], [{sabotage:['B']},[1,0,false]],
  [{sabotage:['A','B']},[0,0,true]], [{trap:true},[0,0,true]],
  [{turn:2},[0,0,true]], [{partial:false},[0,0,true]],
  [{defenders:0},[1,1,false]]
]){
  const c=combat(options);
  assert.deepEqual([c.cut,c.cleared,c.parried],expected);
}
console.log('Cas déterministes validés');
