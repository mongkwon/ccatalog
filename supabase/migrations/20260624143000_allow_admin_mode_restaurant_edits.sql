drop policy if exists "Owners can update own restaurants" on public.restaurants;
drop policy if exists "Authenticated users can update restaurants" on public.restaurants;
create policy "Authenticated users can update restaurants"
on public.restaurants
for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

drop policy if exists "Owners can delete own restaurants" on public.restaurants;
drop policy if exists "Authenticated users can delete restaurants" on public.restaurants;
create policy "Authenticated users can delete restaurants"
on public.restaurants
for delete
to authenticated
using ((select auth.uid()) is not null);
