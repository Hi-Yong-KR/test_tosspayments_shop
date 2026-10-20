// Supabase 클라이언트 초기화 (publishable 키만 사용, service_role/시크릿 키는 절대 두지 않는다)
const SUPABASE_URL = "https://gyzirnpyqxnqpavtcyse.supabase.co";
const SUPABASE_KEY = "sb_publishable_vbmcwhGn3Y5xhFZ3R1q9cA_SNEp7rvH";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 세션이 없으면 익명 로그인으로 비회원 세션을 발급한다 (FR-3.1)
async function ensureSession() {
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session;
  const res = await sb.auth.signInAnonymously();
  if (res.error) {
    console.warn("익명 로그인 실패:", res.error.message);
    return null;
  }
  return res.data.session;
}

// 현재 사용자 상태. 익명 계정은 비회원으로 취급한다.
const Auth = {
  user: null,
  async load() {
    let session = await ensureSession();
    if (session) {
      // 저장된 세션의 사용자가 서버에서 삭제됐으면(만료 정리, 병합 등) 세션을 버리고 새로 받는다
      const { error } = await sb.auth.getUser();
      if (error) {
        await sb.auth.signOut({ scope: "local" });
        session = await ensureSession();
      }
    }
    this.user = session ? session.user : null;
    return this.user;
  },
  get isMember() {
    return !!this.user && !this.user.is_anonymous;
  },
};

// Edge Function 호출 (오류 본문을 { code, message }로 돌려준다)
async function callFn(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (!error) return { ok: true, data };
  let payload = null;
  try {
    payload = await error.context.json();
  } catch (e) {}
  return { ok: false, error: payload || { message: error.message } };
}
