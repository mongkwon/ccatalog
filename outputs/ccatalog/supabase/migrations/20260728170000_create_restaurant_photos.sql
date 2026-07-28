insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'restaurant-photos',
  'restaurant-photos',
  true,
  5242880,
  array['image/jpeg']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.restaurant_photos (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  storage_path text not null unique
    check (
      storage_path like restaurant_id::text || '/%'
      and storage_path ~ '\.jpg$'
      and char_length(storage_path) <= 200
    ),
  alt_text text not null default '' check (char_length(alt_text) <= 120),
  sort_order smallint not null check (sort_order between 0 and 7),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index restaurant_photos_restaurant_sort_idx
on public.restaurant_photos (restaurant_id, sort_order, created_at);

alter table public.restaurant_photos enable row level security;

revoke all on table public.restaurant_photos from anon, authenticated;
grant select on table public.restaurant_photos to anon, authenticated;
grant insert, update (alt_text, sort_order), delete on table public.restaurant_photos to authenticated;

create policy "Public can read restaurant photos"
on public.restaurant_photos
for select
to anon, authenticated
using (true);

create policy "Admins can create restaurant photos"
on public.restaurant_photos
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  )
);

create policy "Admins can update restaurant photos"
on public.restaurant_photos
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

create policy "Admins can delete restaurant photos"
on public.restaurant_photos
for delete
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  )
);

create or replace function private.limit_restaurant_photos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.restaurant_photos
    where restaurant_id = new.restaurant_id
  ) >= 8 then
    raise exception using errcode = 'P0001', message = 'restaurant_photo_limit';
  end if;

  return new;
end;
$$;

revoke all on function private.limit_restaurant_photos() from public, anon, authenticated;

create trigger enforce_restaurant_photo_limit
before insert on public.restaurant_photos
for each row
execute function private.limit_restaurant_photos();

create policy "Admins can upload restaurant photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'restaurant-photos'
  and storage.extension(name) = 'jpg'
  and exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.restaurants
    where id::text = (storage.foldername(name))[1]
  )
);

create policy "Admins can delete restaurant photos from storage"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'restaurant-photos'
  and exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  )
);
