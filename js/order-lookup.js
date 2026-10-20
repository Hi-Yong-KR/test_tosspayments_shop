// 비회원 주문조회 (주문번호 + 연락처, Edge Function lookup-order)
appReady.then(() => {
  const form = document.getElementById("lookup-form");
  const hint = document.getElementById("lookup-hint");
  const params = new URLSearchParams(location.search);
  if (params.get("orderId")) form.orderId.value = params.get("orderId");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    hint.textContent = "";
    const res = await callFn("lookup-order", { orderId: form.orderId.value.trim(), phone: form.phone.value });
    btn.disabled = false;
    if (!res.ok) {
      hint.textContent = res.error.message || "조회 중 오류가 발생했습니다.";
      return;
    }
    document.getElementById("lookup-box").hidden = true;
    const box = document.getElementById("lookup-result");
    box.hidden = false;
    box.innerHTML = `<h1 class="page-title" style="margin-bottom:16px">주문 조회 결과</h1>${orderDetailHtml(res.data.order)}
      <div class="btn-row"><a href="order-lookup.html" class="btn">다시 조회</a><a href="tops.html" class="btn btn-black">쇼핑 계속하기</a></div>`;
  });
});
