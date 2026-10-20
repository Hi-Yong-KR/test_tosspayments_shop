// 공통: 헤더/푸터, 장바구니(DB), 좋아요(DB), 토스트
const FREE_SHIPPING_MIN = 50000;
const SHIPPING_FEE = 3000;

const won = (n) => n.toLocaleString("ko-KR") + "원";

// ---------- 장바구니 (Supabase cart_items, 회원/비회원 모두 세션 user_id 기준) ----------
const Cart = {
  _items: [],
  async load() {
    if (!Auth.user) {
      this._items = [];
      return;
    }
    const { data, error } = await sb.from("cart_items").select("id, product_id, size, qty").order("updated_at");
    if (error) return this._fail(error);
    this._items = data.map((r) => ({ rowId: r.id, id: r.product_id, size: r.size, qty: r.qty })).filter((i) => findProduct(i.id));
  },
  items() {
    return this._items.map((i) => ({ ...i }));
  },
  _render() {
    renderCartCount();
    renderDrawer();
  },
  _fail(error) {
    console.error(error);
    toast("장바구니 처리 중 오류가 발생했습니다.");
  },
  async add(id, size, qty) {
    if (!Auth.user) return this._fail(new Error("세션이 없습니다 (익명 로그인이 꺼져 있을 수 있음)"));
    const hit = this._items.find((i) => i.id === id && i.size === size);
    if (hit) {
      const next = Math.min(hit.qty + qty, 99);
      const { error } = await sb.from("cart_items").update({ qty: next, updated_at: new Date().toISOString() }).eq("id", hit.rowId);
      if (error) return this._fail(error);
      hit.qty = next;
    } else {
      const { data, error } = await sb
        .from("cart_items")
        .insert({ user_id: Auth.user.id, product_id: id, size, qty: Math.min(qty, 99) })
        .select("id")
        .single();
      if (error) return this._fail(error);
      this._items.push({ rowId: data.id, id, size, qty: Math.min(qty, 99) });
    }
    this._render();
  },
  async setQty(index, qty) {
    const item = this._items[index];
    if (!item) return;
    const next = Math.max(1, Math.min(qty, 99));
    const { error } = await sb.from("cart_items").update({ qty: next, updated_at: new Date().toISOString() }).eq("id", item.rowId);
    if (error) return this._fail(error);
    item.qty = next;
    this._render();
  },
  async remove(index) {
    const item = this._items[index];
    if (!item) return;
    const { error } = await sb.from("cart_items").delete().eq("id", item.rowId);
    if (error) return this._fail(error);
    this._items.splice(index, 1);
    this._render();
  },
  async clear() {
    const { error } = await sb.from("cart_items").delete().eq("user_id", Auth.user.id);
    if (error) return this._fail(error);
    this._items = [];
    this._render();
  },
  count() {
    return this._items.reduce((s, i) => s + i.qty, 0);
  },
};

// ---------- 좋아요 (Supabase likes) ----------
const Likes = {
  ids: new Set(),
  async load() {
    if (!Auth.user) return;
    const { data } = await sb.from("likes").select("product_id");
    this.ids = new Set((data || []).map((r) => r.product_id));
  },
  has(id) {
    return this.ids.has(id);
  },
  // 토글 후 현재 상태(true=좋아요)를 반환
  async toggle(id) {
    if (!Auth.user) {
      toast("세션을 만들지 못했습니다. 새로고침해 주세요.");
      return this.has(id);
    }
    const on = !this.has(id);
    const { error } = on
      ? await sb.from("likes").insert({ user_id: Auth.user.id, product_id: id })
      : await sb.from("likes").delete().eq("product_id", id);
    if (error) {
      console.error(error);
      toast("좋아요 처리 중 오류가 발생했습니다.");
      return this.has(id);
    }
    if (on) this.ids.add(id);
    else this.ids.delete(id);
    return on;
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
            ${
              Auth.isMember
                ? `<a href="mypage.html" class="top-link">마이페이지</a><button type="button" class="top-link" id="logout-btn">로그아웃</button>`
                : `<a href="login.html" class="top-link">로그인</a><a href="order-lookup.html" class="top-link">주문조회</a>`
            }
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
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await sb.auth.signOut();
    location.href = "tops.html";
  });
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

// 모든 페이지 스크립트는 appReady 이후에 시작한다: 세션 → 카탈로그 → 장바구니/좋아요 → 레이아웃
const appReady = new Promise((resolve) => {
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await Auth.load();
      await loadCatalog();
      await Promise.all([Cart.load(), Likes.load()]);
    } catch (e) {
      console.error(e);
    }
    renderLayout();
    resolve();
  });
});

// ---------- 공통 유틸 ----------
const ORDER_STATUS = { pending: "결제 대기", processing: "처리 중", paid: "결제 완료", cancelled: "취소됨", failed: "결제 실패", refunded: "환불됨" };

// 사용자 입력을 innerHTML에 넣기 전에 이스케이프
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }) : "-");

// 주문 상세 표 (order-detail / order-lookup 공용)
function orderDetailHtml(o) {
  const items = o.order_items || [];
  const rows = [
    ["주문번호", esc(o.order_id)],
    ["주문상태", `<span class="status ${esc(o.status)}">${esc(ORDER_STATUS[o.status] || o.status)}</span>`],
    ["주문일시", esc(fmtDate(o.created_at))],
    ["결제수단", esc(o.payment_method || "-")],
    ["배송비", o.shipping_fee ? won(o.shipping_fee) : "무료"],
    ["결제금액", `<strong>${won(o.total)}</strong>`],
  ];
  if (o.ship_recipient) {
    rows.push(["받는 분", esc(o.ship_recipient)]);
    rows.push(["배송지", esc([o.ship_address1, o.ship_address2].filter(Boolean).join(" "))]);
  }
  if (o.cancel_reason) rows.push(["취소 사유", esc(o.cancel_reason)]);
  return `
    <h3 style="font-size:17px;font-weight:800;margin-bottom:8px">주문 상품</h3>
    <div>${items
      .map(
        (i) => `<div class="line-item"><div><div class="name">${esc(i.name)}</div><div class="opt">사이즈 ${esc(i.size)} / 수량 ${i.qty}개</div></div><div class="right"><span></span><span class="lp">${won(i.price * i.qty)}</span></div></div>`
      )
      .join("")}</div>
    <dl class="result-table">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
}
