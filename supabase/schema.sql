-- Chefitto — schéma Supabase. À exécuter une fois dans Supabase › SQL editor.
-- Chaque ligne appartient à un utilisateur ; RLS garantit qu'il ne voit que ses données.

create extension if not exists "pgcrypto";

-- Profils ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null default '',
  seeded boolean not null default false,
  household smallint not null default 2 check (household between 1 and 50),
  created_at timestamptz not null default now()
);

-- Migration (bases créées avant le nombre de personnes) : taille du foyer, valeur de départ des recettes.
alter table public.profiles
  add column if not exists household smallint not null default 2 check (household between 1 and 50);

-- Crée le profil automatiquement à l'inscription.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Recettes --------------------------------------------------------------
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  category text not null check (category in ('Entrées', 'Plats', 'Desserts', 'Boissons')),
  price text not null default '—',
  time_min int not null default 10 check (time_min between 1 and 1440),
  level text not null default 'Facile' check (level in ('Facile', 'Moyen', 'Difficile')),
  description text not null default '',
  ingredients text[] not null default '{}',
  steps text[] not null default '{}',
  servings smallint not null default 4 check (servings between 1 and 50),
  image_url text check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 2048)),
  created_at timestamptz not null default now()
);
create index if not exists recipes_user_idx on public.recipes (user_id, created_at desc);

-- Migration (bases créées avant les photos) : photo du plat, importée ou trouvée automatiquement.
alter table public.recipes
  add column if not exists image_url text
  check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 2048));

-- Migration (bases créées avant le nombre de personnes) : personnes pour lesquelles les quantités sont écrites.
alter table public.recipes
  add column if not exists servings smallint not null default 4 check (servings between 1 and 50);

-- Favoris ---------------------------------------------------------------
create table if not exists public.favorites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  primary key (user_id, recipe_id)
);

-- Frigo -----------------------------------------------------------------
create table if not exists public.fridge_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (category in ('Légume', 'Fruit', 'Viande', 'Poisson', 'Autre')),
  created_at timestamptz not null default now()
);
create index if not exists fridge_user_idx on public.fridge_items (user_id, created_at desc);

-- Planning daté (midi / soir), sur plusieurs semaines --------------------
create table if not exists public.planned_meals (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meal_date date not null,
  meal smallint not null check (meal between 0 and 1),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  primary key (user_id, meal_date, meal)
);
-- Suppression d'une recette : la cascade retrouve ses repas sans parcourir tout le planning.
create index if not exists planned_meals_recipe_idx on public.planned_meals (recipe_id);

-- Ancien planning « semaine type » (jour 0 = lundi, sans date). Gardé pour les anciennes versions de l'app
-- encore en cache ; son contenu est déplacé dans planned_meals par la migration en fin de fichier.
create table if not exists public.plan_entries (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day smallint not null check (day between 0 and 6),
  meal smallint not null check (meal between 0 and 1),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  primary key (user_id, day, meal)
);

-- RLS -------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.recipes enable row level security;
alter table public.favorites enable row level security;
alter table public.fridge_items enable row level security;
alter table public.plan_entries enable row level security;
alter table public.planned_meals enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own recipes" on public.recipes;
create policy "own recipes" on public.recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own favorites" on public.favorites;
create policy "own favorites" on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own fridge" on public.fridge_items;
create policy "own fridge" on public.fridge_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own plan" on public.plan_entries;
create policy "own plan" on public.plan_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own planned meals" on public.planned_meals;
create policy "own planned meals" on public.planned_meals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Migration (bases créées avant le planning daté) : la semaine type devient la semaine en cours
-- (heure de Paris), puis l'ancienne table est vidée. Ré-exécuter le fichier ne déplace donc rien deux fois.
with moved as (
  delete from public.plan_entries returning user_id, day, meal, recipe_id
)
insert into public.planned_meals (user_id, meal_date, meal, recipe_id)
select user_id, date_trunc('week', now() at time zone 'Europe/Paris')::date + day, meal, recipe_id
from moved
on conflict (user_id, meal_date, meal) do nothing;
