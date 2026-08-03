/*
 * Адаптер: Павлодар (активный город).
 *
 * ИСТОЧНИКИ РЕАЛЬНЫХ ДАННЫХ (для полного парсинга — следующий шаг):
 *   - АО «Павлодарэнерго», плановые отключения (еженедельные .docx):
 *       https://pavlodarenergo.kz/ru/informacziya-o-planovyix-otklyucheniyax.html
 *       напр. /assets/files/planovye-otklyucheniya-zpes-s-03.08.2026-po-07.08.2026-g.docx
 *   - lifepvl.kz — новости об отключениях (адреса в тексте).
 *
 * Особенность Павлодара: данные лежат в .docx-графиках и новостях, без координат.
 * Полный конвейер = скачать .docx → распарсить таблицы → геокодировать адреса
 * (Nominatim/2ГИС) → нормализовать. Хук `fetchFromDocx()` ниже помечен TODO.
 *
 * СЕЙЧАС: адаптер отдаёт реалистичный набор по реальным улицам Павлодара с координатами,
 * чтобы обкатать интерфейс/кластеры/карточки дома на «павлодарской» геометрии.
 * Модель записей идентична боевой — при подключении .docx+геокодинга интерфейс не меняется.
 */

const SOURCE = 'Павлодарэнерго + Павлодар-Водоканал · демо-набор (реальные улицы Павлодара)';

// Реальные улицы Павлодара: базовая точка + шаг раскладки домов + район/зона.
const STREETS = [
  { name: 'улица Естая',              base: [52.2905, 76.9520], step: [0.0009, 0.0011], houses: 44, area: 'Центр' },
  { name: 'улица Абая',               base: [52.2820, 76.9480], step: [0.0011, 0.0009], houses: 48, area: 'Центр' },
  { name: 'улица Каирбаева',          base: [52.2960, 76.9620], step: [0.0008, 0.0013], houses: 40, area: 'Центр' },
  { name: 'улица Торайгырова',        base: [52.2790, 76.9700], step: [0.0012, 0.0007], houses: 46, area: 'Центр' },
  { name: 'улица Академика Сатпаева', base: [52.2870, 76.9760], step: [0.0007, 0.0014], houses: 52, area: 'Центр' },
  { name: 'улица 1 Мая',              base: [52.3010, 76.9560], step: [0.0010, 0.0010], houses: 42, area: 'Химгородок' },
  { name: 'улица Камзина',            base: [52.3080, 76.9700], step: [0.0006, 0.0015], houses: 50, area: 'Химгородок' },
  { name: 'улица Кутузова',           base: [52.2740, 76.9540], step: [0.0013, 0.0008], houses: 38, area: 'Центр' },
  { name: 'улица Толстого',           base: [52.2830, 76.9860], step: [0.0009, 0.0009], houses: 32, area: 'Сарыарка' },
  { name: 'улица Академика Чокина',   base: [52.2680, 76.9660], step: [0.0011, 0.0011], houses: 36, area: 'Сарыарка' },
  { name: 'улица Лермонтова',         base: [52.2920, 76.9820], step: [0.0008, 0.0012], houses: 34, area: 'Центр' },
  { name: 'улица Генерала Дюсенова',  base: [52.3120, 76.9580], step: [0.0009, 0.0013], houses: 42, area: 'Химгородок' },
  { name: 'улица Бектурова',          base: [52.2760, 76.9800], step: [0.0010, 0.0010], houses: 30, area: 'Сарыарка' },
  { name: 'улица Академика Маргулана',base: [52.3040, 76.9880], step: [0.0007, 0.0012], houses: 32, area: 'Химгородок' },
  { name: 'улица Космонавтов',        base: [52.2650, 76.9500], step: [0.0012, 0.0012], houses: 28, area: 'Усольский' },
  { name: 'улица Ак. Бектурова',      base: [52.2980, 76.9440], step: [0.0010, 0.0011], houses: 30, area: 'Второй Павлодар' },
  { name: 'проспект Назарбаева',      base: [52.2855, 76.9585], step: [0.0011, 0.0010], houses: 56, area: 'Центр' },
  { name: 'улица Ткачёва',            base: [52.2710, 76.9720], step: [0.0010, 0.0009], houses: 34, area: 'Сарыарка' },
];

