import {readdir,readFile} from 'node:fs/promises';
const files=await readdir(new URL('../dist/assets/',import.meta.url));
for(const file of files.filter(f=>f.endsWith('.js'))){
 const source=await readFile(new URL(`../dist/assets/${file}`,import.meta.url),'utf8');
 for(const marker of ['UI fixture requires InMemoryTransactionalEngine','career-stage-0','2026-11-05T03:41:00.000Z','mountUiPrimitiveFixture'])if(source.includes(marker))throw new Error(`UI fixture leaked into production: ${marker}`);
}
console.log('PASS: UI fixture data and primitive showcase are absent from production JavaScript');
