# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

무신사 스타일의 의류 쇼핑몰 퍼블리싱 프로젝트입니다. 빌드 도구, 프레임워크, 패키지 의존성 없이 순수 HTML/CSS/JS로만 구성되어 있고, 결제는 토스페이먼츠 결제위젯(SDK v2)으로 연동되어 있습니다. 백엔드는 없습니다.

## 실행

빌드·린트·테스트 설정은 없습니다. 토스페이먼츠 SDK는 `file://`에서 동작하지 않으므로 반드시 정적 서버로 엽니다.

```bash
npx -y http-server -p 5500 -c-1
```

`.claude/launch.json`에 같은 명령이 `shop` 이름으로 등록되어 있어 `preview_start`로도 띄울 수 있습니다. 진입점은 `index.html`이며 `tops.html`로 리다이렉트됩니다.

## 구조

### 스크립트 로드 순서와 전역 공유
모듈 시스템 없이 `<script>` 태그 순서로 전역 함수·상수를 공유합니다. 모든 페이지는 아래 순서를 지켜야 합니다.

1. `js/products.js` — 상품 데이터 `PRODUCTS`, `CATEGORIES`, `salePrice()`, `findProduct()`, 상품 이미지 대신 쓰는 `productSvg()`
2. `js/common.js` — 헤더/푸터 주입, 장바구니(`Cart`), 금액 계산(`calcTotals`), 드로어, `toast()`, `won()`
3. 페이지별 스크립트 — `js/list.js`(카테고리 목록) 또는 `js/checkout.js`(주문서). `success.html`, `fail.html`은 인라인 스크립트

헤더(`#header`)와 푸터(`#footer`)는 HTML에 빈 태그만 두고 `common.js`의 `renderLayout()`이 채웁니다. 현재 페이지는 `<body data-page="...">`로 구분하며, GNB 활성 탭과 `list.js`의 카테고리 필터가 이 값을 씁니다.

### 카테고리 페이지
`tops.html`, `shoes.html`, `pants.html`은 `<title>`과 `data-page` 값만 다른 동일한 마크업입니다. 하나를 수정하면 나머지 두 파일에도 똑같이 반영해야 합니다. 카테고리를 추가하려면 `CATEGORIES`에 항목을 추가하고, 같은 키 이름으로 HTML 파일을 만들고, `productSvg()`에 해당 카테고리의 그림을 추가합니다.

### 결제 흐름과 저장소 키
| 키 | 저장소 | 용도 |
|---|---|---|
| `sb_cart` | localStorage | 장바구니 `[{id, size, qty}]` |
| `sb_likes` | localStorage | 좋아요한 상품 id 목록 |
| `sb_direct` | sessionStorage | "바로 구매" 항목. `checkout.html?mode=direct`일 때 장바구니 대신 사용 |
| `sb_pending_order` | sessionStorage | 결제 요청 직전에 저장하는 `{orderId, amount, mode, ...}` |

1. `checkout.js`가 `calcTotals()`로 금액을 계산하고, 5만원 미만이면 배송비 3,000원을 더합니다.
2. 결제위젯을 `setAmount` → `renderPaymentMethods`/`renderAgreement` 순서로 초기화합니다. 비회원 결제(`TossPayments.ANONYMOUS`)를 씁니다.
3. `requestPayment` 직전에 `sb_pending_order`를 저장합니다. `successUrl`/`failUrl`은 `location.href` 기준 상대 경로로 만듭니다.
4. `success.html`은 쿼리의 `orderId`, `amount`를 `sb_pending_order`와 비교합니다. 일치하면 장바구니로 결제한 경우에만 장바구니를 비웁니다.

### 토스페이먼츠 관련 주의사항
- `js/checkout.js`의 `TOSS_CLIENT_KEY`는 토스페이먼츠 문서용 공개 테스트 키(`test_gck_docs_...`)입니다. 실제 키로 바꿀 때는 결제위젯 연동 키의 **클라이언트 키**만 사용합니다.
- 결제 승인 API(`POST /v1/payments/confirm`)는 시크릿 키가 필요해 서버에서만 호출할 수 있으므로 구현되어 있지 않습니다. 실제 결제를 완료하려면 서버를 추가해 successUrl 진입 후 10분 안에 승인을 호출해야 합니다. 현재 `sessionStorage`를 이용한 금액 검증은 퍼블리싱용 임시 처리입니다.
- `.mcp.json`에 토스페이먼츠 연동 가이드 MCP 서버(`tosspayments-integration-guide`)가 등록되어 있습니다. 토스페이먼츠 SDK·API 관련 작업 시 이 MCP의 문서를 우선 참고합니다.

## 스타일

- 디자인 토큰은 `css/style.css` 상단 `:root`에 있습니다. 검정/흰색 기반에 할인율은 `--red`, 강조 버튼은 `--blue`를 씁니다.
- 반응형 기준점은 1100px(4열), 900px(3열·주문서 1단), 640px(2열·검색창 숨김)입니다.
- 상품 사진은 없고 `productSvg()`가 상품의 `color`와 `sub`(세부 카테고리)에 따라 SVG를 그립니다.
