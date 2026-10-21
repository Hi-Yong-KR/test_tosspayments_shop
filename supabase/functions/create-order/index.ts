// 결제 요청 직전 호출: 금액을 서버에서 재계산하고 pending 주문을 생성한다 (FR-6.2, SR-4)
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

const FREE_SHIPPING_MIN = 50000;
const SHIPPING_FEE = 3000;
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED", message: "허용되지 않는 요청입니다." }, 405);

  const user = await getUser(req);
  if (!user) return json({ code: "UNAUTHORIZED", message: "세션이 없습니다. 새로고침 후 다시 시도해 주세요." }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ code: "BAD_REQUEST", message: "잘못된 요청입니다." }, 400);
  }

  const mode = body.mode === "direct" ? "direct" : "cart";
  const orderer = body.orderer ?? {};
  const ship = body.shipping ?? {};
  const ordererName = str(orderer.name, 50);
  const ordererEmail = str(orderer.email, 100);
  const ordererPhone = digits(orderer.phone);
  const shipRecipient = str(ship.recipient, 50);
  const shipPhone = digits(ship.phone);
  const shipAddress1 = str(ship.address1, 200);

  if (!ordererName) return json({ code: "INVALID_ORDERER", message: "주문자 이름을 입력해 주세요." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ordererEmail)) return json({ code: "INVALID_EMAIL", message: "올바른 이메일을 입력해 주세요." }, 400);
  // 비회원은 주문번호 + 휴대폰으로만 주문을 조회하므로 휴대폰이 필수
  if (!ordererPhone && user.is_anonymous) return json({ code: "INVALID_PHONE", message: "비회원 주문은 휴대폰 번호를 입력해 주세요." }, 400);
  if (ordererPhone && !/^01\d{8,9}$/.test(ordererPhone)) return json({ code: "INVALID_PHONE", message: "휴대폰 번호를 확인해 주세요." }, 400);
  if (!shipRecipient || !/^01\d{8,9}$/.test(shipPhone) || !shipAddress1) {
    return json({ code: "INVALID_SHIPPING", message: "배송지 정보(받는 분, 연락처, 주소)를 입력해 주세요." }, 400);
  }

  // 주문 항목: 장바구니 결제는 DB 장바구니를, 바로 구매는 요청 항목을 사용한다
  let lines: { id: string; size: string; qty: number }[] = [];
  if (mode === "cart") {
    const { data } = await admin.from("cart_items").select("product_id, size, qty").eq("user_id", user.id);
    lines = (data ?? []).map((r) => ({ id: r.product_id, size: r.size, qty: r.qty }));
  } else {
    const merged = new Map<string, { id: string; size: string; qty: number }>();
    for (const i of Array.isArray(body.items) ? body.items.slice(0, 50) : []) {
      const line = { id: str(i?.id, 20), size: str(i?.size, 10), qty: Math.floor(Number(i?.qty)) };
      const key = `${line.id}|${line.size}`;
      const prev = merged.get(key);
      if (prev) prev.qty += line.qty;
      else merged.set(key, line);
    }
    lines = [...merged.values()];
  }
  if (!lines.length) return json({ code: "EMPTY_ORDER", message: "주문할 상품이 없습니다." }, 400);

  const { data: products, error: pErr } = await admin
    .from("products")
    .select("id, name, brand, sale_price, sizes, is_active, free_shipping, product_stock(size, stock)")
    .in("id", [...new Set(lines.map((l) => l.id))]);
  if (pErr) return json({ code: "SERVER_ERROR", message: "상품 정보를 불러오지 못했습니다." }, 500);
  const byId = new Map((products ?? []).map((p) => [p.id, p]));

  const items = [];
  let subtotal = 0;
  let freeItem = false;
  for (const l of lines) {
    const p = byId.get(l.id);
    if (!p || !p.is_active || !p.sizes.includes(l.size) || !Number.isInteger(l.qty) || l.qty < 1 || l.qty > 99) {
      return json({ code: "INVALID_ITEM", message: "주문할 수 없는 상품이 포함되어 있습니다." }, 400);
    }
    const stock = p.product_stock.find((s: any) => s.size === l.size)?.stock ?? 0;
    if (stock < l.qty) return json({ code: "OUT_OF_STOCK", message: `${p.name} (${l.size}) 상품의 재고가 부족합니다.` }, 409);
    subtotal += p.sale_price * l.qty;
    if (p.free_shipping) freeItem = true;
    items.push({ product_id: p.id, name: p.name, brand: p.brand, size: l.size, price: p.sale_price, qty: l.qty });
  }

  // 무료배송 상품이 하나라도 있으면 묶음배송으로 배송비 무료 (calcTotals와 같은 규칙)
  const shippingFee = freeItem || subtotal >= FREE_SHIPPING_MIN ? 0 : SHIPPING_FEE;
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const orderName = totalQty > 1 ? `${items[0].name} 외 ${totalQty - 1}건` : items[0].name;
  const orderId = `ORD-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  const { data: order, error: oErr } = await admin
    .from("orders")
    .insert({
      order_id: orderId,
      user_id: user.id,
      order_name: orderName,
      mode,
      subtotal,
      shipping_fee: shippingFee,
      total: subtotal + shippingFee,
      orderer_name: ordererName,
      orderer_phone: ordererPhone || null,
      orderer_email: ordererEmail,
      ship_recipient: shipRecipient,
      ship_phone: shipPhone,
      ship_zipcode: str(ship.zipcode, 10) || null,
      ship_address1: shipAddress1,
      ship_address2: str(ship.address2, 200) || null,
      is_guest: !!user.is_anonymous,
    })
    .select("id")
    .single();
  if (oErr || !order) return json({ code: "SERVER_ERROR", message: "주문을 생성하지 못했습니다." }, 500);

  const { error: iErr } = await admin.from("order_items").insert(items.map((i) => ({ ...i, order_id: order.id })));
  if (iErr) {
    await admin.from("orders").delete().eq("id", order.id);
    return json({ code: "SERVER_ERROR", message: "주문 상품을 저장하지 못했습니다." }, 500);
  }

  return json({ orderId, orderName, amount: subtotal + shippingFee });
});
