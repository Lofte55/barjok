/*
 * Адресный реестр города для serverless-функций.
 *
 * ⚠️ Почему по HTTP, а не с диска: реестр собирает парсер из parser/buildings.json
 * (файл .gitignore'ится и в рантайме Vercel его нет), а результат кладётся в
 * map/addresses.json — СТАТИКОЙ, вне каталога api/. В бандл функции статика не
 * попадает, поэтому читаем его так же, как читает браузер: обычным fetch с
 * собственного домена. Файл ~1 МБ и меняется раз в час (парсер), поэтому держим
 * его в памяти лямбды между вызовами — на прогретой функции запрос всего один.
 *
 * Используется действием force_area в api/admin-api.js («Отключить район»):
 * админ жмёт кнопку на одном доме, а отключить нужно всю улицу или всё вокруг.
 */

const TTL_MS = 10 * 60 * 1000;
let CACHE = null, CACHE_AT = 0;

async function loadAddressBook(origin) {
  if (CACHE && Date.now() - CACHE_AT < TTL_MS) return CACHE;
  const r = await fetch(`${origin}/map/addresses.json`, { headers: { 'User-Agent': 'BarJoqAdmin/1.0' } });
  if (!r.ok) throw new Error(`addresses.json HTTP ${r.status}`);
  const j = await r.json();
  if (!j || typeof j !== 'object') throw new Error('addresses.json malformed');
  CACHE = j; CACHE_AT = Date.now(); LABEL_MEMO.clear();
  return CACHE;
}

/* ---------- Ключ улицы ----------
 * ⚠️ ТОЧНАЯ КОПИЯ логики map/app.js:streetKey (см. большой комментарий там про
 * «одна улица — один список домов»). Копия, а не общий модуль: map/app.js
 * грузится в браузер без бандлера, require оттуда невозможен. Меняешь здесь —
 * поменяй и там, иначе админка отключит не тот набор домов, который карта
 * показывает как одну улицу.
 */
const STREET_TYPES = ['улица', 'ул', 'проспект', 'пр', 'пр-т', 'переулок', 'пер', 'бульвар',
  'б-р', 'площадь', 'пл', 'шоссе', 'аллея', 'тупик', 'микрорайон', 'мкр', 'квартал',
  'көшесі', 'даңғылы', 'алаңы', 'тұйығы', 'шағын', 'ауданы'];
const STREET_STOP = ['академик', 'академика', 'генерал', 'генерала', 'батыр', 'батыра', 'имени'];
const KK_FOLD = { 'ә': 'а', 'і': 'и', 'ң': 'н', 'ғ': 'г', 'ұ': 'у', 'ү': 'у', 'қ': 'к', 'ө': 'о', 'һ': 'х' };
const STREET_WORD_ALIASES = [
  ['сатпаев', 'сатбаев'], ['жусуп', 'жусип'], ['бухар', 'букар'],
  ['аймауытов', 'аймауытул'], ['кудайбердиев', 'кудайбердиул'],
  ['дюсенов', 'дуйсенов'], ['каирбаев', 'кайырбаев'],
];
const foldKk = (s) => s.replace(/[әіңғұүқөһ]/g, (c) => KK_FOLD[c] || c);
const FOLDED_TYPES = STREET_TYPES.map(foldKk);
const STREET_SUFFIX = /(ого|его|ому|ыми|ими|ая|ое|ые|ый|ой|ую|ым|ых|ай|ей)$/;
function streetStem(w) {
  let x = w.replace(STREET_SUFFIX, '');
  if (x.length < 3) x = w;
  if (/[аяыиоеуй]$/.test(x) && x.length > 3) x = x.slice(0, -1);
  for (const [ru, kk] of STREET_WORD_ALIASES) if (x === kk) return ru;
  return x;
}
function streetKeyWords(name) {
  return foldKk(String(name || '').toLowerCase().replace(/ё/g, 'е'))
    .replace(/[^a-zа-я0-9]+/gi, ' ').split(/\s+/).filter(Boolean)
    .filter((w) => !FOLDED_TYPES.some((t) => w === t || (t.length >= 5 && w.startsWith(t))))
    .filter((w) => !STREET_STOP.includes(w))
    .map(streetStem).filter(Boolean);
}
const streetKey = (name) => streetKeyWords(name).slice().sort().join(' ');
const houseKey = (h) => String(h).toLowerCase().replace(/\s+/g, '').replace(/ё/g, 'е');

