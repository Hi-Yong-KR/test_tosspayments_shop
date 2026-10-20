// 회원 주문 상세 + 취소 (RLS로 본인 주문만 조회됨)
appReady.then(async () => {
  const box = document.getElementById("detail");
  if (!Auth.isMember) return (location.href = "login.html?next=mypage.html");

  const orderId = new URLSearchParams(location.search).get("orderId") || "";
  const { data: o } = await sb.from("orders").select("*, order_items(name, size, price, qty)").eq("order_id", orderId).maybeSingle();
  if (!o) {
    box.innerHTML = `<div class="result"><p>주문을 찾을 수 없습니다.</p><div class="btn-row" style="margin-top:20px"><a href="mypage.html" class="btn btn-black">주문 내역</a></div></div>`;
    return;
  }

  box.innerHTML = `<div class="breadcrumb">홈 &gt; 마이페이지 &gt; 주문 상세</div>
    <h1 class="page-title" style="margin-bottom:16px">주문 상세</h1>
    ${orderDetailHtml(o)}
    <div class="hint" id="cancel-hint"></div>
    <div class="btn-row">
      <a href="mypage.html" class="btn">주문 내역</a>
      ${o.status === "paid" ? `<button type="button" class="btn btn-black" id="cancel-btn">주문 취소</button>` : ""}
    </div>`;

  document.getElementById("cancel-btn")?.addEventListener("click", async (e) => {
    if (!confirm("결제를 취소하고 환불할까요?")) return;
    e.target.disabled = true;
    const res = await callFn("cancel-order", { orderId, reason: "고객 요청에 의한 취소" });
    if (!res.ok) {
      document.getElementById("cancel-hint").textContent = res.error.message || "취소 중 오류가 발생했습니다.";
      e.target.disabled = false;
      return;
    }
    toast("주문이 취소되었습니다.");
    setTimeout(() => location.reload(), 800);
  });
});
