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

function getHomeSeo() {
  return {
    url: `${ORIGIN}/`,
    title: `Отключения воды и света в Казахстане — карта по городам | ${BRAND}`,
    description: `${BRAND} показывает отключения воды, света, горячей воды и отопления по адресам в городах Казахстана. Выберите город и проверьте свой дом.`,
    h1: 'Отключения воды, света и отопления в Казахстане',
    canonical: `${ORIGIN}/`,
  };
}

function getCitySeo(citySlug) {
  const city = getCity(citySlug);
  if (!city) return null;
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

function getServiceSeo(citySlug, serviceSlug) {
  const city = getCity(citySlug);
  const meta = SERVICE_META[serviceSlug];
  if (!city || !meta) return null;
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
