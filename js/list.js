// 카테고리 상품 목록 페이지 (상의 / 신발 / 바지)
const DIRECT_KEY = "sb_direct";

const state = { sub: "전체", sort: "rank", keyword: "" };
let modalState = null;

function initList() {
  const cat = document.body.dataset.page;
  const info = CATEGORIES[cat];
  const items = PRODUCTS.filter((p) => p.cat === cat);
  const maxDiscount = Math.max(...items.map((p) => p.discount));

  document.getElementById("page-head").innerHTML = `
    <div class="breadcrumb">홈 &gt; ${info.label}</div>
    <h1 class="page-title">${info.label}<small>${items.length}개 상품</small></h1>
    <div class="banner">
      <div><strong>${info.banner[0]}</strong><span>${info.banner[1]} ${maxDiscount}% 할인 · 5만원 이상 무료배송</span></div>
      <em>~${maxDiscount}%</em>
    </div>`;

  const chips = document.getElementById("chips");
  chips.innerHTML = ["전체", ...info.subs].map((s) => `<button type="button" class="chip" data-sub="${s}">${s}</button>`).join("");
  chips.addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    state.sub = b.dataset.sub;
    renderGrid();
  });

  document.getElementById("sort").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.sort = b.dataset.sort;
    renderGrid();
  });

  document.getElementById("search-input")?.addEventListener("input", (e) => {
    state.keyword = e.target.value.trim().toLowerCase();
    renderGrid();
  });

  document.getElementById("grid").addEventListener("click", (e) => {
    const like = e.target.closest(".like");
    const card = e.target.closest(".card");
    if (like) {
      e.stopPropagation();
      toggleLike(like.dataset.id, like);
      return;
    }
    if (card) openModal(card.dataset.id);
  });

  document.getElementById("grid").addEventListener("keydown", (e) => {
    const card = e.target.closest(".card");
    if (card && e.key === "Enter") openModal(card.dataset.id);
  });

  setupModal();
  renderGrid();
}

function renderGrid() {
  const cat = document.body.dataset.page;
  const likes = readStore(LIKE_KEY, []);

  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.sub === state.sub));
  document.querySelectorAll("#sort button").forEach((b) => b.classList.toggle("active", b.dataset.sort === state.sort));

  // 랭킹은 좋아요 수 기준
  const ranked = PRODUCTS.filter((p) => p.cat === cat).sort((a, b) => b.likes - a.likes);
  const rankOf = Object.fromEntries(ranked.map((p, i) => [p.id, i + 1]));

  let list = ranked.filter(
    (p) =>
      (state.sub === "전체" || p.sub === state.sub) &&
      (!state.keyword || (p.brand + " " + p.name).toLowerCase().includes(state.keyword))
  );

  const sorters = {
    rank: (a, b) => rankOf[a.id] - rankOf[b.id],
    low: (a, b) => salePrice(a) - salePrice(b),
    high: (a, b) => salePrice(b) - salePrice(a),
    discount: (a, b) => b.discount - a.discount,
    review: (a, b) => b.reviews - a.reviews,
  };
  list = list.slice().sort(sorters[state.sort]);

  const grid = document.getElementById("grid");
  if (!list.length) {
    grid.innerHTML = `<div class="empty">조건에 맞는 상품이 없습니다.</div>`;
    return;
  }

  grid.innerHTML = list
    .map(
      (p) => `
      <article class="card" data-id="${p.id}" tabindex="0">
        <div class="thumb">
          ${productSvg(p)}
          ${state.sort === "rank" ? `<span class="rank">${rankOf[p.id]}</span>` : ""}
          <button type="button" class="like ${likes.includes(p.id) ? "on" : ""}" data-id="${p.id}" aria-label="좋아요">
            <svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3z"/></svg>
          </button>
        </div>
        <div class="info">
          <div class="brand">${p.brand}</div>
          <div class="name">${p.name}</div>
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
      </article>`
    )
    .join("");
}

function formatCount(n) {
  return n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, "") + "만" : n.toLocaleString("ko-KR");
}