const kmBetween = (a, b) => Math.hypot((a[0] - b[0]) * 111.2, (a[1] - b[1]) * 61);
const midOf = (houses, i) => {
  const v = houses.map((h) => h[i]).sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)] || 0;
};

/* Один ли это участок улицы. ⚠️ Совпадения названия МАЛО: дачные «Рябиновая» и
   «Рябиновая аллея» дают один ключ, но стоят в 11 км друг от друга — это разные
   улицы в разных садовых товариществах. Та же проверка, что в
   map/app.js:mergeStreetIndex → sameStreet. */
function sameStreet(aHouses, bHouses) {
  const at = new Map();
  aHouses.forEach((h) => { const k = houseKey(h[0]); if (!at.has(k)) at.set(k, h); });
  let shared = 0, far = 0;
  bHouses.forEach((h) => {
    const o = at.get(houseKey(h[0]));
    if (!o) return;
    shared++;
    if (kmBetween([h[1], h[2]], [o[1], o[2]]) > 0.3) far++;
  });
  if (shared) return far / shared < 0.5;
  return kmBetween([midOf(aHouses, 1), midOf(aHouses, 2)], [midOf(bHouses, 1), midOf(bHouses, 2)]) < 1.5;
}

const isKkStreet = (n) => /(көшесі|даңғылы|алаңы|тұйығы|шағын|ауданы)/i.test(n) || /[әіңғұүқөһ]/i.test(n);

/* Русское название улицы для записи в incidents: реестр хранит один и тот же
   участок и как «Нурсултана Назарбаева проспект», и как «Нұрсұлтан Назарбаев
   даңғылы», и по числу домов может выигрывать казахский вариант. Админка и
   data.json — русские, поэтому пишем русский вариант. Берём только вариант из
   ТОЙ ЖЕ улицы (sameStreet), иначе «Рябиновая» превратилась бы в «Рябиновую
   аллею» — а это другая улица в другом садовом товариществе. */
const LABEL_MEMO = new Map();
function ruLabelFor(book, name) {
  if (LABEL_MEMO.has(name)) return LABEL_MEMO.get(name);
  let best = name;
  if (isKkStreet(name)) {
    const key = streetKey(name);
    const ru = Object.keys(book).filter((s) => !isKkStreet(s) && streetKey(s) === key
      && sameStreet(book[name] || [], book[s] || []));
    if (ru.length) best = ru.sort((a, b) => (book[b] || []).length - (book[a] || []).length)[0];
  }
  LABEL_MEMO.set(name, best);
  return best;
}

function splitAddress(address) {
  const s = String(address || '');
  const m = s.match(/^(.*?),\s*([^,]+)$/);
  return m ? { street: m[1].trim(), house: m[2].trim() } : { street: s.trim(), house: '' };
}

/* Радиусы «рядом» — ТОЧНО ТЕ ЖЕ, что у автоматики на карте (map/app.js:
   outagesNear и computeGhostHouses): по своей улице — 350 м, по любой соседней —
   150 м. Это не новое понятие «района»: карта уже рисует вокруг подтверждённого
   дома жёлтые кольца «возможно отключение» именно по этому правилу, и кнопка
   просто превращает это кольцо в настоящее отключение. Разойдутся числа —
   разойдётся и то, что админ видел на карте, с тем, что он отключил. */
