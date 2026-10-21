# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

무신사 스타일의 의류 쇼핑몰입니다. 프런트는 빌드 도구·프레임워크 없이 순수 HTML/CSS/JS이고, 백엔드는 Supabase(PostgreSQL, Auth, Edge Functions)입니다. 결제는 토스페이먼츠 결제위젯(SDK v2)이며 승인·취소는 Edge Function이 서버에서 처리합니다. 요구사항은 `PRD.md`에 있습니다.

## 실행

빌드·린트·테스트 설정은 없습니다. 토스페이먼츠 SDK는 `file://`에서 동작하지 않으므로 반드시 정적 서버로 엽니다.

```bash
npx -y http-server -p 5500 -c-1
```

`.claude/launch.json`에 같은 명령이 `shop` 이름으로 등록되어 있어 `preview_start`로도 띄울 수 있습니다. 진입점은 `index.html`이며 `tops.html`로 리다이렉트됩니다.

## Supabase

- 프로젝트 ref `gyzirnpyqxnqpavtcyse` (서울). 클라이언트에는 URL과 publishable 키만 있고(`js/supabase.js`), `service_role`·토스 시크릿 키는 절대 두지 않습니다.
- 스키마·시드·RLS는 `supabase/migrations/`에서 버전 관리합니다. 변경은 새 마이그레이션 파일을 추가하고 `apply_migration`으로 적용합니다.
- Edge Function 소스는 `supabase/functions/<name>/index.ts`이며 `deploy_edge_function`으로 배포합니다. 각 함수는 CORS/응답 헬퍼를 파일 안에 중복해서 갖고 있습니다.
- **대시보드에서 직접 설정해야 하는 것** (MCP로 불가): Authentication > Sign In / Providers의 **Allow anonymous sign-ins** 켜기, Edge Function 시크릿 `TOSS_SECRET_KEY` 등록. 둘 다 없으면 비회원 세션·결제 승인이 동작하지 않습니다.

### Edge Functions
| 함수 | JWT | 역할 |
|---|---|---|
| `create-order` | O | 서버에서 금액 재계산 후 `pending` 주문 생성. 장바구니 결제는 DB 장바구니를 사용 |
| `confirm-payment` | O | 금액 검증 → 재고 선점 → 토스 승인 → `paid`. `action: "fail"`이면 실패 기록 |
| `cancel-order` | O | 토스 취소 후 재고 복원 |
| `lookup-order` | X | 비회원 주문번호+연락처 조회 (IP당 10분 10회 제한) |
| `merge-guest` | O | 로그인 직후 익명 계정 데이터를 회원 계정으로 병합 |
| `toss-webhook` | X | 웹훅 수신, 토스 조회 API로 재검증 후 상태 반영 |

주문 상태: `pending` → `processing`(승인/취소 진행 중 잠금) → `paid` → `cancelled`, 실패는 `failed`. 재고는 `reserve_stock`/`release_stock` DB 함수(service role 전용)로만 바꿉니다.

## 구조

### 스크립트 로드 순서와 전역 공유
모듈 시스템 없이 `<script>` 태그 순서로 전역 함수·상수를 공유합니다. 모든 페이지는 아래 순서를 지켜야 합니다.

1. `supabase-js` (CDN, 버전 고정)
2. `js/supabase.js` — `sb` 클라이언트, `Auth`(세션·익명 로그인), `callFn()`(Edge Function 호출)
3. `js/products.js` — `PRODUCTS`/`CATEGORIES` 캐시, `loadCatalog()`, `queryProducts()`(목록 DB 쿼리), `salePrice()`, `findProduct()`, `productSvg()`
4. `js/common.js` — 헤더/푸터, `Cart`(DB), `Likes`(DB), `calcTotals`, `toast()`, `won()`, `esc()`, `appReady`
5. 페이지별 스크립트 — `list.js`, `checkout.js`, `auth.js`, `mypage.js`, `order-detail.js`, `order-lookup.js`. `success.html`, `fail.html`은 인라인 스크립트

**페이지 스크립트는 반드시 `appReady.then(...)`으로 시작합니다.** `appReady`는 익명 세션 확보 → 카탈로그 로드 → 장바구니/좋아요 로드 → 레이아웃 렌더가 끝나면 resolve됩니다. 사용자 입력을 `innerHTML`에 넣을 때는 `esc()`를 씁니다.

헤더(`#header`)와 푸터(`#footer`)는 HTML에 빈 태그만 두고 `common.js`의 `renderLayout()`이 채웁니다. 현재 페이지는 `<body data-page="...">`로 구분합니다.

