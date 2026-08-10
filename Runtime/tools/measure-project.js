import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtime = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repo = path.dirname(runtime);
async function filesUnder(root) { const out=[]; for (const entry of await readdir(root,{withFileTypes:true})) { const full=path.join(root,entry.name); if(entry.isDirectory()) out.push(...await filesUnder(full)); else out.push(full); } return out; }
const runtimeFiles=await filesUnder(runtime); const sourceFiles=runtimeFiles.filter((file)=>file.endsWith('.js')); const imageFiles=await filesUnder(path.join(repo,'Image'));
const testText=await readFile(path.join(runtime,'test','runtime.test.js'),'utf8');
const generation=JSON.parse(await readFile(path.join(runtime,'reports','generation-900-seeds.json'),'utf8'));
let commits=[]; try { commits=execFileSync('git',['log','--since=8 days ago','--pretty=format:%h|%aI|%an|%s'],{cwd:repo,encoding:'utf8'}).trim().split('\n').filter(Boolean).map((line)=>{const [hash,at,author,...subject]=line.split('|');return{hash,at,author,subject:subject.join('|')}}); } catch {}
const sourceLines=(await Promise.all(sourceFiles.map(async(file)=>(await readFile(file,'utf8')).split('\n').length))).reduce((a,b)=>a+b,0);
const report={measuredAt:new Date().toISOString(),windowDays:8,repository:{commits:commits.length,contributors:[...new Set(commits.map((x)=>x.author))],commitLog:commits},runtime:{files:runtimeFiles.length,bytes:(await Promise.all(runtimeFiles.map(async(file)=>(await stat(file)).size))).reduce((a,b)=>a+b,0),javascriptModules:sourceFiles.length,javascriptLines:sourceLines,automatedTests:(testText.match(/test\('/g)||[]).length},assets:{projectImages:imageFiles.length,itemSprites:runtimeFiles.filter((file)=>file.endsWith('.png')&&file.includes(`${path.sep}assets${path.sep}items${path.sep}`)).length},generation900:generation,humanInputsNeeded:{manualUiBaselineMinutes:null,vslUiMinutes:null,teamPlaytestCount:null,qualitativeFeedback:[]}};
await mkdir(path.join(runtime,'reports'),{recursive:true}); await writeFile(path.join(runtime,'reports','project-evidence-current.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
