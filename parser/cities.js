/*
 * Бар Жоқ — реестр городов.
 *
 * Каждый город = адаптер, который возвращает «сырые» записи об отключениях в общем
 * формате. Нормализацию, группировку по домам и запись data.json делает ../index.js.
 * Масштабирование на новый город = добавить сюда один объект с его адаптером.
 *
 * active: true  — город, под который сейчас собираем данные (Павлодар).
 * active: false — готовые/заготовленные адаптеры для будущих городов Казахстана и др.
 */

const pavlodar = require('./adapters/pavlodar');
const { arcgisAdapter } = require('./adapters/arcgis');

const CITIES = [
  {
    id: 'pavlodar',
    name: 'Павлодар',
    kk: 'Павлодар',
    country: 'KZ',
    active: true,
    tzOffset: 5,                 // UTC+5
    center: [52.2871, 76.9674],
    adapter: pavlodar.fetch,
    source: pavlodar.SOURCE,
  },

  // ---- Заготовки для масштабирования по Казахстану ----
  // Подключаются, когда найдём открытый источник (ArcGIS/портал/выгрузка) по городу.
  { id: 'astana',    name: 'Астана',    country: 'KZ', active: false, tzOffset: 5, center: [51.1605, 71.4704], adapter: null, source: 'TODO' },
  { id: 'almaty',    name: 'Алматы',    country: 'KZ', active: false, tzOffset: 5, center: [43.2389, 76.8897], adapter: null, source: 'TODO' },
  { id: 'shymkent',  name: 'Шымкент',   country: 'KZ', active: false, tzOffset: 5, center: [42.3170, 69.5967], adapter: null, source: 'TODO' },
  { id: 'karaganda', name: 'Караганда', country: 'KZ', active: false, tzOffset: 5, center: [49.8047, 73.1094], adapter: null, source: 'TODO' },

  // ---- Референс-адаптер на реальных открытых данных (ArcGIS REST) ----
  // Доказывает, что пайплайн работает на живом источнике; тем же адаптером можно
  // подключать любой ArcGIS-портал (в т.ч. казахстанские, если появятся).
  {
    id: 'novosibirsk',
    name: 'Новосибирск',
    country: 'RU',
    active: false,
    tzOffset: 0,                 // портал отдаёт «стенные» часы как UTC
    center: [55.0084, 82.9357],
    source: 'map.novo-sibirsk.ru · открытые данные (ArcGIS REST)',
    adapter: arcgisAdapter({
      base: 'https://map.novo-sibirsk.ru/elitegis/rest/services/maps/disconnections/MapServer/101',
      systemMap: { 1: 'hot_water', 2: 'cold_water', 3: 'electricity', 5: 'gas', 6: 'heating' },
    }),
  },
];

function getCity(id) {
  if (id) return CITIES.find((c) => c.id === id);
  return CITIES.find((c) => c.active) || CITIES[0];
}

module.exports = { CITIES, getCity };
