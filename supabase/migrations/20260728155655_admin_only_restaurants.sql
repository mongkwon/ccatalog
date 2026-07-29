drop policy if exists "Authenticated users can create own restaurants" on public.restaurants;
drop policy if exists "Authenticated users can delete restaurants" on public.restaurants;
drop policy if exists "Authenticated users can update restaurants" on public.restaurants;
drop policy if exists "Public read restaurants" on public.restaurants;

alter table public.restaurants drop column owner_id;

revoke all on table public.restaurants from anon, authenticated;
grant select on table public.restaurants to anon, authenticated;
grant insert, update, delete on table public.restaurants to authenticated;

create policy "Public can read restaurants"
on public.restaurants
for select
to anon, authenticated
using (true);

create policy "Admins can create restaurants"
on public.restaurants
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  )
);

create policy "Admins can update restaurants"
on public.restaurants
for update
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  )
);

create policy "Admins can delete restaurants"
on public.restaurants
for delete
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  )
);

