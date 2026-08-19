/*
 * City Config — единственный источник правды о городах BARJOK (§30 SEO-ТЗ).
 * Подключение нового города = добавить запись сюда + источники в
 * parser/adapters + данные в map/data.json → SEO-страницы появляются сами
 * (см. api/_lib/seo.js, api/pavlodar.js/api/service-page.js читают этот файл,
 * а не хардкодят город).
 *
 * status: 'active' — есть реальные данные, страницы индексируются;
 *         'soon'   — город анонсирован, но данных нет, публичные SEO-страницы
 *                    для него не создаются (см. §32 документа) — только карта
 *                    в /admin остаётся выключенной disabled-опцией в UI.
 */
const CITIES = {
  pavlodar: {
    slug: 'pavlodar',
    names: {
      ru: { nominative: 'Павлодар', genitive: 'Павлодара', locative: 'Павлодаре' },
      kk: { nominative: 'Павлодар' },
    },
    timezone: 'Asia/Almaty',
    status: 'active',
    services: { coldWater: true, hotWater: true, electricity: true, heating: true },
    seo: { enabled: true, streetPages: false },
  },
  ekibastuz: {
    slug: 'ekibastuz',
    names: {
      ru: { nominative: 'Экибастуз', genitive: 'Экибастуза', locative: 'Экибастузе' },
      kk: { nominative: 'Екібастұз' },
    },
    timezone: 'Asia/Almaty',
    status: 'soon',
    services: { coldWater: false, hotWater: false, electricity: false, heating: false },
    seo: { enabled: false, streetPages: false },
  },
  aksu: {
    slug: 'aksu',
    names: {
      ru: { nominative: 'Аксу', genitive: 'Аксу', locative: 'Аксу' },
      kk: { nominative: 'Ақсу' },
    },
    timezone: 'Asia/Almaty',
    status: 'soon',
    services: { coldWater: false, hotWater: false, electricity: false, heating: false },
    seo: { enabled: false, streetPages: false },
  },
};

// Доступные service-страницы (§57) — slug/url/resource-фильтр/лейбл.
// resource: null значит "не фильтруется по одному ресурсу" (planned/emergency/address).
const SERVICES = [
  { slug: 'voda', resource: null, waterGroup: true, label: 'воды' },
  { slug: 'holodnaya-voda', resource: 'cold_water', label: 'холодной воды' },
  { slug: 'goryachaya-voda', resource: 'hot_water', label: 'горячей воды' },
  { slug: 'svet', resource: 'electricity', label: 'света' },
  { slug: 'otoplenie', resource: 'heating', label: 'отопления' },
  { slug: 'planovye-otklyucheniya', resource: null, typeFilter: 'planned', label: 'плановых отключений' },
  { slug: 'avariynye-otklyucheniya', resource: null, typeFilter: 'emergency', label: 'аварийных отключений' },
  { slug: 'po-adresu', resource: null, addressSearch: true, label: 'по адресу' },
];

function getCity(slug) { return CITIES[slug] || null; }
function activeCities() { return Object.values(CITIES).filter((c) => c.status === 'active'); }
function allCities() { return Object.values(CITIES); }
function getService(slug) { return SERVICES.find((s) => s.slug === slug) || null; }

module.exports = { CITIES, SERVICES, getCity, activeCities, allCities, getService };
