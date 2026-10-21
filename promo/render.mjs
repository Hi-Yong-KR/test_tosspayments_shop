// promo.html 을 프레임 단위로 캡처해 stylebase-promo.mp4 로 인코딩한다.
// 사용: node render.mjs            → 전체 렌더
//       node render.mjs --thumbs   → 주요 시점 정지 화면만 thumbs/ 에 저장
import puppeteer from "puppeteer-core";
import ffmpeg from "ffmpeg-static";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const FPS = 30;
const dir = fileURLToPath(new URL(".", import.meta.url));
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--allow-file-access-from-files"] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(dir + "promo.html").href + "?render", { waitUntil: "networkidle0" });
await page.evaluate(() => window.ready);
const duration = await page.evaluate(() => window.DURATION);

if (process.argv.includes("--thumbs")) {
  mkdirSync(dir + "thumbs", { recursive: true });
  for (const t of [1.0, 2.4, 4.6, 6.1, 8.5, 10.2, 11.4, 13.0, 15.5, 17.0, 18.4, 20.5, 21.6, 22.8, 24.2, 27.0]) {
    await page.evaluate((t) => window.render(t), t);
    await page.screenshot({ path: `${dir}thumbs/t${String(t).replace(".", "_")}.jpg`, type: "jpeg", quality: 70 });
  }
  await browser.close();
  process.exit(0);
}

const out = dir + "stylebase-promo.mp4";
const ff = spawn(ffmpeg, [
  "-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
  "-i", dir + "assets/music.wav",
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-t", String(duration), "-movflags", "+faststart", out,
], { stdio: ["pipe", "ignore", "inherit"] });

const total = Math.round(duration * FPS);
for (let f = 0; f < total; f++) {
  await page.evaluate((t) => window.render(t), f / FPS);
  const jpg = await page.screenshot({ type: "jpeg", quality: 92 });
  if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % 60 === 0) console.log(`frame ${f}/${total}`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
console.log("done:", out);
