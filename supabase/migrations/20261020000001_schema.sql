-- 스키마: 카테고리/상품/재고/회원/장바구니/좋아요/주문 + RLS

-- ---------- 공통 함수 ----------
create or replace function public.sale_price(p_price integer, p_discount integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (round(p_price * (100 - p_discount) / 100.0 / 100.0) * 100)::integer
$$;

-- ---------- 카테고리 / 상품 ----------
create table public.categories (
  id smallint generated always as identity primary key,
  key text not null unique,
  name text not null,
  sort smallint not null default 0,
  subs text[] not null default '{}',
  banner_title text,
  banner_desc text
);

create table public.products (
  id text primary key,
  category_id smallint not null references public.categories (id),
  sub text not null,
  name text not null,
  brand text not null,
  price integer not null check (price >= 0),
  discount_rate smallint not null default 0 check (discount_rate between 0 and 100),
  color text not null default '#f2f2f2',
  sizes text[] not null,
  image_url text,
  rating numeric(2, 1) not null default 0,
  review_count integer not null default 0,
  like_count integer not null default 0,
  free_shipping boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index products_category_id_idx on public.products (category_id);

create table public.product_stock (
  product_id text not null references public.products (id) on delete cascade,
  size text not null,
  stock integer not null default 0 check (stock >= 0),
  primary key (product_id, size)
);

-- ---------- 회원 ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  phone text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, phone)
  values (new.id, new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'phone')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text,
  recipient text not null,
  phone text not null,
  zipcode text,
  address1 text not null,
  address2 text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index addresses_user_id_idx on public.addresses (user_id);

-- ---------- 장바구니 / 좋아요 ----------
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  size text not null,
  qty integer not null default 1 check (qty between 1 and 99),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id, size)
);
create index cart_items_user_id_idx on public.cart_items (user_id);
create index cart_items_product_id_idx on public.cart_items (product_id);

