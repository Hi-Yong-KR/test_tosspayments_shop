# PRD: 쇼핑몰 Supabase DB 연동

## 1. 개요

### 1.1 배경
현재 프로젝트는 무신사 스타일 의류 쇼핑몰 퍼블리싱(순수 HTML/CSS/JS, 토스페이먼츠 결제위젯 SDK v2)이며 백엔드가 없다. 상품은 `js/products.js`에 하드코딩되어 있고, 장바구니·좋아요·결제 대기 주문은 브라우저 저장소(`sb_cart`, `sb_likes`, `sb_direct`, `sb_pending_order`)에 보관한다. 결제 승인 API는 시크릿 키가 필요해 구현되어 있지 않다.

### 1.2 목표
- Supabase(PostgreSQL, Auth, Edge Functions, Storage)를 백엔드로 도입해 상품·회원·장바구니·좋아요·주문 데이터를 DB로 이전한다.
- **회원 결제와 비회원 결제를 모두 지원**한다.
- Edge Function으로 토스페이먼츠 결제 승인·취소를 서버에서 처리해 실제 결제를 완료할 수 있게 한다.
- **새 Supabase 프로젝트를 생성**해 사용한다.

### 1.3 비목표
- 프론트엔드 프레임워크·빌드 도구 도입 (기존 순수 HTML/CSS/JS 유지)
- 배송사 연동, 실시간 재고 알림
- 다국어, 다중 통화

### 1.4 기술 스택
| 영역 | 기술 |
|---|---|
| 프론트엔드 | 순수 HTML/CSS/JS, `supabase-js` v2 (CDN) |
| DB/인증 | Supabase PostgreSQL, Supabase Auth |
| 서버 로직 | Supabase Edge Functions (Deno) |
| 파일 | Supabase Storage |
| 결제 | 토스페이먼츠 결제위젯 SDK v2 |

## 2. 사용자와 시나리오
| 사용자 | 설명 |
|---|---|
| 비회원 | 가입 없이 상품 조회, 비회원 장바구니, 비회원 결제, 주문번호+연락처 기반 주문 조회 |
| 회원 | 로그인 후 장바구니·좋아요 동기화, 주문 내역, 배송지 관리 |
| 관리자 | 상품·재고·주문 관리 |

## 3. 기능 요구사항

### 3.1 상품·카테고리 (P0)
- FR-1.1 `products`, `categories` 테이블을 만들고 `PRODUCTS`/`CATEGORIES` 하드코딩을 이전한다.
- FR-1.2 목록 페이지(`list.js`)는 카테고리 필터, 정렬(인기/최신/가격), 검색을 DB 쿼리로 수행한다.
- FR-1.3 상품 상세 조회로 `findProduct()`를 대체한다.
- FR-1.4 상품별 사이즈 단위 재고를 관리하고 품절을 표시한다.
- FR-1.5 기존 상품 데이터를 시드 SQL로 이관한다.

### 3.2 회원 인증 (P0)
- FR-2.1 Supabase Auth로 이메일 회원가입·로그인·로그아웃을 제공한다. 소셜 로그인은 선택 적용한다.
- FR-2.2 가입 시 `profiles`(이름, 연락처, 기본 배송지)를 트리거로 자동 생성한다.
- FR-2.3 헤더에 로그인 상태(로그인/마이페이지/로그아웃)를 표시한다.
- FR-2.4 로그인하지 않아도 모든 구매 흐름을 이용할 수 있다(비회원 지원).

### 3.3 비회원 지원 (P0)
- FR-3.1 비회원은 Supabase **익명 로그인(Anonymous Sign-in)** 으로 세션을 발급받아 장바구니·주문을 `user_id`에 묶는다. 이로써 RLS를 비회원에도 일관되게 적용한다.
- FR-3.2 비회원 결제 시 주문자 이름·연락처·이메일·배송지를 입력받는다.
- FR-3.3 토스 결제위젯은 비회원이면 `TossPayments.ANONYMOUS`, 회원이면 `customerKey`(user id 기반 UUID)를 사용한다.
- FR-3.4 비회원 주문 조회: 주문번호 + 주문자 연락처로 조회하는 Edge Function(`lookup-order`)을 제공한다.
- FR-3.5 비회원이 이후 가입/로그인하면 익명 계정의 장바구니·주문을 회원 계정으로 연결(병합)한다.

### 3.4 장바구니 (P0)
- FR-4.1 `cart_items`(user_id, product_id, size, qty)로 `sb_cart`를 대체한다. 동일 (user, product, size)는 수량을 합산한다.
- FR-4.2 회원·비회원 모두 DB 장바구니를 사용한다(비회원은 익명 세션).
- FR-4.3 `Cart` API(`common.js`)의 인터페이스는 유지하고 내부 구현만 DB로 교체한다.
- FR-4.4 "바로 구매"(`sb_direct`)는 DB를 거치지 않고 sessionStorage를 유지해도 된다.

