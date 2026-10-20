// 비회원 주문 조회: 주문번호 + 주문자 연락처 (FR-3.4). 개인정보는 최소한만 응답하고 시도 횟수를 제한한다 (SR-6)
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const MAX_ATTEMPTS = 10; // 10분당
const NOT_FOUND = { code: "NOT_FOUND", message: "주문번호 또는 연락처가 일치하는 주문이 없습니다." };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED", message: "허용되지 않는 요청입니다." }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ code: "BAD_REQUEST", message: "잘못된 요청입니다." }, 400);
  }
  const orderId = String(body.orderId ?? "").trim();
  const phone = String(body.phone ?? "").replace(/\D/g, "");
  if (!orderId || !phone) return json({ code: "BAD_REQUEST", message: "주문번호와 연락처를 입력해 주세요." }, 400);

  // 시도 횟수 제한 (클라이언트 IP 기준)
  const client = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("lookup_attempts")
    .select("id", { count: "exact", head: true })
    .eq("client", client)
    .gte("attempted_at", since);
  if ((count ?? 0) >= MAX_ATTEMPTS) {
    return json({ code: "TOO_MANY_ATTEMPTS", message: "조회 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." }, 429);
  }
  await admin.from("lookup_attempts").insert({ client });

  const { data: order } = await admin
    .from("orders")
    .select("order_id, status, order_name, total, shipping_fee, orderer_phone, payment_method, created_at, paid_at, order_items(name, size, price, qty)")
    .eq("order_id", orderId)
    .maybeSingle();
  // 주문 존재 여부를 노출하지 않도록 같은 응답을 돌려준다
  if (!order || !order.orderer_phone || order.orderer_phone !== phone) return json(NOT_FOUND, 404);

  const { orderer_phone: _omit, ...safe } = order;
  return json({ order: safe });
});
