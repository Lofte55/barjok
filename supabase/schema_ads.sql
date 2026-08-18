-- BARJOK ADS — Фаза 1: data model + campaign engine (без UI создания, без рендера,
-- без трекинга, без аналитики — это следующие фазы по плану).
-- Выполнить в Supabase → SQL Editor → New query → Run (после supabase/schema.sql).
--
-- Схема покрывает MVP V1 из документа "BARJOK — ADS Management System" (§92):
-- Advertisers, Campaigns (+статусы/targeting/exclusions/pricing/limits/frequency cap),
-- Creatives, Placements, Audit Log. Analytics/ad_events таблица создана заранее
-- (пустая, без ничего пишущего в неё) — engine её сразу использует для frequency cap,
-- когда тречинг появится в фазе 4, ничего не придётся переделывать в схеме.

create table if not exists ads_advertisers (
  id bigint generated always as identity primary key,
  company_name text not null,
  brand_name text,
  legal_name text,
  bin text,
  category text,               -- слаг из ads_categories
  website text,
  status text not null default 'prospect'
    check (status in ('prospect','active','paused','former','blacklisted')),

  contact_person text, contact_position text, contact_phone text,
  contact_whatsapp text, contact_email text, contact_telegram text, contact_comment text,

  logo_url text, brand_image_url text, brand_guidelines_url text, default_ad_image_url text,

  account_manager text, default_price numeric, default_discount numeric,
  payment_terms text, contract_number text, contract_date date, notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists ads_categories (
  slug text primary key,
  name text not null,
  status text not null default 'active' check (status in ('active','archived')),
  recommended_utilities text[] not null default '{}'   -- §83: contextual utility mappings
);

-- Стартовый набор категорий и placements — из документа (§11, §19). Дальше редактируется
-- через /admin/ads/settings (не в этой фазе — UI пока нет, правки через SQL/консоль).
insert into ads_categories (slug, name, recommended_utilities) values
  ('water_delivery', 'Доставка воды', array['cold_water','hot_water']),
  ('water_heaters', 'Водонагреватели', array['hot_water']),
  ('plumbing', 'Сантехника', array['cold_water','hot_water']),
  ('electricians', 'Электрики', array['electricity']),
  ('power_banks', 'Powerbank', array['electricity']),
  ('generators', 'Генераторы', array['electricity']),
  ('heating', 'Отопление', array['heating']),
  ('air_conditioning', 'Кондиционеры', '{}'),
  ('internet', 'Интернет', '{}'),
  ('retail', 'Розница', '{}'),
  ('food_delivery', 'Доставка еды', '{}'),
  ('real_estate', 'Недвижимость', '{}'),
  ('banking', 'Банки', '{}'),
  ('other', 'Другое', '{}')
on conflict (slug) do nothing;

create table if not exists ads_placements (
  id text primary key,          -- слаг, напр. search_result_context (§19)
  name text not null,
  status text not null default 'active' check (status in ('active','disabled')),
  page text,                     -- где на сайте (home/search_result/outage_detail/map/...)
  allowed_campaign_types text[] not null default array['local','context','category_exclusive','sponsor','house_ad'],
  device text not null default 'all' check (device in ('all','mobile','desktop')),
  max_headline_length int not null default 60,
  max_description_length int not null default 120,
  image_aspect_ratio text,
  cta_allowed boolean not null default true,
  max_ads_per_page int not null default 1,
  priority int not null default 50
);

insert into ads_placements (id, name, page, device) values
  ('search_result_context', 'После результата проверки адреса', 'search_result', 'all'),
  ('outage_detail_context', 'В карточке конкретного отключения', 'outage_detail', 'all'),
  ('map_context', 'В интерфейсе карты', 'map', 'all'),
  ('city_feed', 'На городской странице', 'city_page', 'all'),
  ('sidebar_desktop', 'Боковая панель (десктоп)', 'home', 'desktop'),
  ('mobile_bottom', 'Мобильный низ экрана', 'home', 'mobile')
on conflict (id) do nothing;

create table if not exists ads_campaigns (
  id bigint generated always as identity primary key,
  campaign_key text not null unique,     -- cmp_00000128, генерится приложением
  name text not null,                    -- внутреннее имя, напр. AquaLife_Pavlodar_Water_Aug_2026
  advertiser_id bigint not null references ads_advertisers(id),
  category text references ads_categories(slug),
  campaign_type text not null default 'local'
    check (campaign_type in ('local','context','category_exclusive','sponsor','house_ad')),
  status text not null default 'draft'
    check (status in ('draft','scheduled','active','paused','completed','archived','error')),
  status_reason text,                    -- "Paused manually by Arthur" / "Completed — Limit Reached" (§9, §86)

  -- Targeting (§13-18)
  cities text[] not null default '{}',            -- city_id'ы BARJOK, [] + all_cities=true = все города
  all_cities boolean not null default false,
  auto_include_future_cities boolean not null default false,
  utility_types text[] not null default '{}'      -- electricity/cold_water/hot_water/heating/gas/other
    check (utility_types <@ array['electricity','cold_water','hot_water','heating','gas','other']),
  outage_statuses text[] not null default '{}'     -- planned/active/emergency/restored/unknown
    check (outage_statuses <@ array['planned','active','emergency','restored','unknown']),
  page_contexts text[] not null default '{}',      -- home/search_result/address_result/outage_detail/map/...
  device_targeting text not null default 'all' check (device_targeting in ('all','mobile','desktop','tablet')),
  schedule_days int[],                              -- 1=Mon..7=Sun, null = все дни
  schedule_time_start time,
  schedule_time_end time,
  exclude_rules jsonb not null default '{}'::jsonb,  -- §17: {placements:[], devices:[], utility_types:[], days:[]}

  -- Rotation (§39-41)
  priority int not null default 50,
  weight int not null default 100,
  category_exclusive boolean not null default false,

  -- Commercial (§34)
  pricing_model text not null default 'fixed' check (pricing_model in ('fixed','cpm','cpc','cpa','house')),
  contract_value numeric,
  currency text not null default 'KZT',
  discount_pct numeric not null default 0,
  final_price numeric,
  vat_note text,

  -- Limits (§35) + frequency cap (§38)
  max_impressions bigint,
  max_clicks bigint,
  max_budget numeric,
  frequency_cap_count int,          -- напр. 3
  frequency_cap_window_hours int,   -- напр. 24

  -- Schedule (§36-37) — всегда UTC + отдельная timezone кампании
  start_at timestamptz,
  end_at timestamptz,
  timezone text not null default 'Asia/Almaty',

  notes text,      -- §68: внутренние заметки, рекламодателю не показываются
  tags text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  created_by text, updated_by text, paused_by text, published_by text
);

create index if not exists idx_ads_campaigns_status on ads_campaigns (status);
create index if not exists idx_ads_campaigns_advertiser on ads_campaigns (advertiser_id);

create table if not exists ads_campaign_placements (
  campaign_id bigint not null references ads_campaigns(id) on delete cascade,
  placement_id text not null references ads_placements(id),
  primary key (campaign_id, placement_id)
);

create table if not exists ads_creatives (
  id bigint generated always as identity primary key,
  campaign_id bigint not null references ads_campaigns(id) on delete cascade,
  internal_name text not null,           -- Water_Aug_Headline_A
  slug text not null,                    -- headline_a — используется в utm_content
  headline text not null,
  description text,
  brand_name text,
  sponsor_label text not null default 'Партнёр BARJOK',
  image_url text,
  image_type text not null default 'logo_image' check (image_type in ('logo_only','image_only','logo_image')),
  cta_enabled boolean not null default true,
  cta_text text not null default 'Узнать подробнее',
  cta_action_type text not null default 'website' check (cta_action_type in ('website','phone','whatsapp','telegram')),
  cta_destination text,                  -- URL или номер телефона/WhatsApp/Telegram
  weight int not null default 100,       -- §43: manual A/B split
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, slug)
);

