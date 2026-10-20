-- 할인가 생성 컬럼 (DB 정렬 및 서버 금액 계산에 사용)
alter table public.products
  add column sale_price integer generated always as (public.sale_price(price, discount_rate)) stored;
create index products_like_count_idx on public.products (like_count desc);
