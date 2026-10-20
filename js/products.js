// 상품·카테고리 데이터는 Supabase에서 불러온다 (supabase.js가 먼저 로드되어야 함)
let PRODUCTS = [];
let CATEGORIES = {};

// DB 행을 화면에서 쓰는 형태로 변환
function mapProduct(r) {
  const stock = {};
  (r.product_stock || []).forEach((s) => (stock[s.size] = s.stock));
  return {
    id: r.id,
    cat: r.categories ? r.categories.key : "",
    sub: r.sub,
    brand: r.brand,
    name: r.name,
    price: r.price,
    discount: r.discount_rate,
    color: r.color,
    sizes: r.sizes,
    rating: Number(r.rating),
    reviews: r.review_count,
    likes: r.like_count,
    free: r.free_shipping,
    imageUrl: r.image_url,
    stock,
  };
}

const PRODUCT_SELECT = "*, categories(key), product_stock(size, stock)";

// 카테고리와 전체 상품을 캐시에 적재 (장바구니/주문서가 findProduct로 조회)
async function loadCatalog() {
  const [cats, prods] = await Promise.all([
    sb.from("categories").select("*").order("sort"),
    sb.from("products").select(PRODUCT_SELECT).eq("is_active", true),
  ]);
  if (cats.error || prods.error) {
    console.error("카탈로그 로드 실패", cats.error || prods.error);
    return;
  }
  CATEGORIES = Object.fromEntries(
    cats.data.map((c) => [c.key, { label: c.name, subs: c.subs, banner: [c.banner_title, c.banner_desc] }])
  );
  PRODUCTS = prods.data.map(mapProduct);
}

// 목록 조회: 카테고리 필터, 세부 카테고리, 검색, 정렬을 DB 쿼리로 수행 (FR-1.2)
async function queryProducts({ cat, sub, keyword, sort }) {
  let q = sb
    .from("products")
    .select("*, categories!inner(key), product_stock(size, stock)")
    .eq("is_active", true)
    .eq("categories.key", cat);
  if (sub && sub !== "전체") q = q.eq("sub", sub);
  const kw = (keyword || "").replace(/[%,()*\\]/g, " ").trim();
  if (kw) q = q.or(`name.ilike.%${kw}%,brand.ilike.%${kw}%`);
  const orders = {
    rank: ["like_count", false],
    discount: ["discount_rate", false],
    low: ["sale_price", true],
    high: ["sale_price", false],
    review: ["review_count", false],
  };
  const [col, asc] = orders[sort] || orders.rank;
  const { data, error } = await q.order(col, { ascending: asc });
  if (error) throw error;
  return data.map(mapProduct);
}

function salePrice(p) {
  return Math.round((p.price * (100 - p.discount)) / 100 / 100) * 100;
}

function findProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}

// 상품 이미지 대신 카테고리별 SVG 일러스트를 그린다
function productSvg(p) {
  const c = p.color;
  const line = "rgba(0,0,0,.18)";
  let shape = "";

  if (p.cat === "tops") {
    const longSleeve = p.sub !== "반팔";
    shape = longSleeve
      ? `<path d="M85 62 L108 52 Q125 72 142 52 L165 62 L200 120 L196 205 L176 205 L172 125 L168 115 L168 220 L82 220 L82 115 L78 125 L74 205 L54 205 L50 120 Z" fill="${c}" stroke="${line}" stroke-width="2"/>`
      : `<path d="M82 62 L108 52 Q125 72 142 52 L168 62 L205 98 L182 122 L168 110 L168 220 L82 220 L82 110 L68 122 L45 98 Z" fill="${c}" stroke="${line}" stroke-width="2"/>`;
    if (p.sub === "후드") shape += `<path d="M104 54 Q125 20 146 54 Q125 78 104 54 Z" fill="${c}" stroke="${line}" stroke-width="2"/>`;
    if (p.sub === "셔츠") shape += `<path d="M125 70 L125 220" stroke="${line}" stroke-width="2"/><circle cx="125" cy="100" r="2.5" fill="${line}"/><circle cx="125" cy="140" r="2.5" fill="${line}"/><circle cx="125" cy="180" r="2.5" fill="${line}"/>`;
  } else if (p.cat === "shoes") {
    const boot = p.sub === "부츠";
    shape = boot
      ? `<path d="M70 80 L130 80 L132 150 Q160 160 195 172 Q215 180 215 200 L215 208 L60 208 L64 150 Z" fill="${c}" stroke="${line}" stroke-width="2"/>`
      : `<path d="M38 192 Q40 160 62 148 L105 132 Q118 152 150 156 L192 168 Q215 176 215 196 L215 204 L38 204 Z" fill="${c}" stroke="${line}" stroke-width="2"/>`;
    shape += `<rect x="${boot ? 58 : 36}" y="204" width="${boot ? 159 : 181}" height="14" rx="4" fill="#f5f5f5" stroke="${line}" stroke-width="2"/>`;
    if (!boot) shape += `<path d="M98 140 L110 160 M110 136 L122 157 M122 133 L134 155" stroke="${line}" stroke-width="2"/>`;
  } else {
    const shorts = p.sub === "숏팬츠";
    shape = shorts
      ? `<path d="M80 70 L170 70 L180 175 L134 175 L125 115 L116 175 L70 175 Z" fill="${c}" stroke="${line}" stroke-width="2"/>`
      : `<path d="M84 45 L166 45 L176 255 L136 255 L125 115 L114 255 L74 255 Z" fill="${c}" stroke="${line}" stroke-width="2"/>`;
    shape += `<path d="M${shorts ? 80 : 84} ${shorts ? 82 : 57} L${shorts ? 170 : 166} ${shorts ? 82 : 57}" stroke="${line}" stroke-width="2"/>`;
  }

  return `<svg viewBox="0 0 250 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="250" height="300" fill="#f4f4f4"/>
    <ellipse cx="125" cy="${p.cat === "shoes" ? 228 : 268}" rx="80" ry="6" fill="rgba(0,0,0,.06)"/>
    ${shape}
  </svg>`;
}
