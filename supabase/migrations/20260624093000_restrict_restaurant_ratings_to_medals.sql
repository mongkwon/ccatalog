alter table public.restaurants alter column rating set default 1;

alter table public.restaurants drop constraint if exists restaurants_rating_check;

alter table public.restaurants
  add constraint restaurants_rating_check check (rating between 1 and 3);
