import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRunSchedule } from '../src/schedule.js';
import { createSetGraph } from '../src/set-graph.js';
import { createMarketPath } from '../src/systems.js';

const catalog=JSON.parse(await readFile(new URL('../assets/items/catalog.json',import.meta.url),'utf8'));
const balance=JSON.parse(await readFile(new URL('../data/balance.json',import.meta.url),'utf8'));
const seed=process.argv[2]||'team-loop-local-001'; const schedule=createRunSchedule({catalog,balance,seed}); const sets=createSetGraph(schedule,seed); const market=createMarketPath(balance,seed);
const lotById=new Map(schedule.days.flatMap(({lots})=>lots).map((lot)=>[lot.lotId,lot]));
const out=new URL('../reports/local-model-experiment/',import.meta.url); await mkdir(out,{recursive:true});
const runRequest={schemaVersion:'1.0',mode:'run-blueprint',runSeed:seed,days:12,categories:['CER','CLK','PNT','BOK','MET','JEW'],sets:sets.map((set)=>({setId:set.setId,themeKey:set.themeKey,members:set.lotIds.map((lotId)=>lotById.get(lotId)).filter(Boolean).map(({lotId,baseName,category})=>({lotId,baseName,category}))})),bots:[{botId:'nemesis',role:'숙적'},{botId:'drifter-a',role:'유랑 상인'},{botId:'drifter-b',role:'유랑 상인'}],relics:balance.relics.list.map(({id,tier})=>({relicId:id,tier})),market};
await writeFile(new URL('run-start-request.json',out),JSON.stringify(runRequest,null,2));
const questIds=['designated','multi','bargain']; const day=1; const dayRequest={schemaVersion:'1.0',mode:'daily-content',runSeed:seed,day,blueprintFile:'run-start-output.json',market:Object.fromEntries(Object.entries(market).map(([key,path])=>[key,path[day-1]])),questOffers:questIds.map((questId)=>({questId,rule:balance.quests[questId].rule})),lots:schedule.days[0].lots.map((lot)=>({lotId:lot.lotId,baseItemId:lot.baseItemId,baseName:lot.baseName,category:lot.category,grade:lot.grade,basePrice:lot.pricing.basePrice,trueValue:lot.pricing.trueValue,quality:lot.quality,setId:lot.setId}))};
await writeFile(new URL('day-1-request.json',out),JSON.stringify(dayRequest,null,2)); console.log(new URL('.',out).pathname);
