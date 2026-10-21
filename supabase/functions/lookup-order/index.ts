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

const MAX_ATTEMPTS = 10; // IP당 10분
const MAX_ORDER_FAILS = 5; // 주문번호당 10분. IP 헤더는 클라이언트가 바꿀 수 있으므로 주문번호 기준으로도 막는다
const NOT_FOUND = { code: "NOT_FOUND", message: "주문번호 또는 연락처가 일치하는 주문이 없습니다." };
const TOO_MANY = { code: "TOO_MANY_ATTEMPTS", message: "조회 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED", message: "허용되지 않는 요청입니다." }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ code: "BAD_REQUEST", message: "잘못된 요청입니다." }, 400);
  }
  const orderId = String(body.orderId ?? "").trim().slice(0, 64);
  const phone = String(body.phone ?? "").replace(/\D/g, "");
  if (!orderId || !phone) return json({ code: "BAD_REQUEST", message: "주문번호와 연락처를 입력해 주세요." }, 400);

  // 접두어로 IP 키와 주문 키를 구분해 헤더 값으로 주문 키를 흉내 낼 수 없게 한다
  const client = `ip:${(req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim().slice(0, 64)}`;
  const orderKey = `order:${orderId}`;
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const countSince = async (key: string) =>
    (await admin.from("lookup_attempts").select("id", { count: "exact", head: true }).eq("client", key).gte("attempted_at", since)).count ?? 0;

  const [ipCount, orderFails] = await Promise.all([countSince(client), countSince(orderKey)]);
  if (ipCount >= MAX_ATTEMPTS || orderFails >= MAX_ORDER_FAILS) return json(TOO_MANY, 429);
  await admin.from("lookup_attempts").insert({ client });

  const { data: order } = await admin
    .from("orders")
    .select("order_id, status, order_name, total, shipping_fee, orderer_phone, ship_phone, payment_method, created_at, paid_at, order_items(name, size, price, qty)")
    .eq("order_id", orderId)
    .maybeSingle();
  // 휴대폰 없이 만들어진 예전 주문은 받는 분 연락처로 확인한다
  const expected = order ? order.orderer_phone ?? order.ship_phone : null;
  // 주문 존재 여부를 노출하지 않도록 같은 응답을 돌려준다
  if (!expected || expected !== phone) {
    await admin.from("lookup_attempts").insert({ client: orderKey });
    return json(NOT_FOUND, 404);
  }

  // 오래된 시도 기록 정리 (가끔만)
  if (Math.random() < 0.05) {
    await admin.from("lookup_attempts").delete().lt("attempted_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  }

  const { orderer_phone: _omit, ship_phone: _omit2, ...safe } = order;
  return json({ order: safe });
});
