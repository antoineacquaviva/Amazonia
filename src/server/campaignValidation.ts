import {expandParameterSweep} from '../sim/evaluator';
import type {CampaignConfig} from '../sim/types';
import {validateCampaignId} from './campaignStore';
export function validateCampaignConfig(c:CampaignConfig) {
  validateCampaignId(c.id);
  if(!['MONTE_CARLO_SWEEP','FIVE_LEVERS_ABLATION','ORACLE_STRESS_TEST'].includes(c.type)) throw new Error('Type invalide');
  const integer=(n:unknown,min:number,max:number)=>{if(!Number.isSafeInteger(n)||Number(n)<min||Number(n)>max)throw new Error('Limite numérique de campagne dépassée');};
  integer(c.gamesPerVariantAndTable,5,10000);integer(c.baseSeed,1,0xffffffff);
  if(c.maxTotalGames!==undefined)integer(c.maxTotalGames,1,10000000);
  if(c.targetDurationSeconds!=null)integer(c.targetDurationSeconds,1,604800);
  if(typeof c.name!=='string'||c.name.length>500)throw new Error('Nom invalide');
  const domains:Record<string,unknown[]>={numPlayersValues:[3,4,5,6],numTurnsValues:[6,7,8,9,10,11,12],initialTreesPerCellValues:[2,3],tacticalDefenderCapValues:[1,2,99],combatThresholdShiftValues:[0,1],bulldozerZeroStumpActionValues:['NONE','DESTROY_TREE'],initialStumpCell2Values:[true,false],tacticsTrackPresetValues:['ASSAULT_LOW','ASSAULT_HIGH'],parryHsRuleValues:['STANDARD_S3','SYNERGY_TRAP_SAB'],shuffleTacticsTrackValues:[true,false]};
  if(!c.sweep||typeof c.sweep!=='object')throw new Error('Balayage invalide');
  for(const [key,domain] of Object.entries(domains)) {const values=(c.sweep as unknown as Record<string,unknown>)[key];if(values===undefined)continue;if(!Array.isArray(values)||values.length>domain.length||values.some(v=>!domain.includes(v)))throw new Error(`Dimension invalide : ${key}`);}
  if(!Array.isArray(c.selectedTableConfigs)||c.selectedTableConfigs.length>32)throw new Error('Trop de tables');
  for(const t of c.selectedTableConfigs){if(!t||typeof t.id!=='string'||typeof t.name!=='string'||t.id.length>128||t.name.length>500||!Array.isArray(t.botProfiles)||t.botProfiles.length<1||t.botProfiles.length>6||t.botProfiles.some(b=>!['BLIND','PROB_ONLY','SOLO_INFORMED','COORD_NO_DICE','COORD_ONE_SHOT','COORD_HYBRID','OMNISCIENT'].includes(b)))throw new Error('Table invalide');}
  // Upper bound includes calibration tables even if the caller omits them.
  if(expandParameterSweep(c.sweep).length*Math.max(7,c.selectedTableConfigs.length+7)*c.gamesPerVariantAndTable>10000000)throw new Error('Budget maximal de campagne dépassé');
}
