/*
 * «Выпечка» казахской версии страницы — server-side эквивалент того, что
 * клиентский applyLang('kk') (seo-layout.js) делает в браузере через
 * textContent/innerHTML/placeholder-своп, только один раз на сервере, ДО
 * отправки ответа — чтобы поисковик на /kz/... видел настоящий казахский
 * текст в HTML, а не русский с JS-переключателем поверх.
 *
 * ⚠️⚠️ ПОЧЕМУ REGEX-ПРОХОД ПО ГОТОВОМУ HTML, А НЕ ПРОТАСКИВАНИЕ lang ЧЕРЕЗ
 * КАЖДЫЙ БИЛДЕР (seo-blocks.js/seo-cards.js): эти файлы и так уже кладут
 * data-kk="<казахский>" на каждый переводимый элемент — вся работа уже
 * сделана для клиентского тоггла. bakeKk() применяет её на сервере вместо
 * браузера. RU-рендер (seo-blocks.js/seo-cards.js) не трогается вообще —
 * ноль риска регрессии на уже работающих страницах.
 *
 * Безопасность regex-подхода опирается на СУЩЕСТВУЮЩЕЕ правило проекта:
 * data-kk ставится ТОЛЬКО на элемент, чьё содержимое — целиком текст (если
 * рядом иконка <svg>, для неё отдельный <span> — иначе клиентский
 * textContent-своп стёр бы иконку). Это же условие делает regex-замену
 * между `>` и следующим `<` безопасной и однозначной.
 *
 * Значения атрибутов создаёт esc() в i18n-kk.js — экранирует &<>" — поэтому
 * внутри data-kk="..."/data-kk-html="..."/data-kk-ph="..." НИКОГДА нет
 * необработанных кавычек или `>` — атрибут гарантированно обрывается на
 * первой же `"`, регексу не нужно думать про экранированные кавычки.
 */

// Обратное к esc() в i18n-kk.js — раскодирует &amp; &lt; &gt; &quot; обратно.
// Порядок важен: &amp; ПОСЛЕДНИМ, иначе "&amp;lt;" превратится в "&lt;" вместо "&".
function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/*
 * data-kk-html — своп ЧЕРЕЗ innerHTML (значение атрибута может содержать
 * теги, напр. "тағы <b>5</b> көше"). Матчим по имени тега через обратную
 * ссылку \1, чтобы взять именно СВОЙ закрывающий тег — работает корректно,
 * пока внутри элемента с data-kk-html нет ВЛОЖЕННОГО элемента С ТЕМ ЖЕ
 * именем тега (в реальных шаблонах — не встречается: там div/dd/span
 * снаружи, b/br внутри, разные имена).
 */
function bakeHtmlAttr(html) {
  return html.replace(
    /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)\sdata-kk-html="([^"]*)"([^>]*)>[\s\S]*?<\/\1>/g,
    (_m, tag, before, kkAttr, after) => {
      const inner = decodeEntities(kkAttr);
      return `<${tag}${before}${after}>${inner}</${tag}>`;
    },
  );
}

// data-kk — обычный текстовый своп (textContent). Идёт ПОСЛЕ bakeHtmlAttr(),
// чтобы не трогать то, что уже собрано целиком через data-kk-html.
function bakeTextAttr(html) {
  return html.replace(
    /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)\sdata-kk="([^"]*)"([^>]*)>([^<]*)</g,
    (_m, tag, before, kkAttr, after, _oldText) => {
      const text = decodeEntities(kkAttr);
      // esc() тем же способом, что и весь остальной HTML в проекте — на
      // случай, если сам казахский текст содержит & (напр. "и" как "&").
      const reEscaped = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<${tag}${before}${after}>${reEscaped}<`;
    },
  );
}

// data-kk-ph — placeholder. Проходим по каждому тегу отдельно (не по
// содержимому — своих открывающих/закрывающих тегов у placeholder нет).
// Сам data-kk-ph убираем из тега (как и data-kk/data-kk-html в других
// функциях) — иначе на /kz/ странице остался бы бесполезный мёртвый атрибут.
function bakePlaceholderAttr(html) {
  return html.replace(/<[a-zA-Z][^>]*>/g, (tag) => {
    const m = tag.match(/\sdata-kk-ph="([^"]*)"/);
    if (!m) return tag;
    let out = tag.replace(/\sdata-kk-ph="[^"]*"/, '');
    if (/\splaceholder="[^"]*"/.test(out)) {
      out = out.replace(/\splaceholder="[^"]*"/, ` placeholder="${m[1]}"`);
    } else {
      out = out.replace('>', ` placeholder="${m[1]}">`);
    }
    return out;
  });
}

/*
 * ⚠️ Строки БЕЗ data-kk (напр. connectivityBannerHtml() — хардкод на
 * русском без атрибута, или любой текст вне словаря KK) остаются русскими —
 * то же самое ограничение, что уже принято и озвучено для клиентского
 * тоггла: живые данные парсера (адреса, причины отключений) не переводятся,
 * словаря для произвольного текста нет и не будет.
 */
function bakeKk(html) {
  let out = bakeHtmlAttr(html);
  out = bakeTextAttr(out);
  out = bakePlaceholderAttr(out);
  return out;
}

module.exports = { bakeKk, decodeEntities };
