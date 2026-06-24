alter table public.restaurants
add column if not exists menu_items jsonb not null default '[]'::jsonb;

update public.restaurants
set menu_items = coalesce(
  (
    select jsonb_agg(jsonb_build_object('name', menu_name, 'price', ''))
    from unnest(menus) as menu_name
  ),
  '[]'::jsonb
)
where menu_items = '[]'::jsonb
  and coalesce(array_length(menus, 1), 0) > 0;

alter table public.restaurants
drop constraint if exists restaurants_menu_items_shape;

alter table public.restaurants
add constraint restaurants_menu_items_shape check (
  jsonb_typeof(menu_items) = 'array' and jsonb_array_length(menu_items) <= 6
);
