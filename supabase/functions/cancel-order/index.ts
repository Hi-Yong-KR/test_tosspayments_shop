// 주문 취소/환불: 토스 결제 취소 API 호출 후 상태 변경, 재고 복원 (FR-7.2)
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED", message: "허용되지 않는 요청입니다." }, 405);

  const user = await getUser(req);
  if (!user) return json({ code: "UNAUTHORIZED", message: "로그인이 필요합니다." }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ code: "BAD_REQUEST", message: "잘못된 요청입니다." }, 400);
  }
  const reason = String(body.reason ?? "").trim().slice(0, 200) || "고객 요청에 의한 취소";

  const { data: order } = await admin.from("orders").select("*").eq("order_id", String(body.orderId ?? "")).maybeSingle();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isAdmin = profile?.role === "admin";
  if (!order || (order.user_id !== user.id && !isAdmin)) return json({ code: "ORDER_NOT_FOUND", message: "주문을 찾을 수 없습니다." }, 404);
  if (order.status !== "paid" || !order.payment_key) return json({ code: "INVALID_STATUS", message: "취소할 수 없는 주문 상태입니다." }, 409);

  const secret = Deno.env.get("TOSS_SECRET_KEY");
  if (!secret) return json({ code: "SERVER_MISCONFIGURED", message: "결제 서버 설정(TOSS_SECRET_KEY)이 필요합니다." }, 500);

  // 중복 취소 방지: paid → processing 선점
  const { data: claimed } = await admin
    .from("orders")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "paid")
    .select("id")
    .maybeSingle();
  if (!claimed) return json({ code: "IN_PROGRESS", message: "이미 처리 중인 주문입니다." }, 409);

  const res = await fetch(`https://api.tosspayments.com/v1/payments/${encodeURIComponent(order.payment_key)}/cancel`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(secret + ":"),
      "Content-Type": "application/json",
      "Idempotency-Key": `cancel-${order.order_id}`,
    },
    body: JSON.stringify({ cancelReason: reason }),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    await admin.from("orders").update({ status: "paid", updated_at: new Date().toISOString() }).eq("id", order.id);
    return json({ code: result.code ?? "CANCEL_FAILED", message: result.message ?? "결제 취소에 실패했습니다." }, 400);
  }

  await admin.rpc("release_stock", { p_order: order.id });
  await admin
    .from("orders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", order.id);

  return json({ ok: true });
});