function toggleLike(id, btn) {
  const likes = readStore(LIKE_KEY, []);
  const on = !likes.includes(id);
  writeStore(LIKE_KEY, on ? [...likes, id] : likes.filter((x) => x !== id));
  btn.classList.toggle("on", on);
  toast(on ? "좋아요에 추가했습니다." : "좋아요를 취소했습니다.");
}

// ---------- 퀵뷰 모달 ----------
function setupModal() {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="dim" id="dim" role="dialog" aria-modal="true">
       <div class="modal" id="modal"></div>
     </div>`
  );
  const dim = document.getElementById("dim");
  dim.addEventListener("click", (e) => e.target === dim && closeModal());
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeModal());
}

function openModal(id) {
  const p = findProduct(id);
  modalState = { id, size: null, qty: 1 };
  document.getElementById("modal").innerHTML = `
    <button type="button" class="modal-close" aria-label="닫기">&times;</button>
    <div class="thumb">${productSvg(p)}</div>
    <div class="modal-body">
      <div class="brand">${p.brand}</div>
      <h2>${p.name}</h2>
      <div class="modal-price">
        ${p.discount ? `<div class="origin">${won(p.price)}</div>` : ""}
        <div>${p.discount ? `<span class="discount">${p.discount}%</span>` : ""}<span class="now">${won(salePrice(p))}</span></div>
      </div>
      <div class="meta"><span><span class="star">★</span> ${p.rating}</span><span>후기 ${p.reviews.toLocaleString("ko-KR")}개</span><span>${p.free ? "무료배송" : "배송비 " + won(SHIPPING_FEE)}</span></div>
      <div>
        <div class="field-label">사이즈</div>
        <div class="sizes">${p.sizes.map((s) => `<button type="button" class="size" data-size="${s}">${s}</button>`).join("")}</div>
      </div>
      <div>
        <div class="field-label">수량</div>
        <div class="qty"><button type="button" data-q="-1" aria-label="수량 감소">−</button><span id="m-qty">1</span><button type="button" data-q="1" aria-label="수량 증가">+</button></div>
      </div>
      <div class="total-line"><span>총 상품 금액</span><strong id="m-total">${won(salePrice(p))}</strong></div>
      <div class="hint" id="m-hint"></div>
      <div class="btn-row">
        <button type="button" class="btn" id="m-cart">장바구니</button>
        <button type="button" class="btn btn-black" id="m-buy">바로 구매</button>
      </div>
    </div>`;

  const modal = document.getElementById("modal");
  modal.querySelector(".modal-close").addEventListener("click", closeModal);
  modal.querySelectorAll(".size").forEach((b) =>
    b.addEventListener("click", () => {
      modalState.size = b.dataset.size;
      modal.querySelectorAll(".size").forEach((x) => x.classList.toggle("active", x === b));
      document.getElementById("m-hint").textContent = "";
    })
  );
  modal.querySelectorAll("[data-q]").forEach((b) =>
    b.addEventListener("click", () => {
      modalState.qty = Math.max(1, Math.min(99, modalState.qty + Number(b.dataset.q)));
      document.getElementById("m-qty").textContent = modalState.qty;
      document.getElementById("m-total").textContent = won(salePrice(p) * modalState.qty);
    })
  );
  document.getElementById("m-cart").addEventListener("click", () => {
    if (!requireSize()) return;
    Cart.add(modalState.id, modalState.size, modalState.qty);
    closeModal();
    toast("장바구니에 담았습니다.");
  });
  document.getElementById("m-buy").addEventListener("click", () => {
    if (!requireSize()) return;
    try {
      sessionStorage.setItem(DIRECT_KEY, JSON.stringify([{ id: modalState.id, size: modalState.size, qty: modalState.qty }]));
    } catch (e) {}
    location.href = "checkout.html?mode=direct";
  });

  document.getElementById("dim").classList.add("open");
  document.body.style.overflow = "hidden";
}

function requireSize() {
  if (modalState.size) return true;
  document.getElementById("m-hint").textContent = "사이즈를 선택해 주세요.";
  return false;
}

function closeModal() {
  document.getElementById("dim")?.classList.remove("open");
  document.body.style.overflow = "";
}

document.addEventListener("DOMContentLoaded", initList);
