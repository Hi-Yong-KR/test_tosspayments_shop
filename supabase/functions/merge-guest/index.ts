// 로그인 직후 호출: 익명(비회원) 계정의 장바구니·좋아요·주문을 로그인 계정으로 병합한다 (FR-3.5)
// Authorization = 로그인한 회원의 토큰, body.guestToken = 병합할 익명 계정의 토큰
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED", message: "허용되지 않는 요청입니다." }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, "");
  const { data: me } = await admin.auth.getUser(token);
  if (!me.user || me.user.is_anonymous) return json({ code: "UNAUTHORIZED", message: "회원 로그인이 필요합니다." }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ code: "BAD_REQUEST", message: "잘못된 요청입니다." }, 400);
  }
  const { data: guest } = await admin.auth.getUser(String(body.guestToken ?? ""));
  // 익명 계정만 병합 대상 (다른 회원의 데이터를 가져올 수 없도록)
  if (!guest.user || !guest.user.is_anonymous) return json({ code: "INVALID_GUEST", message: "병합할 비회원 세션이 아닙니다." }, 400);

  const { error } = await admin.rpc("merge_guest_data", { p_guest: guest.user.id, p_user: me.user.id });
  if (error) return json({ code: "SERVER_ERROR", message: "비회원 데이터를 병합하지 못했습니다." }, 500);

  // 병합이 끝난 익명 계정은 정리한다
  await admin.auth.admin.deleteUser(guest.user.id);
  return json({ ok: true });
});
