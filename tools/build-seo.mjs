// SEO / AEO / GEO 정적 산출물 생성기
//
//   node tools/build-seo.mjs            # 기본 도메인(GitHub Pages) 사용
//   SITE_URL=https://example.com/ node tools/build-seo.mjs
//
// 하는 일
// - 모든 HTML <head>의 <!-- seo:head --> 블록: title, description, canonical, robots, OG/Twitter, JSON-LD
// - 카테고리 페이지 본문에 정적 상품 목록·FAQ를 미리 렌더링 (JS 실행 전에도 크롤러/AI가 읽을 수 있게)
//   list.js가 실행되면 #page-head, #grid는 같은 마크업으로 다시 그려진다.
// - img/products/<id>.svg, sitemap.xml, robots.txt, llms.txt 생성
//
// 상품 데이터는 Supabase에서 publishable 키로 읽는다 (공개 SELECT만 허용된 테이블).
// 상품·가격·카테고리가 바뀌면 이 스크립트를 다시 실행해서 커밋한다.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = (process.env.SITE_URL || "https://hi-yong-kr.github.io/test_tosspayments_shop/").replace(/\/?$/, "/");
const SITE_NAME = "STYLEBASE";
const SITE_DESC =
  "STYLEBASE는 상의·신발·바지를 판매하는 온라인 패션 쇼핑몰입니다. 5만원 이상 무료배송, 회원가입 없이 비회원 결제와 주문조회를 지원합니다.";
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD (KST)

// ---------- 페이지 메타 ----------
const NOINDEX = {
  "checkout.html": ["주문서", "주문 상품과 배송지를 확인하고 결제합니다."],
  "success.html": ["결제 완료", "결제가 완료되었습니다."],
  "fail.html": ["결제 실패", "결제에 실패했습니다."],
  "login.html": ["로그인", "STYLEBASE 회원 로그인"],
  "signup.html": ["회원가입", "STYLEBASE 회원가입"],
  "mypage.html": ["마이페이지", "주문 내역, 좋아요, 배송지를 관리합니다."],
  "order-detail.html": ["주문 상세", "주문 상세 내역"],
};
const INDEXED = {
  "order-lookup.html": ["비회원 주문조회", "회원가입 없이 주문한 경우 주문번호와 주문자 연락처로 주문 상태를 조회할 수 있습니다."],
};

// FAQ: 화면에 보이는 내용과 FAQPage 구조화 데이터가 같아야 한다 (AEO)
const FAQ = [
  ["배송비는 얼마인가요?", "주문 금액이 50,000원 이상이거나 '무료배송' 표시 상품이 하나라도 포함되면 무료배송이고, 그 외에는 배송비 3,000원이 추가됩니다."],
  [
    "회원가입 없이 구매할 수 있나요?",
    "네. 로그인하지 않아도 장바구니와 결제를 모두 이용할 수 있습니다. 비회원 주문은 주문번호와 주문자 휴대폰 번호로 '비회원 주문조회' 페이지에서 확인합니다.",
  ],
  ["어떤 결제 수단을 쓸 수 있나요?", "토스페이먼츠 결제위젯으로 신용·체크카드, 간편결제, 계좌이체 등을 이용할 수 있습니다."],
  ["주문을 취소하려면 어떻게 하나요?", "회원은 마이페이지의 주문 상세에서 결제 완료 상태인 주문을 직접 취소할 수 있으며, 취소 시 결제가 환불됩니다."],
  ["원하는 사이즈가 품절이면 어떻게 표시되나요?", "상품 사이즈별로 재고를 관리하며, 재고가 없는 사이즈는 '품절'로 표시되고 선택할 수 없습니다."],
  ["비회원으로 담은 장바구니는 로그인하면 사라지나요?", "아니요. 로그인하거나 회원가입하면 비회원으로 담아둔 장바구니와 좋아요, 주문이 회원 계정으로 합쳐집니다."],
];

// ---------- 유틸 ----------
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const won = (n) => n.toLocaleString("ko-KR") + "원";
const abs = (p = "") => new URL(p, SITE_URL).href;
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const write = (f, s) => {
  fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, f), s);
};
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;