### 3.5 좋아요 (P1)
- FR-5.1 `likes`(user_id, product_id)로 `sb_likes`를 대체한다.
- FR-5.2 상품별 좋아요 수를 집계해 표시한다.

### 3.6 주문·결제 (P0, 핵심)
- FR-6.1 `orders`, `order_items` 테이블에 주문과 주문 당시 상품명·가격·사이즈·수량 스냅샷을 저장한다.
- FR-6.2 결제 요청 직전에 Edge Function `create-order`가 **서버에서 금액을 재계산**(상품 가격·할인·5만원 미만 배송비 3,000원)하고 `pending` 주문을 생성한다. 클라이언트가 보낸 금액은 신뢰하지 않는다. `sb_pending_order`는 대체한다.
- FR-6.3 `success.html`은 쿼리의 `paymentKey`, `orderId`, `amount`를 Edge Function `confirm-payment`에 전달한다.
- FR-6.4 `confirm-payment`는 DB 주문 금액과 `amount`를 비교하고, 일치하면 토스 `POST /v1/payments/confirm`을 호출한다. 시크릿 키는 Edge Function 환경변수에서만 읽는다.
- FR-6.5 승인 성공 시 주문 상태를 `paid`로 변경하고, 재고를 차감하며(트랜잭션), 해당 사용자의 장바구니(장바구니 결제인 경우)를 비운다.
- FR-6.6 `fail.html`은 실패 코드·메시지를 주문에 기록하고 상태를 `failed`로 변경한다.
- FR-6.7 승인 호출은 멱등하게 처리한다(이미 `paid`인 주문은 재승인하지 않음). successUrl 진입 후 10분 내 승인해야 한다.
- FR-6.8 토스 웹훅 수신 Edge Function(`toss-webhook`)으로 가상계좌 입금 등 비동기 상태를 반영한다(P1).

### 3.7 마이페이지 (P1)
- FR-7.1 주문 내역 목록·상세(상태, 상품, 결제 정보).
- FR-7.2 주문 취소/환불: Edge Function `cancel-order`가 토스 결제 취소 API를 호출하고 재고를 복원한다.
- FR-7.3 좋아요 목록.
- FR-7.4 배송지 관리(`addresses` CRUD, 기본 배송지 지정).
- FR-7.5 신규 페이지: `login.html`, `signup.html`, `mypage.html`, `order-detail.html`, `order-lookup.html`(비회원 조회).

### 3.8 선택 기능 (P2)
- FR-8.1 상품 이미지를 Supabase Storage에 업로드하고, 이미지가 없으면 기존 `productSvg()`로 대체한다.
- FR-8.2 상품 리뷰/별점(`reviews`): 구매 확정 회원만 작성.
- FR-8.3 관리자 페이지(`admin.html`): 상품 등록·수정, 재고, 주문 상태 관리. `profiles.role = 'admin'`만 접근.
- FR-8.4 쿠폰/적립금(`coupons`, `user_coupons`, `point_ledger`) 및 주문 금액 계산 반영.

## 4. 데이터 모델

```
categories(id, key, name, sort)
products(id, category_id, sub, name, brand, price, discount_rate, color, sizes[], image_url, is_active, created_at)
product_stock(product_id, size, stock)               -- PK(product_id, size)
profiles(id = auth.users.id, name, phone, role, created_at)
addresses(id, user_id, label, recipient, phone, zipcode, address1, address2, is_default)
cart_items(id, user_id, product_id, size, qty, updated_at)   -- UNIQUE(user_id, product_id, size)
likes(user_id, product_id, created_at)                       -- PK(user_id, product_id)
orders(id, order_id(text unique), user_id, status, subtotal, shipping_fee, total,
       orderer_name, orderer_phone, orderer_email, ship_recipient, ship_phone, ship_zipcode, ship_address1, ship_address2,
       payment_key, payment_method, paid_at, fail_code, fail_message, is_guest, created_at)
order_items(id, order_id, product_id, name, size, price, qty)
reviews(id, user_id, product_id, order_item_id, rating, body, created_at)        -- P2
coupons / user_coupons / point_ledger                                            -- P2
```

- 주문 상태: `pending` → `paid` → `cancelled` / `failed` / `refunded`
- `orders.order_id`는 토스 `orderId`(영문 대소문자·숫자·`-`·`_`, 6~64자)와 동일 규칙으로 서버에서 생성한다.
- 금액은 정수(원 단위)로 저장한다.

