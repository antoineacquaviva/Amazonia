import fs from 'node:fs';
import path from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import type {CampaignRecord} from '../sim/types';

export function validateCampaignId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) throw new Error('Identifiant de campagne invalide');
}
export class CampaignStore {
  private pending = new Map<string, Promise<void>>();
  constructor(private root: string) { this.root = path.resolve(root); }
  private ensureRoot() {
    fs.mkdirSync(this.root, {recursive:true});
    if (fs.realpathSync(this.root) !== this.root) throw new Error('Répertoire de campagnes symbolique interdit');
  }
  private file(id: string) {
    validateCampaignId(id); this.ensureRoot();
    const target = path.join(this.root, `${id}.json`);
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('Lien symbolique interdit');
    return target;
  }
  load(): CampaignRecord[] {
    this.ensureRoot(); const records: CampaignRecord[] = [];
    for (const name of fs.readdirSync(this.root).filter(n=>n.endsWith('.json'))) {
      let raw: Buffer | undefined;
      try {
        const id=name.slice(0,-5); const file=this.file(id);
        raw=fs.readFileSync(file); const r=JSON.parse(raw.toString()) as CampaignRecord;
        validateCampaignId(r.id);
        if(r.id!==id || !r.config || !r.progress || !Array.isArray(r.variantResults) || !['RUNNING','PAUSED','STOPPED','COMPLETED','ERROR'].includes(r.status)) throw new Error('Structure incompatible');
        const compatible=r.config.type==='ORACLE_STRESS_TEST'
          ? r.stressTelemetry?.scoreDistributionByBotLevel?.PROB_ONLY && r.stressTelemetry?.scoreDistributionByBotLevel?.COORD_NO_DICE
          : (r.variantResults.length===0 && r.config.sweep?.parryHsRuleValues) || r.variantResults[0]?.criteria?.infoAndCoordMetrics?.survProbOnly!==undefined;
        if(!compatible) throw new Error('Version incompatible');
        records.push(r);
      } catch(error) {
        // Copy quarantine: preserve original bytes and pathname; never follow links.
        try { if(raw) {
          const dir=path.join(this.root,'quarantine'); fs.mkdirSync(dir,{recursive:true});
          if(fs.realpathSync(dir)!==dir) throw new Error('Quarantaine symbolique interdite');
          const hash=createHash('sha256').update(raw).digest('hex');
          const target=path.join(dir,`${hash}.json`);
          try {fs.writeFileSync(target,raw,{flag:'wx',mode:0o600});} catch(e) {if((e as NodeJS.ErrnoException).code!=='EEXIST') throw e;}
        }
        } catch (quarantineError) { console.error('Échec copie de quarantaine; original conservé', quarantineError); }
        console.error(`Campagne non chargée : ${name}`, (error as Error).message);
      }
    }
    return records;
  }
  private enqueue(id:string, task:()=>Promise<void>) {
    validateCampaignId(id);
    const next=(this.pending.get(id)??Promise.resolve()).catch(()=>{}).then(task);
    this.pending.set(id,next);
    void next.finally(()=>{if(this.pending.get(id)===next)this.pending.delete(id);}).catch(()=>{});
    return next;
  }
  save(record:CampaignRecord) {
    const id=record.id;validateCampaignId(id);const payload=JSON.stringify(record,null,2);
    return this.enqueue(id,async()=>{
      const file=this.file(id);const temp=path.join(this.root,`.${id}.${randomUUID()}.tmp`);
      try {
        const handle=await fs.promises.open(temp,'wx',0o600);
        try {await handle.writeFile(payload);await handle.sync();} finally {await handle.close();}
        this.file(id);await fs.promises.rename(temp,file);
        const dir=await fs.promises.open(this.root,'r');try{await dir.sync();}finally{await dir.close();}
      } finally {await fs.promises.rm(temp,{force:true});}
    });
  }
  remove(id:string) {return this.enqueue(id,async()=>{await fs.promises.rm(this.file(id),{force:true});});}
}