// 마커 사이를 교체. 첫 실행이면 fallback(정규식)으로 교체 위치를 찾는다
function replaceBlock(html, name, content, fallback, indent) {
  const re = new RegExp(`[ \\t]*<!-- seo:${name} -->[\\s\\S]*?<!-- /seo:${name} -->`);
  const block = `${indent}<!-- seo:${name} -->\n${content}\n${indent}<!-- /seo:${name} -->`;
  if (re.test(html)) return html.replace(re, block);
  if (!fallback.test(html)) throw new Error(`seo:${name} 위치를 찾지 못함`);
  return html.replace(fallback, (m) => {
    if (m.includes("<title>")) return block; // <title> 줄을 블록으로 교체
    if (m.includes("></")) return m.replace("></", `>\n${block}\n${indent.slice(2)}</`); // 빈 태그 안에 삽입
    return `\n${block}${m}`; // 앞에 삽입
  });
}

// ---------- 데이터 ----------
// js/products.js 를 그대로 불러와 mapProduct / salePrice / productSvg 를 재사용한다
const ctx = vm.createContext({});
vm.runInContext(read("js/products.js") + "\nthis.__ = { mapProduct, salePrice, productSvg };", ctx);
const { mapProduct, salePrice, productSvg } = ctx.__;

const sbSrc = read("js/supabase.js");
const SUPABASE_URL = sbSrc.match(/SUPABASE_URL = "([^"]+)"/)[1];
const SUPABASE_KEY = sbSrc.match(/SUPABASE_KEY = "([^"]+)"/)[1];
async function rest(q) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { headers: { apikey: SUPABASE_KEY } });
  if (!res.ok) throw new Error(`${q}: ${res.status} ${await res.text()}`);
  return res.json();
}
const categories = await rest("categories?select=*&order=sort");
const products = (await rest("products?select=*,categories(key),product_stock(size,stock)&is_active=eq.true&order=like_count.desc")).map(mapProduct);

// ---------- 상품 이미지 (SVG) ----------
for (const p of products) write(`img/products/${p.id}.svg`, productSvg(p).replace("<svg ", '<svg width="500" height="600" '));

// ---------- 공통 head ----------
function headBlock({ file, title, desc, robots = "index,follow", ld = [], ogType = "website" }) {
  // index.html 은 tops.html 로 즉시 이동하므로 canonical 을 tops.html 로 둔다
  const url = abs(file === "index.html" ? "tops.html" : file);
  const fullTitle = file === "index.html" ? `${SITE_NAME} | 상의·신발·바지 온라인 패션 쇼핑몰` : `${title} | ${SITE_NAME}`;
  const i = "    ";
  return [
    `<title>${esc(fullTitle)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<meta name="robots" content="${robots}" />`,
    robots.startsWith("index") ? `<link rel="canonical" href="${url}" />` : "",
    `<meta name="theme-color" content="#000000" />`,
    `<link rel="icon" href="favicon.svg" type="image/svg+xml" />`,
    `<meta property="og:type" content="${ogType}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="ko_KR" />`,
    `<meta property="og:title" content="${esc(fullTitle)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${esc(fullTitle)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    ...ld.map(jsonLd),
  ]
    .filter(Boolean)
    .map((l) => i + l)
    .join("\n");
}

const ORG = { "@type": "Organization", "@id": abs("#org"), name: SITE_NAME, url: SITE_URL, logo: abs("favicon.svg") };
const WEBSITE = { "@type": "WebSite", "@id": abs("#website"), name: SITE_NAME, url: SITE_URL, inLanguage: "ko-KR", publisher: { "@id": abs("#org") }, description: SITE_DESC };
const faqLd = {
  "@type": "FAQPage",
  "@id": abs("#faq"),
  mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
};

const inStock = (p) => Object.values(p.stock).some((n) => n > 0);
function productLd(p, file) {
  return {
    "@type": "Product",
    "@id": abs(`${file}#p-${p.id}`),
    sku: p.id,
    name: p.name,
    brand: { "@type": "Brand", name: p.brand },
    category: `${categories.find((c) => c.key === p.cat).name} > ${p.sub}`,
    image: abs(`img/products/${p.id}.svg`),
    url: abs(`${file}#p-${p.id}`),
    offers: {
      "@type": "Offer",
      price: salePrice(p),
      priceCurrency: "KRW",
      availability: inStock(p) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      url: abs(`${file}#p-${p.id}`),
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: { "@type": "MonetaryAmount", value: salePrice(p) >= 50000 ? 0 : 3000, currency: "KRW" },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "KR" },
      },
    },
  };
}

