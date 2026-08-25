/*
 * Единый генератор SEO metadata (§29 SEO-ТЗ). Никаких hardcoded страниц
 * (PavlodarWaterPage и т.п.) — только функции города/сервиса + City Config.
 */
const { getCity } = require('./seo-cities');

const BRAND = 'BARJOK';
const ORIGIN = 'https://barjok.kz';

const SERVICE_META = {
  voda: {
    title: (loc) => `Отключение воды в ${loc} сегодня — адреса и сроки`,
    h1: (loc) => `Отключение воды в ${loc} сегодня`,
    desc: (loc) => `Актуальные отключения воды в ${loc}. Проверьте свой адрес, причину отключения и ожидаемое время восстановления.`,
  },
  'holodnaya-voda': {
    title: (loc) => `Отключение холодной воды в ${loc} сегодня`,
    h1: (loc) => `Отключение холодной воды в ${loc}`,
    desc: (loc) => `Где сегодня отключена холодная вода в ${loc}. Актуальные адреса, причина (авария/порыв/плановые работы) и ожидаемый срок подключения.`,
  },
  'goryachaya-voda': {
    title: (loc) => `Отключение горячей воды в ${loc} — когда дадут воду`,
    h1: (loc) => `Отключение горячей воды в ${loc}`,
    desc: (loc) => `График подключения горячей воды в ${loc}: гидравлические испытания, опрессовка, аварии. Проверьте свой адрес и дату восстановления.`,
  },
  svet: {
    title: (loc) => `Отключение света в ${loc} сегодня — адреса и время`,
    h1: (loc) => `Отключение света в ${loc} сегодня`,
    desc: (loc) => `Актуальные отключения электричества в ${loc}: плановые и аварийные. Проверьте свой адрес, причину и время восстановления электроснабжения.`,
  },
  otoplenie: {
    title: (loc) => `Отключение отопления в ${loc} сегодня — адреса`,
    h1: (loc) => `Отключение отопления в ${loc}`,
    desc: (loc) => `Где сегодня нет отопления в ${loc}. Аварии теплосетей, плановые работы, ожидаемое время подключения по вашему адресу.`,
  },
  'planovye-otklyucheniya': {
    title: (loc) => `Плановые отключения в ${loc} — график воды и света`,
    h1: (loc) => `Плановые отключения в ${loc}`,
    desc: (loc) => `График плановых отключений воды, света, отопления в ${loc}. Даты, время, причины работ по официальным источникам.`,
  },
  'avariynye-otklyucheniya': {
    title: (loc) => `Аварийные отключения воды и света в ${loc}`,
    h1: (loc) => `Аварийные отключения в ${loc}`,
    desc: (loc) => `Актуальные аварии и внеплановые отключения воды, света, отопления в ${loc}. Причина, начало, ожидаемое восстановление.`,
  },
  'po-adresu': {
    title: (loc) => `Проверить отключение воды и света по адресу в ${loc}`,
    h1: (loc) => `Проверить отключения по адресу в ${loc}`,
    desc: (loc) => `Введите улицу и дом — узнайте, есть ли отключение воды, света, отопления по вашему адресу в ${loc}.`,
  },
};

/*
 * ⚠️ Казахские title/description/h1 — НЕ через bakeKk() (api/_lib/bake-kk.js).
 * bake переводит ТЕЛО страницы через data-kk-атрибуты, а <title>/<meta
 * description> — это не видимые DOM-элементы, клиентский applyLang() их
 * никогда не трогал, и data-kk на них никто не ставил. Без отдельного
 * казахского текста здесь /kz/-страница показывала бы русский заголовок
 * в результатах поиска — прямое противоречие всей цели этой задачи.
 * Переведено вручную (Павлодар — единственный активный город сейчас).
 */