create index if not exists idx_ads_creatives_campaign on ads_creatives (campaign_id);

-- Пусто до фазы "tracking" — создаём сейчас, чтобы engine (frequency cap logic) и
-- будущий трекинг работали с готовой схемой без миграций на живых данных.
create table if not exists ads_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('ad_eligible','ad_rendered','ad_impression','ad_click','ad_dismiss')),
  campaign_id bigint references ads_campaigns(id),
  creative_id bigint references ads_creatives(id),
  placement_id text references ads_placements(id),
  city_id text,
  utility_type text,
  outage_context text,
  device_type text,
  visitor_id text,        -- first-party anonymous, НЕ email/телефон (§48)
  session_id text,
  click_id text,          -- bjclid, только для click (§32)
  valid boolean not null default true,   -- бот-фильтр (§50) помечает false, не удаляет
  created_at timestamptz not null default now()
);

create index if not exists idx_ads_events_campaign_type_time on ads_events (campaign_id, event_type, created_at);
create index if not exists idx_ads_events_visitor on ads_events (visitor_id, campaign_id, created_at);

create table if not exists ads_audit_log (
  id bigint generated always as identity primary key,
  entity_type text not null,     -- 'campaign' | 'advertiser' | 'creative'
  entity_id bigint not null,
  action text not null,          -- 'status_changed' | 'created' | 'updated' | ...
  before jsonb,
  after jsonb,
  actor text,
  at timestamptz not null default now()
);

alter table ads_advertisers enable row level security;
alter table ads_campaigns enable row level security;
alter table ads_creatives enable row level security;
alter table ads_events enable row level security;
alter table ads_audit_log enable row level security;
-- ads_categories/ads_placements/ads_campaign_placements — справочники, RLS не критичен,
-- но включаем для единообразия (только service_role пишет/читает, как и везде в проекте).
alter table ads_categories enable row level security;
alter table ads_placements enable row level security;
alter table ads_campaign_placements enable row level security;
