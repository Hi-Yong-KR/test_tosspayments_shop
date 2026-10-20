// success.html / fail.html에서 호출: 금액 검증 후 토스 결제 승인, 재고 차감, 장바구니 정리 (FR-6.3~6.7)
// 토스 시크릿 키는 Edge Function 시크릿(TOSS_SECRET_KEY)에서만 읽는다 (SR-1)
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
async function getUser(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data.user ?? null;
}

const summary = (o: any) => ({
  orderId: o.order_id,
  orderName: o.order_name,
  status: o.status,
  amount: o.total,
  ordererName: o.orderer_name,
  paymentMethod: o.payment_method,
  paymentKey: o.payment_key,
  paidAt: o.paid_at,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED", message: "허용되지 않는 요청입니다." }, 405);

  const user = await getUser(req);
  if (!user) return json({ code: "UNAUTHORIZED", message: "세션이 없습니다." }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ code: "BAD_REQUEST", message: "잘못된 요청입니다." }, 400);
  }
  const orderId = String(body.orderId ?? "");

  const { data: order } = await admin.from("orders").select("*").eq("order_id", orderId).maybeSingle();
  // 주문 소유자만 접근 가능 (SR-5)
  if (!order || order.user_id !== user.id) return json({ code: "ORDER_NOT_FOUND", message: "주문을 찾을 수 없습니다." }, 404);

  // ---------- 결제 실패 기록 (FR-6.6) ----------
  if (body.action === "fail") {
    if (order.status === "pending") {
      await admin
        .from("orders")
        .update({
          status: "failed",
          fail_code: String(body.failCode ?? "").slice(0, 100) || null,
          fail_message: String(body.failMessage ?? "").slice(0, 500) || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("status", "pending");
    }
    return json({ ok: true });
  }

  // ---------- 결제 승인 ----------
  const paymentKey = String(body.paymentKey ?? "");
  const amount = Number(body.amount);
  if (!paymentKey) return json({ code: "BAD_REQUEST", message: "paymentKey가 없습니다." }, 400);

  // 멱등 처리: 이미 승인된 주문은 재승인하지 않는다 (FR-6.7)
  if (order.status === "paid") return json({ ok: true, alreadyPaid: true, order: summary(order) });
  if (order.status !== "pending" && order.status !== "processing") {
    return json({ code: "INVALID_STATUS", message: "승인할 수 없는 주문 상태입니다." }, 409);
  }
  // 금액 위변조 검증 (SR-4)
  if (!Number.isInteger(amount) || amount !== order.total) {
    return json({ code: "AMOUNT_MISMATCH", message: "결제 금액이 주문 금액과 일치하지 않습니다." }, 400);
  }

  const secret = Deno.env.get("TOSS_SECRET_KEY");
  if (!secret) return json({ code: "SERVER_MISCONFIGURED", message: "결제 서버 설정(TOSS_SECRET_KEY)이 필요합니다." }, 500);

  // 동시 승인 방지: pending(또는 2분 넘게 멈춘 processing) → processing 으로 선점
  const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: claimed } = await admin
    .from("orders")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .or(`status.eq.pending,and(status.eq.processing,updated_at.lt.${staleBefore})`)
    .select("id")
    .maybeSingle();
  if (!claimed) return json({ code: "IN_PROGRESS", message: "이미 결제 승인이 진행 중입니다." }, 409);

  const fail = async (code: string, message: string, status: number) => {
    await admin.rpc("release_stock", { p_order: order.id });
    await admin
      .from("orders")
      .update({ status: "failed", fail_code: code, fail_message: message, updated_at: new Date().toISOString() })
      .eq("id", order.id);
    return json({ code, message }, status);
  };

  // 재고 선점 (원자적 차감)
  const { error: stockErr } = await admin.rpc("reserve_stock", { p_order: order.id });
  if (stockErr) {
    const soldOut = stockErr.message.includes("out_of_stock");
    return fail(soldOut ? "OUT_OF_STOCK" : "SERVER_ERROR", soldOut ? "재고가 부족해 주문을 완료할 수 없습니다." : "재고 처리 중 오류가 발생했습니다.", soldOut ? 409 : 500);
  }

  // 토스 결제 승인 API (서버에서만 호출)
  const res = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(secret + ":"),
      "Content-Type": "application/json",
      "Idempotency-Key": order.order_id,
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  const payment = await res.json().catch(() => ({}));
  if (!res.ok) {
    return fail(payment.code ?? "CONFIRM_FAILED", payment.message ?? "결제 승인에 실패했습니다.", 400);
  }

  const { data: paid, error: updErr } = await admin
    .from("orders")
    .update({
      status: "paid",
      payment_key: payment.paymentKey ?? paymentKey,
      payment_method: payment.method ?? null,
      paid_at: payment.approvedAt ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .select("*")
    .single();
  if (updErr || !paid) {
    // 토스 승인은 성공했으므로 재고를 되돌리지 않는다. 재시도하면 idempotent 하게 처리된다.
    return json({ code: "SERVER_ERROR", message: "결제는 승인되었으나 주문 상태 저장에 실패했습니다. 고객센터로 문의해 주세요." }, 500);
  }

  if (order.mode === "cart") await admin.from("cart_items").delete().eq("user_id", user.id);

  return json({ ok: true, order: summary(paid) });
});
