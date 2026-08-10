// 실험 결과를 정식 fixture 로 올린다.
//
//   node tools/promote-generation-fixture.mjs
//
// -latest 산출물을 현재 request 로 다시 검증하고, 통과할 때만 정식 파일
// (run-start-output.json, day-1-output.json)에 반영한다.
//
// 승격을 별도 명령으로 둔 이유가 있다. 실험 도구가 request 를 다시 만들기
// 때문에, 어떤 -latest 파일이 존재한다는 사실만으로는 그것이 현재 request 와
// 짝이 맞는다고 말할 수 없다. 실제로 request 는 두 번 갱신되고 output 은 최초
// 커밋 이후 멈춰 있어서 seed 가 서로 다른 채로 오래 방치됐다. 짝을 검사하지
// 않고 올리면 같은 일이 되풀이된다.
//
// 검증은 generation-server.js 의 실제 검증기를 그대로 쓴다. 복제하지 않는다.
import { readFile, writeFile } from 'node:fs/promises';
import { validateOutput } from '../generation-server.js';

const reportRoot = new URL('../reports/local-model-experiment/', import.meta.url);
const pairs = [
  { request: 'run-start-request.json', latest: 'run-start-output-latest.json', canonical: 'run-start-output.json' },
  { request: 'day-1-request.json', latest: 'day-1-output-latest.json', canonical: 'day-1-output.json' },
];

const readJson = async (name) => JSON.parse(await readFile(new URL(name, reportRoot), 'utf8'));

const checked = [];
for (const pair of pairs) {
  let request;
  let artifact;
  try {
    request = await readJson(pair.request);
    artifact = await readJson(pair.latest);
  } catch (error) {
    console.error(`${pair.latest}: 읽을 수 없다 — ${error.message}`);
    process.exit(1);
  }
  try {
    validateOutput(request, artifact.output);
  } catch (error) {
    console.error(`${pair.latest}: 현재 ${pair.request} 기준으로 검증 실패 — ${error.message}`);
    console.error('승격하지 않았다. 같은 seed 로 실험을 다시 돌려라.');
    process.exit(1);
  }
  checked.push({ pair, artifact });
  console.log(`${pair.latest}: valid (seed ${artifact.seed}, model ${artifact.model})`);
}

// 두 쌍이 모두 통과한 뒤에 쓴다. 하나만 올리면 blueprint 와 day 가 어긋난다.
for (const { pair, artifact } of checked) {
  await writeFile(new URL(pair.canonical, reportRoot), JSON.stringify(artifact, null, 2));
  console.log(`promoted -> ${pair.canonical}`);
}