// ---------- 본문 정적 렌더 (list.js 와 같은 마크업) ----------
const formatCount = (n) => (n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, "") + "만" : n.toLocaleString("ko-KR"));
const cardHtml = (p, rank) => `      <article class="card" id="p-${p.id}" data-id="${p.id}" tabindex="0">
        <div class="thumb">
          ${productSvg(p)}
          <span class="rank">${rank}</span>
        </div>
        <div class="info">
          <div class="brand">${esc(p.brand)}</div>
          <h2 class="name">${esc(p.name)}</h2>
          <div class="price-row">
            ${p.discount ? `<span class="discount">${p.discount}%</span>` : ""}
            <span class="price">${won(salePrice(p))}</span>
          </div>
          <div class="meta">
            <span>♥ ${formatCount(p.likes)}</span>
            <span><span class="star">★</span> ${p.rating} (${formatCount(p.reviews)})</span>
          </div>
          <div class="badges">
            ${p.free ? `<span class="badge free">무료배송</span>` : ""}
            ${p.discount >= 30 ? `<span class="badge">특가</span>` : ""}
          </div>
        </div>
      </article>`;

const faqHtml = `      <section class="faq" aria-labelledby="faq-title">
        <h2 id="faq-title">자주 묻는 질문</h2>
${FAQ.map(([q, a]) => `        <details>\n          <summary>${esc(q)}</summary>\n          <p>${esc(a)}</p>\n        </details>`).join("\n")}
      </section>`;

// ---------- HTML 파일 갱신 ----------
const TITLE_RE = /[ \t]*<title>[^<]*<\/title>/;
const sitemap = [];

for (const c of categories) {
  const file = `${c.key}.html`;
  const items = products.filter((p) => p.cat === c.key);
  const maxDiscount = Math.max(...items.map((p) => p.discount));
  const minPrice = Math.min(...items.map(salePrice));
  const desc = `${c.name} ${items.length}개 상품 · ${c.subs.join(", ")} · 최대 ${maxDiscount}% 할인, ${won(minPrice)}부터. 5만원 이상 무료배송, 비회원 결제 가능. ${items
    .slice(0, 3)
    .map((p) => p.brand)
    .join(", ")} 인기 상품을 만나보세요.`;

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      ORG,
      WEBSITE,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "홈", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: c.name, item: abs(file) },
        ],
      },
      {
        "@type": "CollectionPage",
        "@id": abs(file),
        url: abs(file),
        name: `${c.name} | ${SITE_NAME}`,
        description: desc,
        inLanguage: "ko-KR",
        isPartOf: { "@id": abs("#website") },
        dateModified: TODAY,
        mainEntity: {
          "@type": "ItemList",
          name: `${c.name} 인기 순위`,
          itemListOrder: "https://schema.org/ItemListOrderDescending",
          numberOfItems: items.length,
          itemListElement: items.map((p, i) => ({ "@type": "ListItem", position: i + 1, item: productLd(p, file) })),
        },
      },
      faqLd,
    ],
  };

  let html = read(file);
  html = replaceBlock(html, "head", headBlock({ file, title: c.name, desc, ld: [ld] }), TITLE_RE, "    ");
  const pageHead = `        <div class="breadcrumb">홈 &gt; ${esc(c.name)}</div>
        <h1 class="page-title">${esc(c.name)}<small>${items.length}개 상품</small></h1>
        <div class="banner">
          <div><strong>${esc(c.banner_title)}</strong><span>${esc(c.banner_desc)} ${maxDiscount}% 할인 · 5만원 이상 무료배송</span></div>
          <em>~${maxDiscount}%</em>
        </div>`;
  html = replaceBlock(html, "page-head", pageHead, /<section class="page-head" id="page-head"><\/section>/, "        ");
  html = replaceBlock(html, "grid", items.map((p, i) => cardHtml(p, i + 1)).join("\n"), /<section class="grid" id="grid"><\/section>/, "      ");
  html = replaceBlock(html, "faq", faqHtml, /\n    <\/main>/, "      ");
  write(file, html);
  sitemap.push({ loc: abs(file), priority: "0.9" });
}

