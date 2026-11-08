import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {CampaignStore,validateCampaignId} from '../src/server/campaignStore';import {DEFAULT_SWEEP_INPUT} from '../src/sim/i18n';import type {CampaignRecord} from '../src/sim/types';
function record(id='valid'):CampaignRecord{return {id,config:{id,name:'Test',type:'MONTE_CARLO_SWEEP',createdAt:'2026-11-08',gamesPerVariantAndTable:5,sweep:DEFAULT_SWEEP_INPUT,selectedTableConfigs:[],includeCalibrationTables:true,baseSeed:42000},status:'COMPLETED',startedAt:'2026-11-08',updatedAt:'2026-11-08',progress:{completedGames:0,totalTargetGames:0,completedVariants:0,totalVariants:0,elapsedSeconds:0,gamesPerSecond:0,currentPhaseLabel:''},variantResults:[]};}
async function temporary(fn:(dir:string)=>unknown){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'amazonia-test-'));try{await fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('strict IDs',()=>{for(const id of ['../bad','/tmp/a','a/b','a\\b','.','', 'a'.repeat(129)])assert.throws(()=>validateCampaignId(id));validateCampaignId('camp_ref_v33_shapley_7bots');});
test('quarantine copies originals, isolates malformed files and preserves valid format',()=>temporary(async dir=>{
 fs.writeFileSync(path.join(dir,'broken.json'),'{');fs.writeFileSync(path.join(dir,'old.json'),'{}');const store=new CampaignStore(dir);await store.save(record());assert.equal(store.load().length,1);assert.equal(fs.readFileSync(path.join(dir,'broken.json'),'utf8'),'{');assert.equal(fs.readFileSync(path.join(dir,'old.json'),'utf8'),'{}');assert.equal(fs.readdirSync(path.join(dir,'quarantine')).length,2);store.load();assert.equal(fs.readdirSync(path.join(dir,'quarantine')).length,2);
}));
test('queued snapshots persist last request, deletion waits for writes',()=>temporary(async dir=>{
 const store=new CampaignStore(dir),r=record();const writes=[];for(let i=0;i<30;i++){r.progress.completedGames=i;writes.push(store.save(r));}await Promise.all(writes);assert.equal(store.load()[0].progress.completedGames,29);assert.deepEqual(fs.readdirSync(dir),['valid.json']);const pending=store.save(r);await store.remove(r.id);await pending;assert(!fs.existsSync(path.join(dir,'valid.json')));
}));
test('symlink escape rejected',()=>temporary(async dir=>{const root=path.join(dir,'campaigns');fs.mkdirSync(root);const outside=path.join(dir,'outside');fs.writeFileSync(outside,'safe');fs.symlinkSync(outside,path.join(root,'valid.json'));await assert.rejects(new CampaignStore(root).save(record()));assert.equal(fs.readFileSync(outside,'utf8'),'safe');}));

import {validateCampaignConfig} from '../src/server/campaignValidation';
test('campaign safety budgets and profiles',()=>{const r=record();validateCampaignConfig(r.config);for(const c of [{...r.config,baseSeed:Infinity},{...r.config,gamesPerVariantAndTable:10001},{...r.config,sweep:{...r.config.sweep,numPlayersValues:[100000]}},{...r.config,selectedTableConfigs:[{id:'x',name:'x',botProfiles:['UNKNOWN']}]}])assert.throws(()=>validateCampaignConfig(c as typeof r.config));});
import {CampaignManager} from '../src/server/campaignManager';
test('manager loads valid records without moving rejected originals or bootstrapping over them',()=>temporary(async dir=>{
 fs.writeFileSync(path.join(dir,'camp_ref_v33_shapley_7bots.json'),'{}');
 const empty=new CampaignManager({campaignsDir:dir});assert.equal(empty.listCampaigns().length,0);assert.equal(fs.readFileSync(path.join(dir,'camp_ref_v33_shapley_7bots.json'),'utf8'),'{}');
 await empty.close();
 await new CampaignStore(dir).save(record());const manager=new CampaignManager({campaignsDir:dir,createReference:false});assert.equal(manager.listCampaigns().length,1);await manager.close();
}));
test('failed atomic replacement preserves previous JSON and later saves can succeed',()=>temporary(async dir=>{
 const store=new CampaignStore(dir),r=record();await store.save(r);const original=fs.readFileSync(path.join(dir,'valid.json'),'utf8');const rename=fs.promises.rename;
 try {fs.promises.rename=async()=>{throw new Error('injected failure');};r.progress.completedGames=1;await assert.rejects(store.save(r));assert.equal(fs.readFileSync(path.join(dir,'valid.json'),'utf8'),original);assert.deepEqual(fs.readdirSync(dir),['valid.json']);} finally {fs.promises.rename=rename;}
 r.progress.completedGames=2;await store.save(r);assert.equal(store.load()[0].progress.completedGames,2);
}));
