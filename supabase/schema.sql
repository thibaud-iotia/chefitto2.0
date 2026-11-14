-- Chefitto — schéma Supabase. À exécuter une fois dans Supabase › SQL editor.
-- Chaque ligne appartient à un utilisateur ; RLS garantit qu'il ne voit que ses données.

create extension if not exists "pgcrypto";

-- Profils ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null default '',
  seeded boolean not null default false,
  created_at timestamptz not null default now()
);

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
  created_at timestamptz not null default now()
);
create index if not exists recipes_user_idx on public.recipes (user_id, created_at desc);

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

-- Planning (7 jours × midi/soir) ----------------------------------------
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