### SEO / AEO / GEO (생성 파일)
`node tools/build-seo.mjs`가 Supabase에서 상품을 읽어 아래를 생성합니다. **상품·가격·카테고리·FAQ를 바꾸면 다시 실행해서 커밋합니다.** 배포 도메인이 다르면 `SITE_URL=https://도메인/`을 지정합니다(기본값은 GitHub Pages 주소).
- 모든 HTML의 `<!-- seo:head -->` 블록: title, description, robots(주문서·마이페이지 등은 `noindex`), canonical, OG/Twitter, JSON-LD
- 카테고리 페이지의 `seo:page-head`, `seo:grid`, `seo:faq` 블록: JS 없이도 읽히는 정적 상품 목록과 FAQ. `#page-head`와 `#grid`는 `list.js`가 같은 마크업으로 다시 그리므로 카드 마크업을 바꾸면 `list.js`와 생성기를 함께 고칩니다.
- `img/products/*.svg`, `sitemap.xml`, `robots.txt`(AI 크롤러 포함), `llms.txt`
- 배포: GitHub Pages(main 루트) `https://hi-yong-kr.github.io/test_tosspayments_shop/`. Google Search Console에 URL 접두어 속성으로 등록되어 있고 sitemap을 제출했습니다. 루트의 `google7bcc345aca290489.html`은 소유권 확인 파일이므로 삭제하지 않습니다.
- `seo:*` 마커 사이는 직접 수정하지 않습니다. FAQ 문구는 생성기의 `FAQ` 배열에서 고치며, 화면 FAQ와 FAQPage 마크업이 항상 같아야 합니다.

### 카테고리 페이지
`tops.html`, `shoes.html`, `pants.html`은 `<title>`과 `data-page` 값, 그리고 생성된 `seo:*` 블록만 다른 동일한 마크업입니다. 하나를 수정하면 나머지 두 파일에도 똑같이 반영해야 합니다. 카테고리를 추가하려면 `categories` 테이블에 행을 추가하고, 같은 키 이름으로 HTML 파일을 만들고, `productSvg()`에 해당 카테고리의 그림을 추가합니다.

### 세션과 비회원 지원
모든 방문자는 Supabase 익명 로그인으로 세션을 받아 장바구니·좋아요·주문이 `user_id`에 묶입니다(`Auth.isMember`는 익명이 아닌 경우). 로그인/가입 직후 `merge-guest`가 익명 계정 데이터를 회원 계정으로 옮기고 익명 계정을 삭제합니다.

### 결제 흐름과 저장소
- `sb_direct`(sessionStorage): "바로 구매" 항목. `checkout.html?mode=direct`일 때 장바구니 대신 사용합니다. 장바구니·좋아요·주문은 모두 DB입니다.
1. `checkout.js`가 화면용 금액을 계산하지만, 결제 직전 `create-order`가 서버에서 다시 계산해 주문을 만들고 `orderId`/`amount`를 돌려줍니다. 서버 금액이 다르면 위젯 금액을 갱신합니다.
2. 위젯은 회원이면 `customerKey = user.id`, 비회원이면 `TossPayments.ANONYMOUS`를 씁니다.
3. `success.html`은 쿼리의 `paymentKey/orderId/amount`를 `confirm-payment`로 보내 승인합니다. `fail.html`은 같은 함수에 실패 사유를 기록합니다.

### 토스페이먼츠 관련 주의사항
- `js/checkout.js`의 `TOSS_CLIENT_KEY`는 문서용 공개 테스트 키(`test_gck_docs_...`)입니다. 실제 키로 바꿀 때는 결제위젯 연동 키의 **클라이언트 키**만 사용하고, 같은 가맹점의 시크릿 키를 `TOSS_SECRET_KEY`로 등록해야 승인이 통과합니다.
- `api.tosspayments.com`은 브라우저에서 직접 호출하지 않습니다.
- `.mcp.json`에 토스페이먼츠 연동 가이드 MCP 서버(`tosspayments-integration-guide`)가 등록되어 있습니다. 토스페이먼츠 SDK·API 관련 작업 시 이 MCP의 문서를 우선 참고합니다.

## 미구현 (PRD P2)
Storage 이미지 업로드, 리뷰, 관리자 페이지(`admin.html`), 쿠폰/적립금, 익명 계정 만료 정리 정책은 아직 없습니다.

## 스타일

- 디자인 토큰은 `css/style.css` 상단 `:root`에 있습니다. 검정/흰색 기반에 할인율은 `--red`, 강조 버튼은 `--blue`를 씁니다.
- 반응형 기준점은 1100px(4열), 900px(3열·주문서 1단), 640px(2열·검색창 숨김)입니다.
- 상품 사진은 없고 `productSvg()`가 상품의 `color`와 `sub`(세부 카테고리)에 따라 SVG를 그립니다.
