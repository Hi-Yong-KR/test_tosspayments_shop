// 주문서 + 토스페이먼츠 결제위젯 연동
// @docs https://docs.tosspayments.com/sdk/v2/js

// TODO: 개발자센터 > API 키 > 결제위젯 연동 키 > 클라이언트 키로 교체하세요.
// 아래 값은 토스페이먼츠 문서용 공개 테스트 키입니다. (실제 돈이 빠져나가지 않음)
const TOSS_CLIENT_KEY = "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm";

const PENDING_KEY = "sb_pending_order";
const DIRECT = "sb_direct";

const isDirect = new URLSearchParams(location.search).get("mode") === "direct";

function getOrderItems() {
  if (isDirect) {
    try {
      return (JSON.parse(sessionStorage.getItem(DIRECT)) || []).filter((i) => findProduct(i.id));
    } catch (e) {
      return [];
    }
  }
  return Cart.items();
}

function makeOrderId() {
  // 6~64자, 영문 대소문자/숫자/-/_ 만 허용
  const rand = Math.random().toString(36).slice(2, 10);
  return `ORD-${Date.now()}-${rand}`;
}

function makeOrderName(lines) {
  const first = lines[0].product.name;
  const rest = lines.reduce((s, l) => s + l.qty, 0) - 1;
  return rest > 0 ? `${first} 외 ${rest}건` : first;
}

async function initCheckout() {
  const items = getOrderItems();
  const t = calcTotals(items);

  if (!t.lines.length) {
    document.querySelector(".checkout").innerHTML = `
      <div class="result" style="grid-column:1/-1">
        <p>주문할 상품이 없습니다.</p>
        <div class="btn-row" style="margin-top:20px"><a href="tops.html" class="btn btn-black">쇼핑 계속하기</a></div>
      </div>`;
    return;
  }

  document.getElementById("item-count").textContent = `${t.lines.length}건`;
  document.getElementById("order-items").innerHTML = t.lines
    .map(
      (l) => `
      <div class="line-item">
        <div class="thumb">${productSvg(l.product)}</div>
        <div>
          <div class="brand">${l.product.brand}</div>
          <div class="name">${l.product.name}</div>
          <div class="opt">사이즈 ${l.size} / 수량 ${l.qty}개</div>
        </div>
        <div class="right"><span></span><span class="lp">${won(l.total)}</span></div>
      </div>`
    )
    .join("");

  document.getElementById("summary").innerHTML = `
    <h3>결제 금액</h3>
    <div class="sum-row"><span>상품 금액</span><span>${won(t.origin)}</span></div>
    <div class="sum-row"><span>할인 금액</span><span>-${won(t.discount)}</span></div>
    <div class="sum-row"><span>배송비</span><span>${t.shipping ? won(t.shipping) : "무료"}</span></div>
    <div class="sum-row total"><span>최종 결제 금액</span><span>${won(t.total)}</span></div>
    <div class="hint" id="pay-hint"></div>
    <button type="button" class="btn btn-blue" id="payment-button" disabled>결제 수단 불러오는 중...</button>
    <p class="notice">주문 내용을 확인했으며, 결제에 동의합니다.<br />테스트 환경이므로 실제 결제는 이루어지지 않습니다.</p>`;

  const button = document.getElementById("payment-button");
  const hint = document.getElementById("pay-hint");

  if (typeof TossPayments === "undefined") {
    hint.textContent = "토스페이먼츠 SDK를 불러오지 못했습니다. 네트워크를 확인해 주세요.";
    button.textContent = "결제 불가";
    return;
  }

  // ------ 결제위젯 초기화 (비회원 결제) ------
  const tossPayments = TossPayments(TOSS_CLIENT_KEY);
  const widgets = tossPayments.widgets({ customerKey: TossPayments.ANONYMOUS });

  // ------ 결제 금액 설정 (렌더링보다 먼저) ------
  const amount = { currency: "KRW", value: t.total };
  await widgets.setAmount(amount);

  try {
    await Promise.all([
      widgets.renderPaymentMethods({ selector: "#payment-method", variantKey: "DEFAULT" }),
      widgets.renderAgreement({ selector: "#agreement", variantKey: "AGREEMENT" }),
    ]);
  } catch (err) {
    hint.textContent = "결제 수단을 불러오지 못했습니다: " + (err.message || err);
    button.textContent = "결제 불가";
    return;
  }

  button.disabled = false;
  button.textContent = `${won(t.total)} 결제하기`;

  button.addEventListener("click", async () => {
    const name = document.getElementById("c-name").value.trim();
    const email = document.getElementById("c-email").value.trim();
    const phone = document.getElementById("c-phone").value.replace(/\D/g, "");

    if (!name) return showHint("이름을 입력해 주세요.", "c-name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showHint("올바른 이메일을 입력해 주세요.", "c-email");
    if (phone && !/^01\d{8,9}$/.test(phone)) return showHint("휴대폰 번호를 확인해 주세요.", "c-phone");
    hint.textContent = "";

    const orderId = makeOrderId();
    const orderName = makeOrderName(t.lines);

    // 실서비스에서는 orderId, amount를 서버에 저장해 결제 승인 시 위변조를 검증해야 합니다.
    // 퍼블리싱 단계이므로 sessionStorage에 보관하고 success 페이지에서 금액을 비교합니다.
    try {
      sessionStorage.setItem(
        PENDING_KEY,
        JSON.stringify({ orderId, orderName, amount: t.total, mode: isDirect ? "direct" : "cart", items, customerName: name })
      );
    } catch (e) {}

    const payload = {
      orderId,
      orderName,
      successUrl: new URL("success.html", location.href).href,
      failUrl: new URL("fail.html", location.href).href,
      customerEmail: email,
      customerName: name,
    };
    if (phone) payload.customerMobilePhone = phone;

    try {
      await widgets.requestPayment(payload);
    } catch (err) {
      // 사용자가 결제창을 닫은 경우 등
      hint.textContent = err.code === "USER_CANCEL" ? "결제를 취소했습니다." : err.message || "결제 요청 중 오류가 발생했습니다.";
    }
  });

  function showHint(msg, focusId) {
    hint.textContent = msg;
    document.getElementById(focusId).focus();
  }
}

document.addEventListener("DOMContentLoaded", initCheckout);