const SERVICE_META_KK = {
  voda: {
    title: (loc) => `${loc} бүгін су ажыратылуы — мекенжайлар мен мерзімдер`,
    h1: (loc) => `${loc} бүгін су ажыратылуы`,
    desc: (loc) => `${loc} өзекті су ажыратулары. Мекенжайыңызды, ажырату себебін және қосылудың болжамды уақытын тексеріңіз.`,
  },
  'holodnaya-voda': {
    title: (loc) => `${loc} бүгін суық су ажыратылуы`,
    h1: (loc) => `${loc} суық су ажыратылуы`,
    desc: (loc) => `${loc} бүгін суық су қайда ажыратылған. Өзекті мекенжайлар, себебі (апат/жарылу/жоспарлы жұмыстар) және қосылудың болжамды мерзімі.`,
  },
  'goryachaya-voda': {
    title: (loc) => `${loc} ыстық су ажыратылуы — су қашан беріледі`,
    h1: (loc) => `${loc} ыстық су ажыратылуы`,
    desc: (loc) => `${loc} ыстық су қосу кестесі: гидравликалық сынақтар, опрессовка, апаттар. Мекенжайыңызды және қосылу күнін тексеріңіз.`,
  },
  svet: {
    title: (loc) => `${loc} бүгін жарық ажыратылуы — мекенжайлар мен уақыт`,
    h1: (loc) => `${loc} бүгін жарық ажыратылуы`,
    desc: (loc) => `${loc} өзекті электр ажыратулары: жоспарлы және апаттық. Мекенжайыңызды, себебін және электрмен қамтуды қалпына келтіру уақытын тексеріңіз.`,
  },
  otoplenie: {
    title: (loc) => `${loc} бүгін жылыту ажыратылуы — мекенжайлар`,
    h1: (loc) => `${loc} жылыту ажыратылуы`,
    desc: (loc) => `${loc} бүгін қайда жылыту жоқ. Жылу желісіндегі апаттар, жоспарлы жұмыстар, мекенжайыңыз бойынша қосылудың болжамды уақыты.`,
  },
  'planovye-otklyucheniya': {
    title: (loc) => `${loc} жоспарлы ажыратулар — су мен жарық кестесі`,
    h1: (loc) => `${loc} жоспарлы ажыратулар`,
    desc: (loc) => `${loc} су, жарық, жылыту жоспарлы ажыратуларының кестесі. Ресми дереккөздер бойынша күндер, уақыт, жұмыс себептері.`,
  },
  'avariynye-otklyucheniya': {
    title: (loc) => `${loc} су және жарық апаттық ажыратулары`,
    h1: (loc) => `${loc} апаттық ажыратулар`,
    desc: (loc) => `${loc} өзекті апаттар мен жоспардан тыс су, жарық, жылыту ажыратулары. Себебі, басталуы, болжамды қосылу уақыты.`,
  },
  'po-adresu': {
    title: (loc) => `${loc} мекенжай бойынша су және жарық ажыратуын тексеру`,
    h1: (loc) => `${loc} мекенжай бойынша ажыратуларды тексеру`,
    desc: (loc) => `Көше мен үйді енгізіңіз — ${loc} мекенжайыңыз бойынша су, жарық, жылыту ажыратылған-ажыратылмағанын біліңіз.`,
  },
};

function getHomeSeo(lang) {
  if (lang === 'kk') {
    return {
      url: `${ORIGIN}/kz/`,
      title: `Қазақстандағы су және жарық ажыратулары — қалалар картасы | ${BRAND}`,
      description: `${BRAND} Қазақстан қалаларындағы мекенжайлар бойынша су, жарық, ыстық су және жылу ажыратуларын көрсетеді. Қаланы таңдап, үйіңізді тексеріңіз.`,
      h1: 'Қазақстандағы су, жарық және жылу ажыратулары',
      canonical: `${ORIGIN}/kz/`,
    };
  }
  return {
    url: `${ORIGIN}/`,
    title: `Отключения воды и света в Казахстане — карта по городам | ${BRAND}`,
    description: `${BRAND} показывает отключения воды, света, горячей воды и отопления по адресам в городах Казахстана. Выберите город и проверьте свой дом.`,
    h1: 'Отключения воды, света и отопления в Казахстане',
    canonical: `${ORIGIN}/`,
  };
}