## 5. Edge Functions
| 함수 | 역할 | 호출 주체 |
|---|---|---|
| `create-order` | 금액 서버 재계산, `pending` 주문·주문상품 생성, `orderId` 반환 | 결제 요청 직전 |
| `confirm-payment` | 금액 검증 후 토스 승인 호출, 주문 `paid`, 재고 차감, 장바구니 정리 | `success.html` |
| `cancel-order` | 토스 취소 API 호출, 상태 변경, 재고 복원 | 마이페이지/관리자 |
| `lookup-order` | 비회원 주문번호+연락처 조회 | `order-lookup.html` |
| `toss-webhook` | 결제 상태 변경 웹훅 수신 | 토스페이먼츠 |
| `merge-guest` | 익명 계정 데이터를 로그인 계정으로 병합 | 로그인 직후 |

## 6. 보안 요구사항
- SR-1 토스 **시크릿 키는 Edge Function 시크릿에만 저장**한다. 클라이언트·저장소·공개 환경변수에 노출하지 않는다. 브라우저에는 클라이언트 키(`test_ck_*`/`live_ck_*`)와 Supabase **anon(publishable) 키**만 사용한다. `service_role` 키는 클라이언트에 절대 두지 않는다.
- SR-2 `api.tosspayments.com`은 브라우저에서 직접 호출하지 않고 Edge Function만 호출한다.
- SR-3 모든 테이블에 **RLS를 활성화**한다.
  - `products`, `categories`, `product_stock`: 누구나 SELECT, 쓰기는 admin만
  - `cart_items`, `likes`, `addresses`: `user_id = auth.uid()`인 행만 CRUD
  - `orders`, `order_items`: 본인 행 SELECT만 허용, INSERT/UPDATE는 Edge Function(service role)만 수행
  - `profiles`: 본인 SELECT/UPDATE, `role` 변경은 불가
- SR-4 결제 금액은 항상 서버가 계산·검증한다.
- SR-5 `confirm-payment`는 주문 소유자(또는 `orderId` 소지) 검증과 멱등 처리를 한다.
- SR-6 `lookup-order`는 응답에 개인정보를 최소화하고 시도 횟수를 제한한다.
- SR-7 마이그레이션 적용 후 Supabase advisors(보안/성능)를 점검한다.

## 7. 비기능 요구사항
- 성능: 목록 페이지 최초 조회 1초 이내(인덱스: `products(category_id)`, `cart_items(user_id)`, `orders(user_id, created_at)`).
- 호환성: 기존 반응형 기준점(1100/900/640px)과 디자인 토큰 유지.
- 스크립트 로드 순서: `supabase-js`(CDN) → `js/supabase.js`(클라이언트 초기화) → `js/products.js` → `js/common.js` → 페이지 스크립트.
- 실행: `file://`에서 SDK가 동작하지 않으므로 기존처럼 정적 서버(`http-server -p 5500`)로 실행한다.
- 마이그레이션 SQL은 `supabase/migrations/`에서 버전 관리한다.

## 8. 구현 단계
| 단계 | 내용 | 우선순위 |
|---|---|---|
| 0 | 새 Supabase 프로젝트 생성, `js/supabase.js`, 환경 설정 | P0 |
| 1 | 스키마·시드(상품/카테고리/재고), 목록·상세 DB 조회 | P0 |
| 2 | Auth(회원 + 익명 세션), `profiles`, 로그인/가입 페이지 | P0 |
| 3 | 장바구니·좋아요 DB화, 비회원→회원 병합 | P0/P1 |
| 4 | 주문 테이블, `create-order`, `confirm-payment`, 결제 흐름 개편(회원·비회원) | P0 |
| 5 | 마이페이지, `cancel-order`, `lookup-order`, 배송지 | P1 |
| 6 | 웹훅, RLS 점검, advisors 확인 | P1 |
| 7 | Storage 이미지, 리뷰, 관리자, 쿠폰/적립금 | P2 |

## 9. 수용 기준
- 비회원이 로그인 없이 상품을 담고 결제를 완료하면 주문이 `paid`로 기록되고 재고가 줄어든다.
- 회원이 다른 기기에서 로그인해도 장바구니·좋아요가 동일하게 보인다.
- 결제 금액을 클라이언트에서 조작해도 `confirm-payment`가 거부한다.
- 다른 사용자의 주문·장바구니는 조회·수정할 수 없다(RLS).
- 비회원이 주문번호+연락처로 주문을 조회할 수 있다.
- 결제 취소 시 토스 취소와 재고 복원이 함께 이루어진다.
- 저장소와 브라우저 번들에 시크릿 키/`service_role` 키가 존재하지 않는다.

## 10. 리스크·열린 이슈
- 익명 로그인 계정이 누적되므로 만료 계정 정리 정책이 필요하다.
- 재고 차감 시 동시성(초과 판매) 방지를 위해 DB 함수(원자적 UPDATE)로 처리한다.
- 토스 테스트 키(`test_gck_docs_...`)는 문서용이므로, 실결제 검증 전 본인 가맹점의 결제위젯 연동 키로 교체해야 한다.
- 소셜 로그인 제공 범위, 쿠폰/적립금 정책은 P2 착수 전에 확정한다.
