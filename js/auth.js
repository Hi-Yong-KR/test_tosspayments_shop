// 로그인 / 회원가입 페이지
// 비회원(익명) 세션의 장바구니·좋아요·주문은 로그인 직후 merge-guest 로 회원 계정에 병합한다 (FR-3.5)

// 이동할 페이지: 같은 사이트의 .html 만 허용 (오픈 리다이렉트 방지)
function nextUrl() {
  const next = new URLSearchParams(location.search).get("next") || "";
  return /^[a-z0-9_-]+\.html(\?[\w=&%-]*)?$/i.test(next) ? next : "tops.html";
}

// 현재 세션이 익명이면 그 토큰을 반환
async function guestTokenIfAny() {
  const { data } = await sb.auth.getSession();
  const s = data.session;
  return s && s.user.is_anonymous ? s.access_token : null;
}

async function mergeGuest(guestToken) {
  if (!guestToken) return;
  const res = await callFn("merge-guest", { guestToken });
  if (!res.ok) console.warn("비회원 데이터 병합 실패:", res.error);
}

const AUTH_ERRORS = {
  "Invalid login credentials": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "Email not confirmed": "이메일 인증이 완료되지 않았습니다. 메일함을 확인해 주세요.",
  "User already registered": "이미 가입된 이메일입니다.",
};
const authMsg = (e) => AUTH_ERRORS[e.message] || (e.message.includes("Password") ? "비밀번호는 6자 이상이어야 합니다." : e.message);

function initLogin() {
  if (Auth.isMember) return (location.href = nextUrl());
  const form = document.getElementById("login-form");
  const hint = document.getElementById("auth-hint");
  document.getElementById("to-signup").href = "signup.html" + location.search;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    hint.textContent = "";
    const guestToken = await guestTokenIfAny();
    const { error } = await sb.auth.signInWithPassword({
      email: form.email.value.trim(),
      password: form.password.value,
    });
    if (error) {
      hint.textContent = authMsg(error);
      btn.disabled = false;
      return;
    }
    await mergeGuest(guestToken);
    location.href = nextUrl();
  });
}

function initSignup() {
  if (Auth.isMember) return (location.href = nextUrl());
  const form = document.getElementById("signup-form");
  const hint = document.getElementById("auth-hint");
  document.getElementById("to-login").href = "login.html" + location.search;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const phone = form.phone.value.replace(/\D/g, "");
    const password = form.password.value;
    if (!name) return (hint.textContent = "이름을 입력해 주세요.");
    if (phone && !/^01\d{8,9}$/.test(phone)) return (hint.textContent = "휴대폰 번호를 확인해 주세요.");
    if (password.length < 6) return (hint.textContent = "비밀번호는 6자 이상이어야 합니다.");
    if (password !== form.password2.value) return (hint.textContent = "비밀번호 확인이 일치하지 않습니다.");

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    hint.textContent = "";
    const guestToken = await guestTokenIfAny();
    const { data, error } = await sb.auth.signUp({
      email: form.email.value.trim(),
      password,
      options: { data: { name, phone } },
    });
    if (error) {
      hint.textContent = authMsg(error);
      btn.disabled = false;
      return;
    }
    if (data.session) {
      await mergeGuest(guestToken);
      location.href = nextUrl();
    } else {
      // 이메일 인증이 필요한 설정: 인증 후 로그인하면 비회원 데이터가 병합된다
      form.hidden = true;
      hint.textContent = "";
      document.getElementById("signup-done").hidden = false;
    }
  });
}

appReady.then(() => {
  if (document.getElementById("login-form")) initLogin();
  if (document.getElementById("signup-form")) initSignup();
});
