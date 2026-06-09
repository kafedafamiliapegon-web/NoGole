alter table public.products
  add column if not exists is_favorite boolean not null default false,
  add column if not exists favorite_order integer;

create index if not exists products_favorites_idx
  on public.products (is_favorite, favorite_order, name)
  where is_favorite = true;