function getCitySeo(citySlug, lang) {
  const city = getCity(citySlug);
  if (!city) return null;
  if (lang === 'kk') {
    const kkLoc = (city.names.kk && city.names.kk.locative) || (city.names.kk && city.names.kk.nominative) || city.names.ru.locative;
    return {
      url: `${ORIGIN}/kz/${citySlug}/`,
      title: `${kkLoc} бүгін су және жарық ажыратулары | ${BRAND}`,
      description: `${kkLoc} өзекті су, жарық, ыстық су және жылыту ажыратулары. Мекенжайыңызды, ажырату себебін және қосылудың болжамды уақытын тексеріңіз.`,
      h1: `${kkLoc} бүгін су және жарық ажыратулары`,
      canonical: `${ORIGIN}/kz/${citySlug}/`,
    };
  }
  const nom = city.names.ru.nominative;
  const loc = city.names.ru.locative;
  return {
    url: `${ORIGIN}/${citySlug}/`,
    title: `Отключения воды и света в ${loc} сегодня | ${BRAND}`,
    description: `Актуальные отключения воды, света, горячей воды и отопления в ${loc}. Проверьте свой адрес, причину отключения и ожидаемое время восстановления.`,
    h1: `Отключения воды и света в ${loc} сегодня`,
    canonical: `${ORIGIN}/${citySlug}/`,
  };
}

function getServiceSeo(citySlug, serviceSlug, lang) {
  const city = getCity(citySlug);
  if (!city) return null;
  if (lang === 'kk') {
    const meta = SERVICE_META_KK[serviceSlug];
    if (!meta) return null;
    const kkLoc = (city.names.kk && city.names.kk.locative) || (city.names.kk && city.names.kk.nominative) || city.names.ru.locative;
    return {
      url: `${ORIGIN}/kz/${citySlug}/${serviceSlug}/`,
      title: `${meta.title(kkLoc)} | ${BRAND}`,
      description: meta.desc(kkLoc),
      h1: meta.h1(kkLoc),
      canonical: `${ORIGIN}/kz/${citySlug}/${serviceSlug}/`,
    };
  }
  const meta = SERVICE_META[serviceSlug];
  if (!meta) return null;
  const loc = city.names.ru.locative;
  return {
    url: `${ORIGIN}/${citySlug}/${serviceSlug}/`,
    title: `${meta.title(loc)} | ${BRAND}`,
    description: meta.desc(loc),
    h1: meta.h1(loc),
    canonical: `${ORIGIN}/${citySlug}/${serviceSlug}/`,
  };
}

function getMapSeo(citySlug) {
  const city = getCity(citySlug);
  if (!city) return null;
  const loc = city.names.ru.locative;
  return {
    url: `${ORIGIN}/map/${citySlug}`,
    title: `Карта отключений воды и света в ${loc} | ${BRAND}`,
    description: `Карта текущих и будущих отключений воды, электричества, горячей воды и отопления в ${loc}. Найдите свой дом по адресу.`,
    h1: `Карта отключений воды и света в ${loc}`,
    canonical: `${ORIGIN}/map/${citySlug}`,
  };
}

function getAboutSeo() {
  return {
    url: `${ORIGIN}/about/`,
    title: `О проекте — ${BRAND}`,
    description: `${BRAND} — сервис живого отслеживания отключений воды, света и отопления в Казахстане. Кто делает, зачем и какие планы на ближайшие годы.`,
    h1: 'О проекте BARJOK',
    canonical: `${ORIGIN}/about/`,
  };
}

module.exports = { BRAND, ORIGIN, getHomeSeo, getCitySeo, getServiceSeo, getMapSeo, getAboutSeo, SERVICE_META };
