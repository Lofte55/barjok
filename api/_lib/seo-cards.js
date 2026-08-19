const { esc } = require('./seo-layout');

const RES_LABEL = { cold_water: 'холодной воды', hot_water: 'горячей воды', electricity: 'света', heating: 'отопления', gas: 'газа' };
const RES_LABEL_NOM = { cold_water: 'Холодная вода', hot_water: 'Горячая вода', electricity: 'Электричество', heating: 'Отопление', gas: 'Газ' };

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });
}

/*
 * houses: массив домов из snapshot; filterFn(outage,house) => bool; limit — сколько
 * карточек рендерить в HTML (Core Web Vitals — не тянем тысячи карточек в SSR, §51).
 */
function outageCardsHtml(houses, filterFn, limit = 24) {
  const rows = [];
  for (const h of houses) {
    for (const o of h.outages || []) {
      if (o.status !== 'current') continue;
      if (!filterFn(o, h)) continue;
      rows.push({ h, o });
      if (rows.length >= limit) break;
    }
    if (rows.length >= limit) break;
  }
  if (!rows.length) return '';
  const RES_COLOR = { cold_water: 'var(--cold)', hot_water: 'var(--hot)', electricity: 'var(--elec)', heating: 'var(--hot)', gas: 'var(--ink-3)' };
  return '<div class="cards">' + rows.map(({ h, o }) => {
    const color = RES_COLOR[o.resource] || 'var(--accent)';
    return `<article class="outage-card rv">
    <span class="res-pill" style="background:color-mix(in srgb, ${color} 14%, white);color:${color}"><span class="dot" style="background:${color}"></span>${esc(RES_LABEL_NOM[o.resource] || o.resource)}</span>
    <h3 style="margin:8px 0 10px">${esc(h.address)}</h3>
    <dl>
      <dt>Начало</dt><dd>${esc(fmtDate(o.start))}</dd>
      <dt>Ожидаемое восстановление</dt><dd>${esc(fmtDate(o.end))}</dd>
      <dt>Причина</dt><dd>${esc(o.reason || (o.type === 'emergency' ? 'Аварийные работы' : 'Плановые работы'))}</dd>
      <dt>Источник</dt><dd>${esc(o.citizen ? 'Подтверждено пользователями BARJOK' : (o.provider || 'Официальный источник'))}</dd>
    </dl>
  </article>`;
  }).join('') + '</div>';
}

function countMatching(houses, filterFn) {
  let n = 0;
  for (const h of houses) for (const o of h.outages || []) { if (o.status === 'current' && filterFn(o, h)) n++; }
  return n;
}

/* Динамический SEO-блок состояния (§11). */
function statusBlockHtml({ locative, activeOutages, affectedAddresses, electricityAffected, hotWaterAffected, coldWaterAffected, generatedAt, ok }) {
  const updated = generatedAt ? new Date(generatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  if (!ok) {
    return `<div class="updated">Последнее успешное обновление — уточняется.</div>
      <div class="status-block">Получаем новые данные от источника. Попробуйте обновить страницу через минуту.</div>`;
  }
  if (!activeOutages) {
    return `<div class="updated">Обновлено сегодня в ${esc(updated)}.</div>
      <div class="status-block">По данным BARJOK, активных отключений воды и света в ${esc(locative)} сейчас не найдено.<br>
      Проверьте свой адрес — по вашему дому также могут быть запланированы будущие работы.</div>`;
  }
  return `<div class="updated">Обновлено сегодня в ${esc(updated)}.</div>
    <div class="status-block">
      Сейчас в ${esc(locative)} найдено <b>${activeOutages}</b> активных отключений.<br>
      Они затрагивают <b>${affectedAddresses.toLocaleString('ru-RU')}</b> адресов.<br><br>
      Без электричества — <b>${electricityAffected}</b> адресов.<br>
      Без горячей воды — <b>${hotWaterAffected}</b> адресов.<br>
      Без холодной воды — <b>${coldWaterAffected}</b> адресов.
    </div>`;
}

module.exports = { outageCardsHtml, countMatching, statusBlockHtml, fmtDate, RES_LABEL, RES_LABEL_NOM };
