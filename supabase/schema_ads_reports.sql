-- BARJOK ADS — Фаза 5 (analytics/reports): таблица под read-only ссылки для
-- рекламодателей (§57-58 документа). Выполнить после schema_ads.sql.

create table if not exists ads_reports (
  id bigint generated always as identity primary key,
  token text not null unique,
  campaign_id bigint not null references ads_campaigns(id) on delete cascade,
  valid_until timestamptz,
  password text,                 -- опционально, plain (не платёжные данные — риск невысокий)
  include_financial boolean not null default false,
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_ads_reports_token on ads_reports (token);

alter table ads_reports enable row level security;
