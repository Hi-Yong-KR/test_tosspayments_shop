// 상품 데이터 (퍼블리싱용 더미 데이터)
const PRODUCTS = [
  // ---------- 상의 ----------
  { id: "T001", cat: "tops", sub: "반팔", brand: "OVERLAP", name: "오버핏 헤비코튼 로고 반팔 티셔츠", price: 39000, discount: 30, color: "#f2f2f2", sizes: ["S", "M", "L", "XL"], rating: 4.9, reviews: 12840, likes: 41200, free: true },
  { id: "T002", cat: "tops", sub: "후드", brand: "COVERMOOD", name: "에센셜 기모 스웻 후드 집업", price: 79000, discount: 45, color: "#3a3a3a", sizes: ["S", "M", "L", "XL"], rating: 4.8, reviews: 8320, likes: 29500, free: true },
  { id: "T003", cat: "tops", sub: "니트", brand: "NORDIC FIELD", name: "램스울 크루넥 니트 스웨터", price: 69000, discount: 20, color: "#c9b79c", sizes: ["M", "L", "XL"], rating: 4.8, reviews: 3410, likes: 15800, free: true },
  { id: "T004", cat: "tops", sub: "셔츠", brand: "ARCHIVE LAB", name: "옥스포드 오버 셔츠 스카이블루", price: 59000, discount: 15, color: "#a9c4e0", sizes: ["S", "M", "L"], rating: 4.7, reviews: 2190, likes: 9800, free: false },
  { id: "T005", cat: "tops", sub: "긴팔", brand: "TWELVE", name: "피그먼트 다잉 롱슬리브 티셔츠", price: 35000, discount: 25, color: "#6b7a5c", sizes: ["S", "M", "L", "XL"], rating: 4.8, reviews: 5620, likes: 18300, free: true },
  { id: "T006", cat: "tops", sub: "반팔", brand: "MUTED", name: "베이직 무지 반팔 티셔츠 3팩", price: 29000, discount: 10, color: "#1c1c1c", sizes: ["S", "M", "L", "XL", "XXL"], rating: 4.9, reviews: 22100, likes: 52300, free: true },
  { id: "T007", cat: "tops", sub: "후드", brand: "SAINT ROW", name: "빈티지 워싱 그래픽 후드티", price: 89000, discount: 40, color: "#8a4f3d", sizes: ["M", "L", "XL"], rating: 4.6, reviews: 1430, likes: 7600, free: true },
  { id: "T008", cat: "tops", sub: "니트", brand: "HIGHLINE", name: "케이블 하프집업 니트", price: 75000, discount: 35, color: "#2d3a52", sizes: ["S", "M", "L"], rating: 4.7, reviews: 990, likes: 6400, free: true },
  { id: "T009", cat: "tops", sub: "셔츠", brand: "BASIC UNION", name: "릴렉스 스트라이프 셔츠", price: 49000, discount: 0, color: "#dfe6ee", sizes: ["S", "M", "L", "XL"], rating: 4.5, reviews: 640, likes: 3100, free: false },
  { id: "T010", cat: "tops", sub: "긴팔", brand: "OVERLAP", name: "와플 헨리넥 롱슬리브", price: 42000, discount: 20, color: "#e8dcc8", sizes: ["M", "L", "XL"], rating: 4.7, reviews: 1880, likes: 8900, free: true },

  // ---------- 신발 ----------
  { id: "S001", cat: "shoes", sub: "스니커즈", brand: "SOLEMATE", name: "클래식 로우 레더 스니커즈 화이트", price: 99000, discount: 30, color: "#fafafa", sizes: ["250", "260", "270", "280"], rating: 4.9, reviews: 15400, likes: 48700, free: true },
  { id: "S002", cat: "shoes", sub: "러닝화", brand: "TRACK CLUB", name: "에어 쿠션 데일리 러닝화", price: 139000, discount: 25, color: "#3b5bdb", sizes: ["250", "260", "270", "280", "290"], rating: 4.8, reviews: 6720, likes: 22100, free: true },
  { id: "S003", cat: "shoes", sub: "로퍼", brand: "ARCHIVE LAB", name: "페니 로퍼 블랙 레더", price: 119000, discount: 20, color: "#1a1a1a", sizes: ["250", "260", "270", "280"], rating: 4.7, reviews: 2380, likes: 11200, free: true },
  { id: "S004", cat: "shoes", sub: "부츠", brand: "NORDIC FIELD", name: "스웨이드 첼시 부츠", price: 169000, discount: 40, color: "#8b6a4f", sizes: ["250", "260", "270", "280"], rating: 4.8, reviews: 1950, likes: 9400, free: true },
  { id: "S005", cat: "shoes", sub: "스니커즈", brand: "RUNWAY ONE", name: "캔버스 하이탑 스니커즈 블랙", price: 69000, discount: 15, color: "#2b2b2b", sizes: ["240", "250", "260", "270", "280"], rating: 4.8, reviews: 9300, likes: 30100, free: true },
  { id: "S006", cat: "shoes", sub: "러닝화", brand: "TRACK CLUB", name: "경량 메쉬 트레이닝화 그레이", price: 89000, discount: 35, color: "#9aa0a6", sizes: ["250", "260", "270", "280"], rating: 4.6, reviews: 1220, likes: 5300, free: true },
  { id: "S007", cat: "shoes", sub: "스니커즈", brand: "SOLEMATE", name: "레트로 스웨이드 스니커즈 그린", price: 109000, discount: 10, color: "#4f7a5a", sizes: ["250", "260", "270"], rating: 4.7, reviews: 870, likes: 4200, free: true },
  { id: "S008", cat: "shoes", sub: "부츠", brand: "HIGHLINE", name: "워커 레이스업 부츠", price: 189000, discount: 30, color: "#4a3426", sizes: ["260", "270", "280"], rating: 4.8, reviews: 1100, likes: 6800, free: true },

  // ---------- 바지 ----------
  { id: "P001", cat: "pants", sub: "데님", brand: "COVERMOOD", name: "와이드 스트레이트 데님 팬츠 연청", price: 59000, discount: 30, color: "#8fb0d4", sizes: ["S", "M", "L", "XL"], rating: 4.8, reviews: 11300, likes: 37600, free: true },
  { id: "P002", cat: "pants", sub: "슬랙스", brand: "BASIC UNION", name: "세미 와이드 히든밴딩 슬랙스", price: 45000, discount: 20, color: "#2e2e2e", sizes: ["S", "M", "L", "XL", "XXL"], rating: 4.9, reviews: 25800, likes: 61200, free: true },
  { id: "P003", cat: "pants", sub: "트레이닝", brand: "TWELVE", name: "나일론 트랙 팬츠", price: 55000, discount: 25, color: "#1f2d4a", sizes: ["M", "L", "XL"], rating: 4.7, reviews: 3200, likes: 12400, free: true },
  { id: "P004", cat: "pants", sub: "숏팬츠", brand: "OVERLAP", name: "코튼 버뮤다 하프 팬츠", price: 39000, discount: 15, color: "#d6c7a8", sizes: ["S", "M", "L", "XL"], rating: 4.7, reviews: 4100, likes: 14800, free: true },
  { id: "P005", cat: "pants", sub: "데님", brand: "SAINT ROW", name: "빈티지 워싱 루즈핏 데님", price: 79000, discount: 40, color: "#3e5a80", sizes: ["S", "M", "L"], rating: 4.6, reviews: 1760, likes: 8100, free: true },
  { id: "P006", cat: "pants", sub: "슬랙스", brand: "ARCHIVE LAB", name: "투턱 울 블렌드 와이드 슬랙스", price: 89000, discount: 20, color: "#7d7466", sizes: ["S", "M", "L", "XL"], rating: 4.8, reviews: 2050, likes: 9700, free: true },
  { id: "P007", cat: "pants", sub: "트레이닝", brand: "MUTED", name: "기모 스웻 조거 팬츠", price: 35000, discount: 10, color: "#9a9a9a", sizes: ["S", "M", "L", "XL"], rating: 4.8, reviews: 7800, likes: 19900, free: true },
  { id: "P008", cat: "pants", sub: "숏팬츠", brand: "HIGHLINE", name: "카고 나일론 쇼츠", price: 49000, discount: 30, color: "#55613f", sizes: ["M", "L", "XL"], rating: 4.6, reviews: 920, likes: 4600, free: false },
  { id: "P009", cat: "pants", sub: "데님", brand: "NORDIC FIELD", name: "셀비지 스트레이트 생지 데님", price: 129000, discount: 0, color: "#1d2a44", sizes: ["S", "M", "L"], rating: 4.9, reviews: 610, likes: 5200, free: true },
];

const CATEGORIES = {
  tops: { label: "상의", subs: ["반팔", "긴팔", "후드", "니트", "셔츠"], banner: ["상의 위크", "시즌 베스트 상의 최대"] },
  shoes: { label: "신발", subs: ["스니커즈", "러닝화", "로퍼", "부츠"], banner: ["슈즈 페스타", "인기 브랜드 신발 최대"] },
  pants: { label: "바지", subs: ["데님", "슬랙스", "트레이닝", "숏팬츠"], banner: ["팬츠 클리어런스", "데일리 팬츠 최대"] },
};

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