const NEAR_SAME_STREET_KM = 0.35;
const NEAR_ANY_STREET_KM = 0.15;

/*
 * Дома «района» вокруг заданного адреса.
 *   scope 'near'   — как у автоматики: своя улица ≤350 м + любая улица ≤150 м
 *   scope 'street' — вся улица целиком (все варианты написания, прошедшие sameStreet)
 *   scope <метры>  — всё в радиусе вокруг дома, независимо от улицы
 *
 * Возвращает { ok, error?, base, houses: [{ address, lat, lng }], streetLabel }.
 * Базовый дом всегда идёт первым — по нему админ и нажал кнопку.
 */
function findAreaHouses(book, baseAddress, scope) {
  const { street, house } = splitAddress(baseAddress);
  // Без номера дома район не собрать: для радиуса неоткуда взять координаты,
  // а для «всей улицы» непонятно, какой из вариантов написания взять за основу.
  if (!street || !house) return { ok: false, error: 'bad_address' };

  const key = streetKey(street);
  const variants = Object.keys(book).filter((s) => streetKey(s) === key);
  if (!variants.length) return { ok: false, error: 'street_not_found' };

  // Вариант, в котором реально лежит этот дом (у RU/KZ-пары дома распределены
  // между вариантами — дом 1 может быть только в казахском ключе).
  const hk = houseKey(house);
  let baseVariant = null, baseHouse = null;
  for (const v of variants) {
    const hit = (book[v] || []).find((h) => houseKey(h[0]) === hk);
    if (hit) { baseVariant = v; baseHouse = hit; break; }
  }
  if (!baseVariant) {
    // Дома нет в реестре (новостройка или опечатка) — для «всей улицы» это не
    // помеха, берём самый крупный вариант; для радиуса без координат нельзя.
    baseVariant = variants.slice().sort((a, b) => (book[b] || []).length - (book[a] || []).length)[0];
    // Без координат дома радиус посчитать не от чего — «вся улица» ещё возможна.
    if (scope !== 'street') return { ok: false, error: 'house_not_found' };
  }

  const kept = variants.filter((v) => v === baseVariant || sameStreet(book[baseVariant], book[v] || []));
  const streetLabel = ruLabelFor(book, kept.slice().sort((a, b) => (book[b] || []).length - (book[a] || []).length)[0]);

  const seen = new Set();
  const houses = [];
  const push = (name, h) => {
    const addr = `${name}, ${h[0]}`;
    const k = `${streetKey(name)}|${houseKey(h[0])}`;
    if (seen.has(k)) return;
    seen.add(k);
    houses.push({ address: addr, lat: h[1], lng: h[2] });
  };

  if (scope === 'street') {
    kept.forEach((v) => (book[v] || []).forEach((h) => push(streetLabel, h)));
  } else {
    const at = [baseHouse[1], baseHouse[2]];
    const isNear = scope === 'near';
    const radiusKm = isNear ? NEAR_SAME_STREET_KM : Number(scope) / 1000;
    for (const s of Object.keys(book)) {
      const same = isNear && streetKey(s) === key;
      const limit = isNear ? (same ? NEAR_SAME_STREET_KM : NEAR_ANY_STREET_KM) : radiusKm;
      for (const h of book[s] || []) {
        if (kmBetween(at, [h[1], h[2]]) <= limit) push(ruLabelFor(book, s), h);
      }
    }
  }

  // Базовый дом — первым в списке: именно с него админ начал.
  const baseIdx = houses.findIndex((h) => houseKey(splitAddress(h.address).house) === hk
    && streetKey(splitAddress(h.address).street) === key);
  if (baseIdx > 0) houses.unshift(houses.splice(baseIdx, 1)[0]);

  return { ok: true, base: { street, house }, houses, streetLabel };
}

module.exports = { loadAddressBook, findAreaHouses, streetKey, splitAddress };
