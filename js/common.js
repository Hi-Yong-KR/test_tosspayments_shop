// 공통: 헤더/푸터, 장바구니, 토스트
const CART_KEY = "sb_cart";
const LIKE_KEY = "sb_likes";
const FREE_SHIPPING_MIN = 50000;
const SHIPPING_FEE = 3000;

const won = (n) => n.toLocaleString("ko-KR") + "원";

function readStore(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch (e) {
    return fallback;
  }
}
function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

// ---------- 장바구니 ----------
const Cart = {
  items() {
    return readStore(CART_KEY, []).filter((i) => findProduct(i.id));
  },
  save(items) {
    writeStore(CART_KEY, items);
    renderCartCount();
    renderDrawer();
  },
  add(id, size, qty) {
    const items = this.items();
    const hit = items.find((i) => i.id === id && i.size === size);
    if (hit) hit.qty = Math.min(hit.qty + qty, 99);
    else items.push({ id, size, qty });
    this.save(items);
  },
  setQty(index, qty) {
    const items = this.items();
    if (!items[index]) return;
    items[index].qty = Math.max(1, Math.min(qty, 99));
    this.save(items);
  },
  remove(index) {
    const items = this.items();
    items.splice(index, 1);
    this.save(items);
  },
  clear() {
    this.save([]);
  },
  count() {
    return this.items().reduce((s, i) => s + i.qty, 0);
  },
};

// 주문 금액 계산 (장바구니 또는 바로구매 항목)
function calcTotals(items) {
  const lines = items.map((i) => {
    const p = findProduct(i.id);
    return { ...i, product: p, unit: salePrice(p), total: salePrice(p) * i.qty, origin: p.price * i.qty };
  });
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const origin = lines.reduce((s, l) => s + l.origin, 0);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_MIN ? 0 : SHIPPING_FEE;
  return { lines, origin, discount: origin - subtotal, subtotal, shipping, total: subtotal + shipping };
}

// ---------- 레이아웃 ----------
function renderLayout() {
  const page = document.body.dataset.page;
  const header = document.getElementById("header");
  if (header) {
    header.innerHTML = `
      <div class="top-bar">
        <div class="inner">
          <a href="tops.html" class="logo">STYLEBASE</a>
          <label class="search">
            <input type="search" id="search-input" placeholder="브랜드, 상품명을 검색하세요" />
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
          </label>
          <div class="top-actions">
            <button type="button" class="cart-btn" id="open-cart" aria-label="장바구니">
              <svg viewBox="0 0 24 24"><path d="M5 7h14l-1.2 12.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
              <span class="cart-count" id="cart-count"></span>
              <span>장바구니</span>
            </button>
          </div>
        </div>
      </div>
      <nav class="gnb">
        <div class="inner">
          ${Object.entries(CATEGORIES)
            .map(([key, c]) => `<a href="${key}.html" class="${page === key ? "active" : ""}">${c.label}</a>`)
            .join("")}
        </div>
      </nav>`;
  }

  const footer = document.getElementById("footer");
  if (footer) {
    footer.innerHTML = `
      <div class="inner">
        <strong>STYLEBASE</strong>
        <p>퍼블리싱 데모 페이지입니다. 상품 정보와 이미지는 모두 예시이며, 결제는 토스페이먼츠 테스트 환경에서 진행됩니다.</p>
        <p style="margin-top:6px">${won(FREE_SHIPPING_MIN)} 이상 구매 시 무료배송 · 기본 배송비 ${won(SHIPPING_FEE)}</p>
      </div>`;
  }

  // 장바구니 드로어 + 토스트
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="drawer-dim" id="drawer-dim"></div>
     <aside class="drawer" id="drawer" aria-label="장바구니">
       <div class="drawer-head"><h3>장바구니</h3><button type="button" id="close-cart" aria-label="닫기">&times;</button></div>
       <div class="drawer-list" id="drawer-list"></div>
       <div class="drawer-foot" id="drawer-foot"></div>
     </aside>
     <div class="toast" id="toast"></div>`
  );

  document.getElementById("open-cart")?.addEventListener("click", openDrawer);
  document.getElementById("close-cart").addEventListener("click", closeDrawer);
  document.getElementById("drawer-dim").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer());

  renderCartCount();
  renderDrawer();
}

function renderCartCount() {
  const el = document.getElementById("cart-count");
  if (el) el.textContent = Cart.count() || "";
}

function openDrawer() {
  document.getElementById("drawer").classList.add("open");
  document.getElementById("drawer-dim").classList.add("open");
}
function closeDrawer() {
  document.getElementById("drawer")?.classList.remove("open");
  document.getElementById("drawer-dim")?.classList.remove("open");
}

function renderDrawer() {
  const list = document.getElementById("drawer-list");
  const foot = document.getElementById("drawer-foot");
  if (!list) return;
  const t = calcTotals(Cart.items());

  if (!t.lines.length) {
    list.innerHTML = `<div class="drawer-empty">장바구니에 담긴 상품이 없습니다.</div>`;
    foot.innerHTML = "";
    return;
  }

  list.innerHTML = t.lines
    .map(
      (l, idx) => `
      <div class="line-item">
        <div class="thumb">${productSvg(l.product)}</div>
        <div>
          <div class="brand">${l.product.brand}</div>
          <div class="name">${l.product.name}</div>
          <div class="opt">사이즈 ${l.size}</div>
          <div class="qty">
            <button type="button" data-act="minus" data-idx="${idx}" aria-label="수량 감소">−</button>
            <span>${l.qty}</span>
            <button type="button" data-act="plus" data-idx="${idx}" aria-label="수량 증가">+</button>
          </div>
        </div>
        <div class="right">
          <button type="button" class="remove" data-act="remove" data-idx="${idx}">삭제</button>
          <span class="lp">${won(l.total)}</span>
        </div>
      </div>`
    )
    .join("");

  foot.innerHTML = `
    <div class="sum-row"><span>상품 금액</span><span>${won(t.origin)}</span></div>
    <div class="sum-row"><span>할인 금액</span><span>-${won(t.discount)}</span></div>
    <div class="sum-row"><span>배송비</span><span>${t.shipping ? won(t.shipping) : "무료"}</span></div>
    <div class="sum-row total"><span>결제 예정 금액</span><span>${won(t.total)}</span></div>
    <a href="checkout.html" class="btn btn-blue" style="margin-top:8px">${won(t.total)} 구매하기</a>`;

  list.querySelectorAll("button[data-act]").forEach((b) => {
    const idx = Number(b.dataset.idx);
    const line = t.lines[idx];
    b.addEventListener("click", () => {
      if (b.dataset.act === "remove") Cart.remove(idx);
      if (b.dataset.act === "plus") Cart.setQty(idx, line.qty + 1);
      if (b.dataset.act === "minus") Cart.setQty(idx, line.qty - 1);
    });
  });
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

document.addEventListener("DOMContentLoaded", renderLayout);
