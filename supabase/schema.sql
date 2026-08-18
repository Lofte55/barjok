-- BARJOK: схема БД для админки + будущего Decision Engine.
-- Выполнить целиком в Supabase → SQL Editor → New query → Run.
--
-- Дизайн полей заранее совместим с документом
-- "BARJOK — автоматическая система подтверждения отключений" (incident/user_report/
-- manual_override/confirmation_type), чтобы админку не пришлось переделывать, когда
-- будем добавлять автоматическое community-подтверждение (3 жалобы = OUTAGE и т.д.).
-- Сейчас (фаза 1) реально используется только ручное управление через manual_override —
-- остальные поля просто лежат готовые под будущую автоматику.

create table if not exists incidents (
  id bigint generated always as identity primary key,
  city_id text not null default 'pavlodar',
  address text not null,
  utility_type text not null check (utility_type in ('hot_water','cold_water','electricity','heating','gas')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RESTORED')),
  confirmation_type text not null default 'MANUAL' check (confirmation_type in ('COMMUNITY','OFFICIAL','COMMUNITY_AND_OFFICIAL','MANUAL')),

  first_reported_at timestamptz,
  confirmed_at timestamptz,
  restored_at timestamptz,

  official_start_at timestamptz,
  official_end_at timestamptz,
  official_source text,

  manual_override text not null default 'NONE' check (manual_override in ('NONE','FORCE_OUTAGE','FORCE_RESTORED')),
  manual_override_reason text,
  manual_override_created_at timestamptz,
  manual_override_until timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_incidents_address_utility on incidents (address, utility_type);
create index if not exists idx_incidents_status on incidents (status);

-- Сообщения жителей — пока не заполняется (нет публичного эндпоинта), таблица готова
-- под будущий /api/report-v2 и community-подсчёт голосов.
create table if not exists user_reports (
  id bigint generated always as identity primary key,
  incident_id bigint references incidents(id) on delete set null,
  address text not null,
  utility_type text not null check (utility_type in ('hot_water','cold_water','electricity','heating','gas')),
  reported_state text not null check (reported_state in ('OUTAGE','RESTORED')),
  actor_key text not null,
  reported_at timestamptz not null default now(),
  ip_hash text,
  status text not null default 'VALID' check (status in ('VALID','DUPLICATE','SPAM','REJECTED')),
  message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_reports_address_utility on user_reports (address, utility_type);
create index if not exists idx_reports_actor on user_reports (actor_key);

-- Полная история изменений — ничего не удаляем, только дописываем.
create table if not exists incident_log (
  id bigint generated always as identity primary key,
  incident_id bigint references incidents(id) on delete cascade,
  at timestamptz not null default now(),
  event_type text not null,
  detail jsonb
);

create index if not exists idx_log_incident on incident_log (incident_id);

-- RLS включаем и НЕ добавляем policy — значит publishable(anon)-ключ не увидит
-- ничего вообще, а secret(service_role)-ключ (используется только в серверных
-- функциях, никогда не уходит в браузер) обходит RLS как обычно.
alter table incidents enable row level security;
alter table user_reports enable row level security;
alter table incident_log enable row level security;
