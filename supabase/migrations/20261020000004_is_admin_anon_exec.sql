-- products_select 정책이 anon 에서도 is_admin() 을 평가하므로 실행 권한 부여 (anon 은 auth.uid() 가 null 이라 항상 false)
grant execute on function public.is_admin() to anon;
