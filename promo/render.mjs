// promo.html 을 프레임 단위로 캡처해 stylebase-promo.mp4 로 인코딩한다.
// 프레임마다 서브프레임 SUB장을 셔터 각도만큼 나눠 찍고 평균 내 모션블러를 만든다.
// 사용: node render.mjs            → 전체 렌더
//       node render.mjs --thumbs   → 주요 시점 정지 화면만 thumbs/ 에 저장
//       node render.mjs --fast     → 모션블러 없이 빠른 미리보기 렌더
import puppeteer from "puppeteer-core";
import ffmpeg from "ffmpeg-static";
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const FPS = 30;
const FAST = process.argv.includes("--fast");
const SUB = FAST ? 1 : Number(process.env.SUB || 12); // 서브프레임 수
const SHUTTER = 0.5;          // 180도 셔터
const dir = fileURLToPath(new URL(".", import.meta.url));
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";

// 상품 SVG를 배경 사각형 없이 인라인으로 쓰도록 assets/products.js 생성
const prodDir = dir + "../img/products/";
const svgs = {};
for (const f of readdirSync(prodDir).filter((f) => f.endsWith(".svg"))) {
  svgs[f.replace(".svg", "")] = readFileSync(prodDir + f, "utf8").replace(/<rect width="250" height="300"[^>]*\/>/, "").trim();
}
writeFileSync(dir + "assets/products.js", "window.PRODUCT_SVG = " + JSON.stringify(svgs) + ";\n");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--allow-file-access-from-files"] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("pageerror:", e.message));
await page.goto(pathToFileURL(dir + "promo.html").href + "?render", { waitUntil: "networkidle0" });
await page.evaluate(() => window.ready);
const duration = await page.evaluate(() => window.DURATION);

if (process.argv.includes("--thumbs")) {
  mkdirSync(dir + "thumbs", { recursive: true });
  const ts = process.argv.slice(3).map(Number).filter((n) => !isNaN(n));
  const list = ts.length ? ts : [1.2, 2.6, 4.5, 5.5, 6.5, 7.7, 9.6, 10.5, 11.3, 12.4, 13.0, 13.9, 14.7, 15.6, 17.2, 18.4, 19.4, 20.4, 21.8, 23.0, 24.2, 26.6, 27.8, 29.0];
  for (const t of list) {
    await page.evaluate((t) => window.render(t), t);
    await page.screenshot({ path: `${dir}thumbs/t${t.toFixed(1).replace(".", "_")}.jpg`, type: "jpeg", quality: 75 });
  }
  await browser.close();
  console.log("thumbs:", list.join(", "));
  process.exit(0);
}

const out = dir + (FAST ? "preview-fast.mp4" : "stylebase-promo.mp4");
const total = Math.round(duration * FPS);
const WORKERS = FAST ? 1 : Number(process.env.WORKERS || 3);
const t0 = Date.now();
let doneFrames = 0;

// 구간별로 페이지 하나와 ffmpeg 하나를 붙여 병렬 렌더한다.
// 서브프레임을 SUB배 프레임레이트로 넣고 tmix로 평균, SUB장마다 하나만 남긴다
async function renderRange(w, from, to) {
  // 같은 브라우저의 백그라운드 탭은 렌더가 멈추므로 작업마다 브라우저를 따로 띄운다
  const b = w === 0 ? browser : await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--allow-file-access-from-files"] });
  const p = w === 0 ? page : await b.newPage();
  if (w !== 0) {
    await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await p.goto(pathToFileURL(dir + "promo.html").href + "?render", { waitUntil: "networkidle0" });
    await p.evaluate(() => window.ready);
  }
  const seg = `${dir}thumbs/seg${w}.mp4`;
  const vf = SUB > 1 ? `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/(${FPS}*TB)` : "null";
  const ff = spawn(ffmpeg, [
    "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS * SUB), "-i", "-",
    "-vf", vf, "-r", String(FPS),
    "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p", "-profile:v", "high", seg,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  for (let f = from; f < to; f++) {
    for (let s = 0; s < SUB; s++) {
      const t = (f + (SUB > 1 ? (s / SUB) * SHUTTER : 0)) / FPS;
      await p.evaluate((t) => window.render(t), t);
      const jpg = await p.screenshot({ type: "jpeg", quality: 95, optimizeForSpeed: true });
      if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
    }
    if (++doneFrames % 60 === 0) console.log(`frame ${doneFrames}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  if (w !== 0) await b.close();
  return seg;
}

mkdirSync(dir + "thumbs", { recursive: true });
const per = Math.ceil(total / WORKERS);
const segs = await Promise.all([...Array(WORKERS)].map((_, w) => renderRange(w, w * per, Math.min(total, (w + 1) * per))));
await browser.close();

// 구간을 이어 붙이고 음악을 입혀 마무리(라우드니스 -14 LUFS)
writeFileSync(dir + "thumbs/segs.txt", segs.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"));
await new Promise((res, rej) => spawn(ffmpeg, [
  "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", dir + "thumbs/segs.txt",
  "-i", dir + "assets/music.wav", "-map", "0:v", "-map", "1:a", "-c:v", "copy",
  "-af", "loudnorm=I=-14:TP=-1:LRA=11", "-ar", "48000", "-c:a", "aac", "-b:a", "256k",
  "-t", String(duration), "-movflags", "+faststart", out,
], { stdio: "inherit" }).on("close", (c) => (c ? rej(new Error("ffmpeg " + c)) : res())));
console.log("done:", out, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
