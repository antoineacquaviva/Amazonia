import assert from 'node:assert/strict';
import {environmentEvents} from '../../src/v4science/runner.ts';
import {initialBoard, resolveDraw, resolveTurn, regenerate} from '../../src/v4/engine.ts';
import {panelProgram} from '../../src/v4science/policies.ts';
import {measures} from '../../src/v4science/measures.ts';
import {digest} from '../../src/scientific/random.ts';

const [n, first, count] = process.argv.slice(2).map(Number);
const plan = {experimentSeed:17, environmentSeed:23, policySeed:29};
const config = {rulesVersion:'V4_EXPERIMENTAL_2026_11_09',numPlayers:n,numTurns:8,trackLength:16,
  initialTreesPerCell:2,initialEyeOrder:Array.from({length:n},(_,i)=>i),
  eyeMode:'ONE_STEP',stealthCapacity:'SINGLE',sabotageMode:'BOTH_MACHINES'};
for(let seed=first;seed<first+count;seed++){
  const {events}=environmentEvents(plan,config,seed);
  const arms=[];
  for(const opening of ['libre','combat']){
    let reference;
    for(const variant of ['V4','poursuite','sabotage','combinee']){
      const rules={pursuit:['poursuite','combinee'].includes(variant),
        partialSabotage:['sabotage','combinee'].includes(variant)};
      const board=initialBoard(config),traces=[],turns=[];
      for(let turn=1;turn<=8;turn++){
        const before=structuredClone(board);
        const draws=events.filter(e=>e.turn===turn).map(e=>resolveDraw(e.player,e.d1,e.d2,board.eyeOrder));
        const p=panelProgram(board,config,draws,'COORD_HYBRID',plan,seed,0,opening==='combat',rules);
        const t=resolveTurn(board,config,draws,p.placements,p.decisions,rules);
        traces.push(t);
        const m={actA:0,actB:0,attA:0,attB:0,coupes:0,terrassements:0,souchesEnlevees:0,
          arriveesBSouche:0,menaces:0,paradesMenaces:0,combinés:0,partiels:0,redirections:0};
        for(const a of t.activations){
          m['act'+a.kind]++;
          if(!a.recovering)m['att'+a.kind]++;
        }
        m.redirections=t.draws.filter((d,i)=>d.target!==draws[i].target).length;
        for(const c of t.combats){
          const cell=before.forests[c.target].cells[c.cell-1];
          const a=c.machines.includes('A'), b=c.machines.includes('B');
          const threatened=(a && cell.trees>0)||(b && cell.stumps>0);
          m.menaces+=Number(threatened);
          m.paradesMenaces+=Number(threatened && c.parried);
          m.arriveesBSouche+=Number(b && cell.stumps>0);
          m.coupes+=c.cut;
          m.terrassements+=Number(c.cleared>0);
          m.souchesEnlevees+=c.cleared;
          m.combinés+=Number(a && b);
          m.partiels+=Number(a && b && !c.parried && c.defenders>0 && c.sabotageConsumed.length===1);
        }
        assert(m.coupes<=m.attA && m.terrassements<=m.arriveesBSouche && m.arriveesBSouche<=m.attB);
        turns.push(m);
      }
      const early=digest(traces.slice(0,2));
      if(reference===undefined)reference=early;
      assert.equal(early,reference);
      const m=measures(config,traces,board,regenerate(board));
      assert.equal(m.ecologicalLoss,m.byPlayer.reduce((sum,p)=>sum+p.loss,0));
      m.turns.forEach((t,i)=>Object.assign(turns[i],{pertes:t.ecologicalDamage,parades:t.parries,
        combats:t.combats,revisions:t.revisionChanges,pieges:t.trapsPlaced,sabotages:t.sabotagesPlaced,
        decouvertes:t.discoveries}));
      arms.push({variant,opening,turns,pertesParSiege:m.byPlayer.map(p=>p.loss)});
    }
  }
  console.log(JSON.stringify({n,seed,eventFingerprint:digest(events),arms}));
}
