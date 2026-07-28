drop policy if exists "Admins can upload restaurant photos" on storage.objects;

create policy "Admins can upload restaurant photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'restaurant-photos'
  and storage.extension(storage.objects.name) = 'jpg'
  and exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.restaurants
    where id::text = (storage.foldername(storage.objects.name))[1]
  )
);
