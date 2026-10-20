// 마이페이지: 주문 내역, 좋아요, 배송지 관리, 내 정보
const panel = () => document.getElementById("mp-panel");
const PANELS = { orders: renderOrders, likes: renderLikes, addresses: renderAddresses, profile: renderProfile };

appReady.then(() => {
  if (!Auth.isMember) return (location.href = "login.html?next=mypage.html");
  document.getElementById("mp-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (b) show(b.dataset.tab);
  });
  show("orders");
});

function show(tab) {
  document.querySelectorAll("#mp-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  panel().innerHTML = `<div class="empty">불러오는 중...</div>`;
  PANELS[tab]();
}

// ---------- 주문 내역 ----------
async function renderOrders() {
  const { data, error } = await sb
    .from("orders")
    .select("order_id, status, order_name, total, created_at")
    .neq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) return (panel().innerHTML = `<div class="empty">주문 내역을 불러오지 못했습니다.</div>`);
  if (!data.length) return (panel().innerHTML = `<div class="empty">주문 내역이 없습니다.</div>`);
  panel().innerHTML = data
    .map(
      (o) => `
      <a class="order-card" href="order-detail.html?orderId=${encodeURIComponent(o.order_id)}">
        <div>
          <div class="oc-meta">${esc(fmtDate(o.created_at))} · ${esc(o.order_id)}</div>
          <div class="oc-name">${esc(o.order_name)}</div>
        </div>
        <div class="oc-right"><div class="status ${esc(o.status)}">${esc(ORDER_STATUS[o.status] || o.status)}</div><div><strong>${won(o.total)}</strong></div></div>
      </a>`
    )
    .join("");
}

// ---------- 좋아요 ----------
function renderLikes() {
  const list = [...Likes.ids].map(findProduct).filter(Boolean);
  if (!list.length) return (panel().innerHTML = `<div class="empty">좋아요한 상품이 없습니다.</div>`);
  panel().innerHTML = `<div class="like-grid">${list
    .map(
      (p) => `
      <div class="like-item">
        <div class="thumb">${productSvg(p)}</div>
        <div class="brand">${esc(p.brand)}</div>
        <div class="name">${esc(p.name)}</div>
        <div class="price-row"><span class="price">${won(salePrice(p))}</span></div>
        <button type="button" class="btn" style="margin-top:8px" data-unlike="${esc(p.id)}">좋아요 취소</button>
      </div>`
    )
    .join("")}</div>`;
  panel().querySelectorAll("[data-unlike]").forEach((b) =>
    b.addEventListener("click", async () => {
      await Likes.toggle(b.dataset.unlike);
      renderLikes();
    })
  );
}

// ---------- 배송지 ----------
async function renderAddresses() {
  const { data, error } = await sb.from("addresses").select("*").order("is_default", { ascending: false }).order("created_at");
  if (error) return (panel().innerHTML = `<div class="empty">배송지를 불러오지 못했습니다.</div>`);
  panel().innerHTML = `
    ${data.length ? data.map(addrCard).join("") : `<div class="empty">등록된 배송지가 없습니다.</div>`}
    <h3 style="font-size:17px;font-weight:800;margin:28px 0 12px">배송지 추가</h3>
    <form class="mp-form" id="addr-form">
      <label>배송지 이름</label><input name="label" placeholder="집, 회사 등" />
      <label>받는 분</label><input name="recipient" required />
      <label>연락처</label><input name="phone" type="tel" placeholder="숫자만 입력" required />
      <label>우편번호</label><input name="zipcode" />
      <label>주소</label><input name="address1" required />
      <label>상세 주소</label><input name="address2" />
      <label></label><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="is_default" style="width:auto;height:auto" /> 기본 배송지로 설정</label>
    </form>
    <div class="hint" id="addr-hint"></div>
    <div class="mp-actions"><button type="button" class="btn btn-black" id="addr-save">배송지 저장</button></div>`;

  panel().querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("이 배송지를 삭제할까요?")) return;
      await sb.from("addresses").delete().eq("id", b.dataset.del);
      renderAddresses();
    })
  );
  panel().querySelectorAll("[data-default]").forEach((b) =>
    b.addEventListener("click", async () => {
      await setDefaultAddress(b.dataset.default);
      renderAddresses();
    })
  );
  document.getElementById("addr-save").addEventListener("click", async () => {
    const f = document.getElementById("addr-form");
    const hint = document.getElementById("addr-hint");
    const phone = f.phone.value.replace(/\D/g, "");
    if (!f.recipient.value.trim() || !f.address1.value.trim()) return (hint.textContent = "받는 분과 주소를 입력해 주세요.");
    if (!/^01\d{8,9}$/.test(phone)) return (hint.textContent = "연락처를 확인해 주세요.");
    const { data: row, error } = await sb
      .from("addresses")
      .insert({
        user_id: Auth.user.id,
        label: f.label.value.trim() || null,
        recipient: f.recipient.value.trim(),
        phone,
        zipcode: f.zipcode.value.trim() || null,
        address1: f.address1.value.trim(),
        address2: f.address2.value.trim() || null,
        is_default: false,
      })
      .select("id")
      .single();
    if (error) return (hint.textContent = "저장 중 오류가 발생했습니다.");
    if (f.is_default.checked || !data.length) await setDefaultAddress(row.id);
    toast("배송지를 저장했습니다.");
    renderAddresses();
  });
}

function addrCard(a) {
  return `
    <div class="addr-card">
      <div>
        <div><strong>${esc(a.label || a.recipient)}</strong> ${a.is_default ? `<span class="default">기본 배송지</span>` : ""}</div>
        <div>${esc(a.recipient)} · ${esc(a.phone)}</div>
        <div>${esc([a.zipcode, a.address1, a.address2].filter(Boolean).join(" "))}</div>
      </div>
      <div>${a.is_default ? "" : `<button type="button" data-default="${esc(a.id)}">기본으로</button>`}<button type="button" data-del="${esc(a.id)}">삭제</button></div>
    </div>`;
}

async function setDefaultAddress(id) {
  await sb.from("addresses").update({ is_default: false }).eq("user_id", Auth.user.id);
  await sb.from("addresses").update({ is_default: true }).eq("id", id);
}

// ---------- 내 정보 ----------
async function renderProfile() {
  const { data } = await sb.from("profiles").select("name, phone").maybeSingle();
  panel().innerHTML = `
    <form class="mp-form" id="profile-form">
      <label>이메일</label><input value="${esc(Auth.user.email)}" disabled />
      <label>이름</label><input name="name" value="${esc(data?.name)}" />
      <label>연락처</label><input name="phone" type="tel" value="${esc(data?.phone)}" placeholder="숫자만 입력" />
    </form>
    <div class="hint" id="profile-hint"></div>
    <div class="mp-actions"><button type="button" class="btn btn-black" id="profile-save">저장</button></div>`;
  document.getElementById("profile-save").addEventListener("click", async () => {
    const f = document.getElementById("profile-form");
    const hint = document.getElementById("profile-hint");
    const phone = f.phone.value.replace(/\D/g, "");
    if (phone && !/^01\d{8,9}$/.test(phone)) return (hint.textContent = "연락처를 확인해 주세요.");
    const { error } = await sb.from("profiles").update({ name: f.name.value.trim() || null, phone: phone || null }).eq("id", Auth.user.id);
    if (error) return (hint.textContent = "저장 중 오류가 발생했습니다.");
    hint.textContent = "";
    toast("내 정보를 저장했습니다.");
  });
}