create table public.likes (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index likes_product_id_idx on public.likes (product_id);

create or replace function public.sync_like_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.products set like_count = like_count + 1 where id = new.product_id;
  elsif tg_op = 'DELETE' then
    update public.products set like_count = greatest(like_count - 1, 0) where id = old.product_id;
  end if;
  return null;
end;
$$;

create trigger likes_sync_count
  after insert or delete on public.likes
  for each row execute function public.sync_like_count();

-- ---------- 주문 ----------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique check (order_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  user_id uuid references auth.users (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'cancelled', 'failed', 'refunded')),
  order_name text not null,
  mode text not null default 'cart' check (mode in ('cart', 'direct')),
  subtotal integer not null check (subtotal >= 0),
  shipping_fee integer not null default 0 check (shipping_fee >= 0),
  total integer not null check (total >= 0),
  orderer_name text not null,
  orderer_phone text,
  orderer_email text not null,
  ship_recipient text,
  ship_phone text,
  ship_zipcode text,
  ship_address1 text,
  ship_address2 text,
  payment_key text,
  payment_method text,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  fail_code text,
  fail_message text,
  stock_reserved boolean not null default false,
  is_guest boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_created_idx on public.orders (user_id, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id text not null references public.products (id),
  name text not null,
  brand text,
  size text not null,
  price integer not null check (price >= 0),
  qty integer not null check (qty between 1 and 99)
);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

-- 비회원 주문 조회 시도 기록 (service role 전용)
create table public.lookup_attempts (
  id bigint generated always as identity primary key,
  client text not null,
  attempted_at timestamptz not null default now()
);
create index lookup_attempts_client_idx on public.lookup_attempts (client, attempted_at desc);

-- ---------- 재고 (원자적 처리, service role 전용) ----------
create or replace function public.reserve_stock(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  it record;
  reserved boolean;
begin
  select stock_reserved into reserved from public.orders where id = p_order for update;
  if reserved is null then
    raise exception 'order_not_found';
  end if;
  if reserved then
    return;
  end if;

  for it in select product_id, size, qty from public.order_items where order_id = p_order loop
    update public.product_stock
       set stock = stock - it.qty
     where product_id = it.product_id and size = it.size and stock >= it.qty;
    if not found then
      raise exception 'out_of_stock:%:%', it.product_id, it.size;
    end if;
  end loop;

  update public.orders set stock_reserved = true, updated_at = now() where id = p_order;
end;
$$;

create or replace function public.release_stock(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  it record;
  reserved boolean;
begin
  select stock_reserved into reserved from public.orders where id = p_order for update;
  if not coalesce(reserved, false) then
    return;
  end if;

  for it in select product_id, size, qty from public.order_items where order_id = p_order loop
    update public.product_stock
       set stock = stock + it.qty
     where product_id = it.product_id and size = it.size;
  end loop;

  update public.orders set stock_reserved = false, updated_at = now() where id = p_order;
end;
$$;

-- 비회원(익명) 계정 데이터를 로그인 계정으로 병합
create or replace function public.merge_guest_data(p_guest uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_guest = p_user then
    return;
  end if;

  insert into public.cart_items (user_id, product_id, size, qty)
  select p_user, product_id, size, qty from public.cart_items where user_id = p_guest
  on conflict (user_id, product_id, size)
  do update set qty = least(public.cart_items.qty + excluded.qty, 99), updated_at = now();
  delete from public.cart_items where user_id = p_guest;

  insert into public.likes (user_id, product_id)
  select p_user, product_id from public.likes where user_id = p_guest
  on conflict do nothing;
  delete from public.likes where user_id = p_guest;

  update public.orders set user_id = p_user where user_id = p_guest;
end;
$$;

revoke execute on function public.reserve_stock(uuid) from public, anon, authenticated;
revoke execute on function public.release_stock(uuid) from public, anon, authenticated;
revoke execute on function public.merge_guest_data(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_stock(uuid) to service_role;
grant execute on function public.release_stock(uuid) to service_role;
grant execute on function public.merge_guest_data(uuid, uuid) to service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.sync_like_count() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------- RLS ----------
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_stock enable row level security;
alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.cart_items enable row level security;
alter table public.likes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.lookup_attempts enable row level security;

-- 카탈로그: 누구나 조회, 쓰기는 admin만
create policy categories_select on public.categories for select to anon, authenticated using (true);
create policy categories_insert on public.categories for insert to authenticated with check ((select public.is_admin()));
create policy categories_update on public.categories for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy categories_delete on public.categories for delete to authenticated using ((select public.is_admin()));

create policy products_select on public.products for select to anon, authenticated using (is_active or (select public.is_admin()));
create policy products_insert on public.products for insert to authenticated with check ((select public.is_admin()));
create policy products_update on public.products for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy products_delete on public.products for delete to authenticated using ((select public.is_admin()));

create policy stock_select on public.product_stock for select to anon, authenticated using (true);
create policy stock_insert on public.product_stock for insert to authenticated with check ((select public.is_admin()));
create policy stock_update on public.product_stock for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy stock_delete on public.product_stock for delete to authenticated using ((select public.is_admin()));

-- 프로필: 본인 조회/수정 (role 변경 불가: 컬럼 권한으로 제한)
create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated, anon;
grant update (name, phone) on public.profiles to authenticated;

-- 본인 행만 CRUD
create policy addresses_all on public.addresses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy cart_items_all on public.cart_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy likes_all on public.likes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 주문: 본인 SELECT만 (쓰기는 service role)
create policy orders_select on public.orders for select to authenticated using (user_id = (select auth.uid()));
create policy order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id and o.user_id = (select auth.uid())));

-- 쓰기 권한 제거 (RLS 이중 방어)
revoke insert, update, delete on public.orders, public.order_items from anon, authenticated;
revoke all on public.lookup_attempts from anon, authenticated;
revoke all on public.cart_items, public.likes, public.addresses, public.profiles from anon;
