// 토스페이먼츠 웹훅 (PAYMENT_STATUS_CHANGED): 가상계좌 입금, 취소 등 비동기 상태를 반영한다 (FR-6.8)
// 웹훅 본문은 신뢰하지 않고, paymentKey 로 토스 결제 조회 API를 다시 호출해 상태를 확인한다.
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ok = () => new Response("ok", { status: 200 });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const secret = Deno.env.get("TOSS_SECRET_KEY");
  if (!secret) return new Response("misconfigured", { status: 500 });

  const event = await req.json().catch(() => null);
  const paymentKey = event?.data?.paymentKey;
  if (event?.eventType !== "PAYMENT_STATUS_CHANGED" || !paymentKey) return ok();

  const res = await fetch(`https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}`, {
    headers: { Authorization: "Basic " + btoa(secret + ":") },
  });
  if (!res.ok) return new Response("verify failed", { status: 502 }); // 토스가 재시도한다
  const payment = await res.json();

  const { data: order } = await admin.from("orders").select("*").eq("order_id", payment.orderId).maybeSingle();
  if (!order || order.total !== payment.totalAmount) return ok();

  const now = new Date().toISOString();
  if (payment.status === "DONE" && (order.status === "pending" || order.status === "processing")) {
    const { error } = await admin.rpc("reserve_stock", { p_order: order.id });
    if (error) return new Response("stock error", { status: 500 });
    await admin
      .from("orders")
      .update({ status: "paid", payment_key: paymentKey, payment_method: payment.method ?? null, paid_at: payment.approvedAt ?? now, updated_at: now })
      .eq("id", order.id);
  } else if ((payment.status === "CANCELED" || payment.status === "PARTIAL_CANCELED") && order.status !== "cancelled") {
    await admin.rpc("release_stock", { p_order: order.id });
    await admin.from("orders").update({ status: "cancelled", cancelled_at: now, updated_at: now }).eq("id", order.id);
  } else if ((payment.status === "EXPIRED" || payment.status === "ABORTED") && order.status === "pending") {
    await admin
      .from("orders")
      .update({ status: "failed", fail_code: payment.status, fail_message: "결제가 완료되지 않았습니다.", updated_at: now })
      .eq("id", order.id);
  }
  return ok();
});
