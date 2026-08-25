-- Schema Neon pour CabinetsMAP
-- Postgres standard, compatible Vercel Functions + @neondatabase/serverless

-- ============================================================
-- 1. Cabinets (source de verite)
-- ============================================================
create table if not exists cabinets (
  id text primary key,
  nom text not null,
  adresse text,
  phone text,
  emails text[] default '{}',
  tribunaux text[] default '{}',
  cours_appel text[] default '{}',
  departements text[] default '{}',
  couleur text not null default '#1e3a5f',
  badges text[] default '{}',
  display_name text default '',
  place_id text,
  longitude numeric,
  latitude numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Contraintes basiques
alter table cabinets drop constraint if exists chk_cabinets_id_prefix;

alter table cabinets add constraint chk_cabinets_id_prefix check (id ~ '^cabinet-[a-zA-Z0-9_-]+$');

create index if not exists idx_cabinets_departements on cabinets using gin(departements);

create index if not exists idx_cabinets_nom on cabinets using gin(to_tsvector('french', coalesce(nom, '')));

-- ============================================================
-- 2. Departements (reference, optionnel mais pratique)
-- ============================================================
create table if not exists departements (
  code text primary key,
  nom text not null,
  region text,
  geometry jsonb
);

create index if not exists idx_departements_region on departements(region);

-- ============================================================
-- 3. Parametres admin (mot de passe, etc.)
-- ============================================================
create table if not exists admin_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- ============================================================
-- 4. Trigger updated_at
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_cabinets_updated_at on cabinets;

create trigger trg_cabinets_updated_at
  before update on cabinets
  for each row execute function set_updated_at();

-- ============================================================
-- 5. Audit log (qui a fait quoi, quand)
-- ============================================================
-- Note: les apostrophes dans les commentaires cassaient le splitter de
-- run-schema.mjs. Voir neon/migrate-audit-log.mjs pour l'application.
create table if not exists admin_logs (
  id bigserial primary key,
  at timestamptz default now(),
  action text not null,
  cabinet_id text,
  user_sub text default 'admin',
  ip text,
  user_agent text,
  details jsonb
);

create index if not exists idx_admin_logs_at on admin_logs(at desc);
create index if not exists idx_admin_logs_action on admin_logs(action);
create index if not exists idx_admin_logs_cabinet on admin_logs(cabinet_id) where cabinet_id is not null;
