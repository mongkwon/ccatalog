create index restaurant_proposals_reviewed_by_idx
on public.restaurant_proposals (reviewed_by);

create index restaurant_proposals_restaurant_id_idx
on public.restaurant_proposals (restaurant_id);
