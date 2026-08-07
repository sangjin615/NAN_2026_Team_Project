import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRunSchedule } from '../src/schedule.js';
import { createSetGraph } from '../src/set-graph.js';
import { createMarketPath } from '../src/systems.js';

const catalog=JSON.parse(await readFile(new URL('../assets/items/catalog.json',import.meta.url),'utf8'));
const balance=JSON.parse(await readFile(new URL('../data/balance.json',import.meta.url),'utf8'));
const seed=process.argv[2]||'team-loop-local-001'; const schedule=createRunSchedule({catalog,balance,seed}); const sets=createSetGraph(schedule,seed); const market=createMarketPath(balance,seed);
const lotById=new Map(schedule.days.flatMap(({lots})=>lots).map((lot)=>[lot.lotId,lot]));
const out=new URL('../reports/local-model-experiment/',import.meta.url); await mkdir(out,{recursive:true});
const categories=Object.keys(market);
const marketSignals=Array.from({length:12},(_,index)=>{const leadingCategory=categories.reduce((best,category)=>Math.abs(market[category][index]-1)>Math.abs(market[best][index]-1)?category:best,categories[0]);const value=market[leadingCategory][index];return{day:index+1,leadingCategory,direction:value>1.04?'상승':value<0.96?'하락':'보합'};});
const runRequest={schemaVersion:'1.0',mode:'run-blueprint',runSeed:seed,sets:sets.map((set)=>({setId:set.setId,themeKey:set.themeKey,members:set.lotIds.map((lotId)=>lotById.get(lotId)).filter(Boolean).map(({lotId,baseName,category})=>({lotId,baseName,category}))})),marketSignals};
await writeFile(new URL('run-start-request.json',out),JSON.stringify(runRequest,null,2));
const day=1; const dayRequest={schemaVersion:'1.0',mode:'daily-content',runSeed:seed,day,context:{premise:'',market:null,sets:[]},lots:schedule.days[0].lots.map(({lotId,baseName,category,grade,setId})=>({lotId,baseName,category,grade,setId}))};
await writeFile(new URL('day-1-request.json',out),JSON.stringify(dayRequest,null,2)); console.log(new URL('.',out).pathname);
