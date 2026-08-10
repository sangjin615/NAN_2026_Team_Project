const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

let chromeProcess = null;
(async () => {
  const profileDir = path.resolve("tools/chrome-cdp-profile");
  fs.mkdirSync(profileDir, { recursive: true });
  chromeProcess = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=9223",
    `--user-data-dir=${profileDir}`, "about:blank",
  ], { stdio: "ignore", windowsHide: true });
  let version = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:9223/json/version");
      if (response.ok) { version = await response.json(); break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (!version) throw new Error("Chrome CDP가 준비되지 않았습니다.");
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  console.log("STEP browser");
  const context = browser.contexts()[0];
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  page.setDefaultTimeout(10000);
  const errors = [];
  const missing = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().endsWith("favicon.ico")) {
      missing.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto("http://127.0.0.1:8765/index.html", { waitUntil: "domcontentloaded" });
  console.log("STEP page");
  await page.waitForFunction(() => window.Game && window.Sound);
  const initial = await page.evaluate(() => Sound.state);
  if (initial.currentBgmId !== "bgm-01-title" || initial.currentSceneId !== "scene-title") {
    throw new Error(`타이틀 사운드 상태 불일치: ${JSON.stringify(initial)}`);
  }

  await page.getByRole("button", { name: "설정" }).click();
  console.log("STEP settings");
  for (const id of ["setMasterVolume", "setBgmVolume", "setSfxVolume"]) {
    if (!(await page.locator(`#${id}`).isVisible())) throw new Error(`${id} 미표시`);
  }
  await page.locator("#setMasterVolume").fill("72");
  await page.locator("#setBgmVolume").fill("58");
  await page.locator("#setSfxVolume").fill("81");
  await page.getByRole("button", { name: "적용" }).click();
  console.log("STEP volumes");
  const volumes = await page.evaluate(() => Sound.state.volumes);
  if (volumes.master !== 0.72 || volumes.bgm !== 0.58 || volumes.sfx !== 0.81) {
    throw new Error(`볼륨 적용 불일치: ${JSON.stringify(volumes)}`);
  }

  await page.getByRole("button", { name: "새 게임" }).click();
  console.log("STEP newrun");
  await page.waitForTimeout(2500);
  const runState = await page.evaluate(() => typeof state !== "undefined" && ({ scene: state.scene, day: state.day, hasDaily: !!state.daily }));
  if (runState?.scene !== "city") {
    throw new Error(`새 게임 도시 진입 실패: ${JSON.stringify(runState)} / ${errors.join(" | ")}`);
  }
  const city = await page.evaluate(() => Sound.state);
  if (city.currentBgmId !== "bgm-02-city") throw new Error(`도시 BGM 불일치: ${JSON.stringify(city)}`);
  await page.evaluate(() => Game.enterLocation("tavern"));
  const tavern = await page.evaluate(() => Sound.state);
  if (tavern.currentBgmId !== "bgm-02-city") throw new Error(`도시 BGM 연속성 불일치: ${JSON.stringify(tavern)}`);
  await page.evaluate(() => Game.enterLocation("auction"));
  console.log("STEP auction");
  const auction = await page.evaluate(() => Sound.state);
  if (auction.currentBgmId !== "bgm-03-auction") throw new Error(`경매 BGM 불일치: ${JSON.stringify(auction)}`);

  await page.screenshot({ path: path.resolve("tools/browser-smoke.png"), fullPage: true });
  console.log("STEP screenshot");
  if (errors.length) throw new Error(`브라우저 오류: ${errors.join(" | ")}`);
  if (missing.length) throw new Error(`누락 리소스: ${missing.join(" | ")}`);
  console.log("PASS: 타이틀→도시→술집→경매 BGM, 3버스 볼륨, 리소스/콘솔 오류 검증");
  console.log(JSON.stringify({ initial, volumes, city, tavern, auction }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(() => {
  if (chromeProcess && !chromeProcess.killed) chromeProcess.kill();
});