// index: 대표 페이지 (상의로 이동하지만 사이트 정보·FAQ를 담는다)
{
  let html = read("index.html");
  // FAQ 는 화면에 보이는 카테고리 페이지에만 마크업한다 (구조화 데이터는 보이는 내용과 일치해야 함)
  const ld = { "@context": "https://schema.org", "@graph": [ORG, WEBSITE] };
  html = replaceBlock(html, "head", headBlock({ file: "index.html", desc: SITE_DESC, ld: [ld] }), TITLE_RE, "    ");
  write("index.html", html);
}

for (const [file, [title, desc]] of Object.entries(INDEXED)) {
  write(file, replaceBlock(read(file), "head", headBlock({ file, title, desc }), TITLE_RE, "    "));
  sitemap.push({ loc: abs(file), priority: "0.3" });
}
for (const [file, [title, desc]] of Object.entries(NOINDEX)) {
  write(file, replaceBlock(read(file), "head", headBlock({ file, title, desc, robots: "noindex,nofollow" }), TITLE_RE, "    "));
}

// ---------- sitemap.xml / robots.txt ----------
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.map((s) => `  <url><loc>${s.loc}</loc><lastmod>${TODAY}</lastmod><priority>${s.priority}</priority></url>`).join("\n")}
</urlset>
`
);

// 크롤러는 호스트 루트의 robots.txt 만 읽는다 (GitHub Pages 프로젝트 사이트처럼 하위 경로에 배포하면 무시됨).
// 주문서·마이페이지 등은 Disallow 대신 각 HTML 의 noindex 메타로 막는다.
// (Disallow 하면 크롤러가 noindex 를 읽지 못해 헤더 링크로 발견된 URL 이 색인될 수 있다)
// 특정 봇 그룹은 * 그룹 규칙을 상속하지 않으므로 AI 봇을 같은 그룹에 묶어 같은 규칙을 적용한다.
const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Google-Extended"];
write(
  "robots.txt",
  `# STYLEBASE — 검색 엔진과 AI 검색·답변 엔진(GEO) 모두 공개 페이지 수집을 허용한다
User-agent: *
${AI_BOTS.map((b) => `User-agent: ${b}`).join("\n")}
Allow: ${new URL(SITE_URL).pathname}

Sitemap: ${abs("sitemap.xml")}
`
);

// ---------- llms.txt (GEO: AI가 사이트를 요약·인용할 때 쓰는 안내문) ----------
const llms = [
  `# ${SITE_NAME}`,
  "",
  `> ${SITE_DESC}`,
  "",
  "이 문서는 AI 검색·답변 엔진을 위한 사이트 요약입니다. 가격은 할인 적용가(원, 부가세 포함)이며 마지막 갱신일은 " + TODAY + "입니다.",
  "",
  "## 쇼핑 정책",
  "",
  ...FAQ.map(([q, a]) => `- **${q}** ${a}`),
  "",
  "## 카테고리",
  "",
  ...categories.map((c) => `- [${c.name}](${abs(`${c.key}.html`)}): ${c.subs.join(", ")} · ${products.filter((p) => p.cat === c.key).length}개 상품`),
  "- [비회원 주문조회](" + abs("order-lookup.html") + "): 주문번호와 주문자 연락처로 주문 상태 조회",
  "",
  ...categories.flatMap((c) => [
    `## ${c.name} 상품 (인기순)`,
    "",
    ...products
      .filter((p) => p.cat === c.key)
      .map(
        (p) =>
          `- [${p.brand} ${p.name}](${abs(`${c.key}.html#p-${p.id}`)}): ${won(salePrice(p))}${p.discount ? ` (정가 ${won(p.price)}, ${p.discount}% 할인)` : ""} · ${p.sub} · 사이즈 ${p.sizes.join("/")}${inStock(p) ? "" : " · 품절"}`
      ),
    "",
  ]),
].join("\n");
write("llms.txt", llms);

console.log(`SITE_URL=${SITE_URL}\n상품 ${products.length}개, 카테고리 ${categories.length}개, sitemap URL ${sitemap.length}개 생성`);
