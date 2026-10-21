// 로컬 서버(npx -y http-server -p 5500 -c-1)에 띄운 실제 사이트를 고해상도로 캡처해 assets/ui-*.png 로 저장한다.
// 결제는 요청하지 않으며 주문서 입력값과 결제 완료 화면 값은 영상용 예시 값이다.
// 커서 연출에 쓰도록 주요 요소의 위치(CSS px)를 assets/ui-layout.json 에 기록한다.
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:5500/";
const dir = fileURLToPath(new URL("./assets/", import.meta.url));
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DESK = { width: 1440, height: 900, deviceScaleFactor: 2 };
const MOB = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const ITEM = { id: "T002", size: "L", qty: 2 };
const layout = {};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

async function open(path, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(BASE + path, { waitUntil: "load", timeout: 60000 });
  await page.evaluate(() => window.appReady);
  await wait(1000);
  return page;
}
// 페이지 기준 좌표(스크롤 포함)
const rect = (page, sel) =>
  page.$eval(sel, (e) => {
    const b = e.getBoundingClientRect();
    return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height };
  });

async function fillCheckout(page) {
  const vals = { "c-name": "김스타", "c-email": "style@example.com", "c-phone": "01012345678",
    "s-zip": "04524", "s-addr1": "서울특별시 중구 세종대로 110", "s-addr2": "10층" };
  for (const [id, v] of Object.entries(vals)) {
    await page.$eval("#" + id, (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }, v);
  }
  await page.click("#same-as-orderer").catch(() => {});
  await page.$eval("#s-name", (el) => { if (!el.value) el.value = "김스타"; });
  await page.$eval("#s-phone", (el) => { if (!el.value) el.value = "01012345678"; });
  // 결제위젯은 다른 출처 iframe이라 내부 텍스트가 그려질 때까지 기다린다
  for (let i = 0; i < 30; i++) {
    const fr = page.frames().find((f) => f.url().includes("payment-methods"));
    const txt = fr ? await fr.evaluate(() => document.body.innerText).catch(() => "") : "";
    if (txt.includes("결제 방법")) {
      // 테스트 환경 안내 배너는 닫는다(결제 동작과 무관)
      await fr.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => /닫기|close/i.test(x.getAttribute("aria-label") || ""));
        b?.click();
      }).catch(() => {});
      break;
    }
    await wait(1000);
  }
  await wait(1500);
}

// fullPage 캡처에는 결제위젯 iframe이 빠지므로 뷰포트를 페이지 높이만큼 늘려 한 번에 찍는다
async function shotCheckout(page, prefix) {
  await page.evaluate(() => { document.documentElement.style.overflowX = "hidden"; scrollTo(0, 0); });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const vp = page.viewport();
  await page.setViewport({ ...vp, height: Math.ceil(h) });
  await wait(2500);
  await page.screenshot({ path: `${dir}${prefix}checkout.png` });
  layout[prefix + "checkout"] = {
    page: await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })),
    widget: await rect(page, "#payment-method"),
    payButton: await rect(page, "#payment-button"),
    summary: await rect(page, "#summary"),
  };
  // 위젯 안의 토스페이 버튼 위치(위젯 기준)
  const fr = page.frames().find((f) => f.url().includes("payment-methods"));
  layout[prefix + "checkout"].tossPay = await fr.evaluate(() => {
    const el = [...document.querySelectorAll("button, [role=radio], label, div")].find(
      (e) => /toss\s*pay|토스페이/i.test(e.innerText + (e.getAttribute("aria-label") || "")) && e.getBoundingClientRect().height < 90);
    const b = el?.getBoundingClientRect();
    return b ? { x: b.left, y: b.top, w: b.width, h: b.height } : null;
  }).catch(() => null);
}

async function shotSuccess(viewport, file) {
  const p = await browser.newPage();
  await p.setViewport(viewport);
  await p.goto(BASE + "success.html", { waitUntil: "load" });
  await wait(2500);
  await p.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const icon = document.getElementById("r-icon");
    icon.className = "icon"; icon.textContent = "✓";
    set("r-title", "결제가 완료되었습니다");
    set("r-desc", "주문해 주셔서 감사합니다.");
    set("r-order", "SB20261021-7Q4K2M");
    set("r-name", "에센셜 기모 스웻 후드 집업 외");
    set("r-amount", "87,000원");
    set("r-type", "토스페이");
    document.getElementById("r-key")?.closest("div")?.remove();
    document.querySelectorAll(".toast").forEach((t) => t.remove());
  });
  await wait(300);
  await p.screenshot({ path: dir + file });
  await p.close();
}

// 1) 데스크톱 목록 3종
for (const cat of ["tops", "shoes", "pants"]) {
  const p = await open(cat + ".html", DESK);
  await p.screenshot({ path: `${dir}ui-${cat}.png`, clip: { x: 0, y: 0, width: 1440, height: 1700 }, captureBeyondViewport: true });
  if (cat === "tops") {
    layout.tops = { card: await rect(p, `article[data-id="${ITEM.id}"] .thumb`) };
    // 2) 상품 모달 (사이즈·수량 선택 상태)
    await p.evaluate((id) => openModal(id), ITEM.id);
    await wait(500);
    await p.click(`.size[data-size="${ITEM.size}"]`);
    for (let i = 1; i < ITEM.qty; i++) await p.click('[data-q="1"]');
    await wait(400);
    layout.modal = { size: await rect(p, `.size[data-size="${ITEM.size}"]`), buy: await rect(p, "#m-buy"), box: await rect(p, "#modal") };
    await p.screenshot({ path: `${dir}ui-modal.png` });
    // 3) 바로 구매 → 주문서 + 결제위젯
    await Promise.all([p.waitForNavigation({ waitUntil: "load" }), p.click("#m-buy")]);
    await p.evaluate(() => window.appReady);
    await fillCheckout(p);
    await shotCheckout(p, "ui-");
  }
  await p.close();
}

// 4) 모바일 목록·주문서
{
  const p = await open("tops.html", MOB);
  await p.screenshot({ path: `${dir}ui-m-tops.png`, clip: { x: 0, y: 0, width: 390, height: 1600 }, captureBeyondViewport: true });
  await p.evaluate((it) => sessionStorage.setItem("sb_direct", JSON.stringify([it])), ITEM);
  await p.goto(BASE + "checkout.html?mode=direct", { waitUntil: "load" });
  await p.evaluate(() => window.appReady);
  await fillCheckout(p);
  await shotCheckout(p, "ui-m-");
  await p.close();
}

// 5) 결제 완료 화면 (실제 success.html 스타일에 예시 값)
await shotSuccess(MOB, "ui-m-success.png");
await shotSuccess(DESK, "ui-success.png");

await browser.close();
writeFileSync(dir + "ui-layout.json", JSON.stringify(layout, null, 2));
console.log("captured");
