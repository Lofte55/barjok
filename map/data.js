/* Бар Жоқ — конфигурация ресурсов + аварийный фолбэк.
   Реальные данные приходят из app/data.json (генерирует ../parser.js из открытого
   ГИС-источника). Этот файл нужен для лейблов/иконок и как запасной набор,
   если data.json не загрузился. */

// SVG-пиктограммы (currentColor, 1em) — заменяют эмодзи.
const ICON_SVG = {
  hot_water: '<svg class="ic-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 22a5.5 5.5 0 0 0 5.5-5.5c0-3.4-5.5-8.5-5.5-8.5s-5.5 5.1-5.5 8.5A5.5 5.5 0 0 0 12 22z"/><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 2.2c-1 1-1 2 0 3"/><path d="M12 1.6c-1 1-1 2 0 3"/><path d="M16 2.2c-1 1-1 2 0 3"/></g></svg>',
  cold_water: '<svg class="ic-svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c3.2 4.2 6 7.6 6 11a6 6 0 1 1-12 0c0-3.4 2.8-6.8 6-11z"/></svg>',
  electricity: '<svg class="ic-svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
  heating: '<svg class="ic-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="10" rx="2"/><path d="M8 7v10M12 7v10M16 7v10"/></svg>',
  gas: '<svg class="ic-svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 2c.3 2.4-.6 3.9-1.9 5.2-1.3 1.3-2.9 2.6-2.9 5.1a4.3 4.3 0 0 0 8.6.2c0-2-1-3.4-2-4.6.2 1.4-.4 2.3-1.3 2.5.7-2.7-.2-5.6-.5-8.4zM8.4 10.5c-1.2 1-2 2.5-2 4.3a5.6 5.6 0 0 0 1.7 4 3.7 3.7 0 0 1-1-2.5c0-1.6.7-2.8 1.5-3.9-.3-.5-.4-1.2-.2-1.9z"/></svg>',
};
const RESOURCES = {
  hot_water:   { ru: 'Горячая вода',    kk: 'Ыстық су',  icon: ICON_SVG.hot_water,   color: '#e8663d' },
  cold_water:  { ru: 'Холодная вода',   kk: 'Суық су',   icon: ICON_SVG.cold_water,  color: '#2f9bd6' },
  electricity: { ru: 'Электричество',   kk: 'Электр',    icon: ICON_SVG.electricity, color: '#e0a92c' },
  heating:     { ru: 'Отопление',       kk: 'Жылу',      icon: ICON_SVG.heating,     color: '#c0492f' },
  gas:         { ru: 'Газ',             kk: 'Газ',       icon: ICON_SVG.gas,          color: '#7b8794' },
};

// Небольшой фолбэк (если fetch data.json не сработал) — чтобы карта не была пустой.
const FALLBACK = {
  city: 'Павлодар',
  source: 'демо-данные',
  updated: new Date().toISOString(),
  center: [52.2871, 76.9674],
  counts: { houses: 3, outages: 4 },
  houses: [
    { id: 'f0', address: 'Естая, 12', district: 'Центр', lat: 52.290, lng: 76.955, outages: [
      { resource: 'hot_water', type: 'planned', status: 'current', start: '2026-08-02T05:00:00Z', end: '2026-08-05T13:00:00Z', reason: 'Плановые ремонтные работы на теплосети', provider: 'Теплосети' },
      { resource: 'electricity', type: 'emergency', status: 'current', start: '2026-08-02T04:00:00Z', end: '2026-08-02T12:00:00Z', reason: 'Аварийное повреждение на линии', provider: 'Электросети' },
    ]},
    { id: 'f1', address: 'Абая, 34', district: 'Центр', lat: 52.283, lng: 76.949, outages: [
      { resource: 'cold_water', type: 'planned', status: 'future', start: '2026-08-04T06:00:00Z', end: '2026-08-04T18:00:00Z', reason: 'Замена участка водопровода', provider: 'Водоканал' },
    ]},
    { id: 'f2', address: 'Торайгырова, 21', district: 'Центр', lat: 52.279, lng: 76.972, outages: [
      { resource: 'heating', type: 'planned', status: 'current', start: '2026-08-02T08:00:00Z', end: '2026-08-06T18:00:00Z', reason: 'Опрессовка теплосети', provider: 'Теплосети' },
    ]},
  ],
};

window.BARJOQ = { RESOURCES, FALLBACK };
