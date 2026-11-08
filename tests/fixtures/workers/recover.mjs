import fs from 'node:fs';
const marker=process.env.AMAZONIA_TEST_ONCE;
if(!marker)throw new Error('Test marker required');
if(!fs.existsSync(marker)){fs.writeFileSync(marker,'first attempt');throw new Error('transient injected failure');}
await import('../../../src/server/simWorker.ts');
