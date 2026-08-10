import fs from "node:fs";
import vm from "node:vm";

const target = process.argv[2] || new URL("../index.html", import.meta.url);
const html = fs.readFileSync(target, "utf8");
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((code) => code.trim());

if (!scripts.length) throw new Error(`${target}에서 인라인 스크립트를 찾지 못했습니다.`);
scripts.forEach((code, index) => new vm.Script(code, { filename: `inline.${index + 1}.js` }));
console.log(`PASS: ${target} 인라인 스크립트 ${scripts.length}개 구문 검증`);