const RESOURCE_POOL = ['hot_water', 'hot_water', 'electricity', 'cold_water', 'heating', 'gas'];
const PROVIDERS = {
  hot_water: 'Павлодарские тепловые сети',
  heating: 'Павлодарские тепловые сети',
  cold_water: 'ГКП «Павлодар-Водоканал»',
  electricity: 'АО «Павлодарэнерго»',
  gas: 'АО «КазТрансГаз Аймак»',
};
// Причины подобраны под ресурс, чтобы текст не противоречил типу сети.
const REASONS = {
  hot_water: {
    planned: ['Плановая опрессовка теплосети после гидравлических испытаний', 'Плановый ремонт на теплотрассе', 'Замена участка трубопровода ГВС'],
    emergency: ['Устранение порыва на теплотрассе', 'Аварийно-восстановительные работы на сети ГВС'],
  },
  heating: {
    planned: ['Плановые работы на теплосети', 'Гидравлические испытания теплосети'],
    emergency: ['Устранение повреждения на теплотрассе', 'Аварийно-восстановительные работы на теплосети'],
  },
  cold_water: {
    planned: ['Плановая замена участка водопровода', 'Плановые работы на сети водоснабжения'],
    emergency: ['Устранение порыва водопровода', 'Локализация утечки на сети водоснабжения'],
  },
  electricity: {
    planned: ['Плановое техобслуживание распределительного пункта', 'Плановый ремонт на распределительной сети', 'Профилактика оборудования подстанции'],
    emergency: ['Аварийно-восстановительные работы на кабельной линии', 'Устранение технологического нарушения на сети'],
  },
  gas: {
    planned: ['Плановое техобслуживание газораспределительного пункта', 'Плановые работы на газовой сети'],
    emergency: ['Устранение утечки на газопроводе', 'Аварийно-восстановительные работы на газовой сети'],
  },
};

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// «стенные» часы Павлодара, записанные как UTC (приложение форматирует по UTC-геттерам)
function wall(dayOffset, hour) {
  const base = Date.UTC(2026, 7, 2, 0, 0, 0);          // 02.08.2026
  return new Date(base + dayOffset * 86400000 + hour * 3600000).toISOString();
}

async function fetchPavlodar() {
  const rnd = mulberry32(20260802);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const records = [];

  STREETS.forEach((st) => {
    const count = 2 + Math.floor(rnd() * 4);           // 2–5 отключений на улицу
    for (let k = 0; k < count; k++) {
      const resource = rnd() > 0.92 ? 'gas' : pick(RESOURCE_POOL);
      const type = rnd() > 0.6 ? 'emergency' : 'planned';
      const startHouse = 1 + Math.floor(rnd() * (st.houses - 8));
      const span = 2 + Math.floor(rnd() * 6);

      // временной статус
      const roll = rnd();
      let startOff, endOff;
      if (roll < 0.5) { startOff = wall(-Math.floor(rnd() * 2), 6 + Math.floor(rnd() * 3)); endOff = wall(Math.floor(rnd() * 4), 13 + Math.floor(rnd() * 6)); } // current
      else { const d = 1 + Math.floor(rnd() * 5); startOff = wall(d, 8 + Math.floor(rnd() * 3)); endOff = wall(d + Math.floor(rnd() * 3), 14 + Math.floor(rnd() * 5)); } // future
      const status = new Date(startOff) > new Date('2026-08-02T14:00:00Z') ? 'future' : 'current';

      const reason = pick(REASONS[resource][type]);
      const jitter = () => (rnd() - 0.5) * 0.0006;
      for (let h = startHouse; h < startHouse + span && h <= st.houses; h++) {
        records.push({
          address: `${st.name}, ${h}`,
          district: st.area,
          lat: +(st.base[0] + st.step[0] * (h % st.houses) + jitter()).toFixed(5),
          lng: +(st.base[1] + st.step[1] * (h % st.houses) + jitter()).toFixed(5),
          resource, type, status,
          start: startOff, end: endOff,
          reason, provider: PROVIDERS[resource],
        });
      }
    }
  });

  return { records, center: [52.2871, 76.9674] };
}

// TODO: боевой конвейер — скачать .docx с pavlodarenergo.kz, распарсить таблицы,
// геокодировать адреса, вернуть records в том же формате.
async function fetchFromDocx() { throw new Error('not implemented — см. SOURCE'); }

module.exports = { fetchCurated: fetchPavlodar, SOURCE_CURATED: SOURCE };
