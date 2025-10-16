"use strict";

/* =========================
   Utils dates
   ========================= */
function normalizeDate(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeekMonday(d) {
  const x = normalizeDate(d);
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - (day - 1));
  return normalizeDate(x);
}
function ymdKey(d) {
  return d.toISOString().split("T")[0];
}
function parseDate(str) {
  const d = new Date(str);
  return isNaN(d) ? new Date() : d;
}
function base64ToUtf8(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

/* =========================
   Couleurs catégories (dynamiques)
   ========================= */
function buildCategoryColorMap(categories) {
  const palette = [
    "#4B73FA", "#FF6F61", "#2ECC71", "#F4C542", "#9B59B6",
    "#00B8D9", "#E67E22", "#1ABC9C", "#E84393", "#16A085",
    "#D35400", "#2980B9", "#C0392B", "#27AE60", "#8E44AD"
  ];
  const colorMap = { Tous: "none", Autre: "#555555" };
  let i = 0;
  for (const c of categories) {
    if (c === "Tous" || c === "Autre") continue;
    colorMap[c] = palette[i % palette.length];
    i++;
  }
  return colorMap;
}

/* =========================
   Stroke interne + halo coloré (stable & pixel-aligned)
   ========================= */
function getStrokeWidthPx() {
  const dpr = window.devicePixelRatio || 1;
  if (dpr >= 3) return 0.9;
  if (dpr >= 2) return 0.8;
  return 0.7;
}

function applyInnerStroke(linkEl, whiteAlpha = 0.5, colorHint = null) {
  const baseW = 0.8;
  const dpr = window.devicePixelRatio || 1;
  const w = baseW * (dpr >= 2 ? 0.9 : 1);
  const pixelAligned = Math.round(w * dpr) / dpr;

  const strokeColor = "rgba(255,255,255," + whiteAlpha + ")";
  const hint =
    colorHint && /^#([0-9A-Fa-f]{6})$/.test(colorHint)
      ? colorHint + "40"
      : "rgba(0,0,0,0.15)";

  const stroke1 = "inset " + (pixelAligned * 0.6) + "px " + pixelAligned + "px 0 0 " + strokeColor;
  const stroke2 = "inset -" + (pixelAligned * 0.6) + "px -" + pixelAligned + "px 0 0 " + strokeColor;
  const stroke3 = "inset 0 " + (pixelAligned * 0.7) + "px 0 0 " + strokeColor;
  const stroke4 = "inset 0 -" + (pixelAligned * 0.7) + "px 0 0 " + strokeColor;
  const shadowSoft = "0 6px 26px " + hint + ", 0 2px 8px rgba(0,0,0,0.15)";

  linkEl.style.boxShadow = stroke1 + ", " + stroke2 + ", " + stroke3 + ", " + stroke4 + ", " + shadowSoft;
  linkEl.style.border = "none";
  linkEl.style.backfaceVisibility = "hidden";
  linkEl.style.webkitTransform = "translateZ(0)";
}
function clearInnerStroke(linkEl) {
  linkEl.style.boxShadow = "";
  linkEl.style.border = "";
}

/* =========================
   Lazy helpers (LQIP + IO)
   ========================= */
var ioThumb = null;
function ensureThumbObserver() {
  if (ioThumb) return ioThumb;
  ioThumb = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const real = el.getAttribute("data-bg");
      if (real) {
        el.style.backgroundImage = "url('" + real + "')";
        el.classList.add("thumb-ready");
        el.removeAttribute("data-bg");
      }
      ioThumb.unobserve(el);
    });
  }, { rootMargin: "200px 0px", threshold: 0.01 });
  return ioThumb;
}
function prepareThumb(divEl, realUrl) {
  divEl.style.backgroundImage = "url('data:image/gif;base64,R0lGODlhAQABAAAAACw=')";
  divEl.style.filter = "blur(8px)";
  divEl.style.transform = "translateZ(0)";
  divEl.setAttribute("data-bg", realUrl);
  ensureThumbObserver().observe(divEl);
}

/* =========================
   Chargement principal (feed)
   ========================= */
async function loadArticles() {
  var container = document.getElementById("articles");
  var hottestContainer = document.getElementById("hottest");
  var categoriesContainer = document.getElementById("categories");

  var repo = "Clayton630/QuartzReport";
  var branch = "main";
  var workerBase = "https://quartzreport-oauth.claytonelhorga.workers.dev/api";

  try {
    var resp = await fetch(workerBase + "/repos/" + repo + "/contents/articles?ref=" + branch + "&_=" + Date.now(), { cache: "force-cache" });
    if (!resp.ok) throw new Error("Erreur chargement liste articles");

    var files = await resp.json();
    var mdFiles = files.filter(function (f) { return /\.md$/i.test(f.name); });

    async function fetchAllWithLimit(urls, limit) {
      var results = [];
      var i = 0;
      async function next() {
        if (i >= urls.length) return;
        var idx = i++;
        try {
          var r = await fetch(urls[idx], { cache: "force-cache" });
          results[idx] = await r.json();
        } catch (e) {
          results[idx] = null;
        }
        return next();
      }
      var workers = [];
      for (var k = 0; k < limit; k++) workers.push(next());
      await Promise.all(workers);
      return results;
    }

    var urls = mdFiles.map(function (file) {
      return workerBase + "/repos/" + repo + "/contents/articles/" + file.name + "?ref=" + branch;
    });

    var apiDatas = await fetchAllWithLimit(urls, 6);

    var all = [];
    for (var i = 0; i < mdFiles.length; i++) {
      var file = mdFiles[i];
      var apiData = apiDatas[i];
      if (!apiData || !apiData.content) continue;
      var text = base64ToUtf8(apiData.content);

      var match = text.match(/^---([\s\S]*?)---([\s\S]*)$/);
      var meta = {}, body = text;
      if (match) {
        var yaml = match[1].trim();
        body = match[2].trim();
        yaml.split("\n").forEach(function (line) {
          var parts = line.split(":");
          var k = parts.shift().trim();
          var rest = parts.join(":").trim().replace(/^"|"$/g, "");
          meta[k] = rest;
        });
      }

      var dateObj = parseDate(meta.date || "");
      var slug = file.name.replace(/\.md$/i, "");
      var cover = meta.thumbnail || "img/article-placeholder.jpg";
      var firstImg = body.match(/!\[.*?\]\((.*?)\)/);
      if (!meta.thumbnail && firstImg) cover = firstImg[1];

      all.push({
        filename: file.name,
        slug: slug,
        title: meta.title || "Sans titre",
        date: dateObj,
        author: meta.author || "Inconnu",
        description: meta.description || "",
        thumbnail: cover,
        category: meta.category || "Autre",
        important: meta.important === "true" || meta.important === true,
        body: body
      });
    }

    all.sort(function (a, b) { return b.date - a.date; });

    /* ======================
       SECTION HOTTEST (3 max)
       ====================== */
    hottestContainer.innerHTML = "";
    var hottest = all.filter(function (a) { return a.important; }).slice(0, 3);

    (function renderHottest() {
      var frag = document.createDocumentFragment();
      for (var j = 0; j < hottest.length; j++) {
        var article = hottest[j];
        var link = document.createElement("a");
        link.href = "article.html?slug=" + encodeURIComponent(article.slug) + "&file=" + encodeURIComponent(article.filename);
        link.className = "card";

        var now = new Date();
        var isToday =
          article.date.getDate() === now.getDate() &&
          article.date.getMonth() === now.getMonth() &&
          article.date.getFullYear() === now.getFullYear();

        var dateDisplay = isToday
          ? "à " + article.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
          : article.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

        var loadingAttr = j === 0 ? "eager" : "lazy";

        link.innerHTML =
          '<img src="' + article.thumbnail + '" alt="" decoding="async" loading="' + loadingAttr + '">' +
          '<div class="card-content">' +
          '  <p class="card-meta">Par ' + article.author + ', ' + dateDisplay + '</p>' +
          '  <h3>' + article.title + '</h3>' +
          '</div>';

        frag.appendChild(link);
      }
      hottestContainer.appendChild(frag);
    })();

    /* ======================
       Préchargement immédiat hottest images (optimisation #2)
       ====================== */
    document.addEventListener("DOMContentLoaded", function () {
      const hottestImgs = hottestContainer.querySelectorAll("img");
      hottestImgs.forEach(img => {
        const src = img.getAttribute("src");
        if (src) {
          const preload = new Image();
          preload.src = src;
          preload.decoding = "async";
        }
      });
    });

    /* ======================
       RENDER PRINCIPAL (mobile/desktop)
       ====================== */
    async function render(list) {
      container.innerHTML = "";
      var isMobile = window.matchMedia("(max-width: 768px)").matches;

      if (isMobile) {
        var byDay = {};
        list.forEach(function (a) {
          var key = ymdKey(a.date);
          (byDay[key] || (byDay[key] = [])).push(a);
        });

        var sortedDays = Object.keys(byDay).sort(function (a, b) { return new Date(b) - new Date(a); });

        for (var dIdx = 0; dIdx < sortedDays.length; dIdx++) {
          var k = sortedDays[dIdx];
          var d = new Date(k);
          var dateStr = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

          var block = document.createElement("div");
          block.className = "day-block";
          block.innerHTML = '<h3 class="day-title">' + dateStr + '</h3>';
          container.appendChild(block);

          var articles = byDay[k].sort(function (a, b) { return b.date - a.date; });

          for (var i4 = 0; i4 < articles.length; i4 += 4) {
            var chunk = articles.slice(i4, i4 + 4);
            var frag = document.createDocumentFragment();
            chunk.forEach(function (article, idx) {
              var time = article.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
              var el = document.createElement("div");
              el.className = "day-article";
              el.innerHTML =
                '<a href="article.html?slug=' + encodeURIComponent(article.slug) + '&file=' + encodeURIComponent(article.filename) + '" class="day-article-link">' +
                '  <div class="thumb"></div>' +
                '  <div class="day-article-info">' +
                '    <p class="day-meta">Par ' + article.author + ', à ' + time + '</p>' +
                '    <h4>' + article.title + '</h4>' +
                '    <p class="day-desc">' + article.description + '</p>' +
                '  </div>' +
                '</a>';
              var t = el.querySelector(".thumb");
              prepareThumb(t, article.thumbnail);
              frag.appendChild(el);
              if (idx < chunk.length - 1 || i4 + chunk.length < articles.length) {
                var sep = document.createElement("div");
                sep.className = "day-separator";
                frag.appendChild(sep);
              }
            });
            block.appendChild(frag);
            await new Promise(function (res) { setTimeout(res, 200); });
          }
        }
      } else {
        // Desktop groupé par semaine
        var mondayThis = startOfWeekMonday(new Date());
        var mondayNext = addDays(mondayThis, 7);
        var mondayPrev = addDays(mondayThis, -7);
        var weeks = { current: {}, previous: {}, others: {} };

        list.forEach(function (article) {
          var d = normalizeDate(article.date);
          var dayKey = ymdKey(d);
          var dTime = d.getTime();
          var mondayThisTime = mondayThis.getTime();
          var mondayNextTime = mondayNext.getTime();
          var mondayPrevTime = mondayPrev.getTime();

          if (dTime >= mondayThisTime && dTime < mondayNextTime)
            (weeks.current[dayKey] || (weeks.current[dayKey] = [])).push(article);
          else if (dTime >= mondayPrevTime && dTime < mondayThisTime)
            (weeks.previous[dayKey] || (weeks.previous[dayKey] = [])).push(article);
          else {
            var wk = startOfWeekMonday(d);
            var wkKey = ymdKey(wk);
            (weeks.others[wkKey] || (weeks.others[wkKey] = {}));
            (weeks.others[wkKey][dayKey] || (weeks.others[wkKey][dayKey] = [])).push(article);
          }
        });

        async function renderWeek(title, daysMap) {
          if (!Object.keys(daysMap).length) return;
          var weekBlock = document.createElement("div");
          weekBlock.className = "week-block";
          weekBlock.innerHTML = '<h3 class="week-title">' + title + '</h3>';

          var carousel = document.createElement("div");
          carousel.className = "week-carousel";

          var sortedDays = Object.keys(daysMap).sort(function (a, b) { return new Date(b) - new Date(a); });
          for (var di = 0; di < sortedDays.length; di++) {
            var dayKey = sortedDays[di];
            var d = new Date(dayKey);
            var label = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

            var dayBlock = document.createElement("div");
            dayBlock.className = "day-block";
            dayBlock.innerHTML = '<h3 class="day-title">' + label + '</h3>';

            var articles = daysMap[dayKey].sort(function (a, b) { return b.date - a.date; });
            for (var i5 = 0; i5 < articles.length; i5 += 4) {
              var chunk = articles.slice(i5, i5 + 4);
              var frag = document.createDocumentFragment();
              chunk.forEach(function (article, idx) {
                var time = article.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                var el = document.createElement("div");
                el.className = "day-article";
                el.innerHTML =
                  '<a href="article.html?slug=' + encodeURIComponent(article.slug) + '&file=' + encodeURIComponent(article.filename) + '" class="day-article-link">' +
                  '  <div class="thumb"></div>' +
                  '  <div class="day-article-info">' +
                  '    <p class="day-meta">Par ' + article.author + ', à ' + time + '</p>' +
                  '    <h4>' + article.title + '</h4>' +
                  '    <p class="day-desc">' + article.description + '</p>' +
                  '  </div>' +
                  '</a>';
                var t = el.querySelector(".thumb");
                prepareThumb(t, article.thumbnail);
                frag.appendChild(el);
                if (idx < chunk.length - 1 || i5 + chunk.length < articles.length) {
                  var sep = document.createElement("div");
                  sep.className = "day-separator";
                  frag.appendChild(sep);
                }
              });
              dayBlock.appendChild(frag);
              await new Promise(function (res) { setTimeout(res, 200); });
            }
            carousel.appendChild(dayBlock);
          }

          weekBlock.appendChild(carousel);
          container.appendChild(weekBlock);
        }

        await renderWeek("Cette semaine", weeks.current);
        await renderWeek("La semaine dernière", weeks.previous);

        var otherWeeks = Object.keys(weeks.others).sort(function (a, b) { return new Date(b) - new Date(a); });
        for (var wkIdx = 0; wkIdx < otherWeeks.length; wkIdx++) {
          var wkKey = otherWeeks[wkIdx];
          var start = new Date(wkKey);
          var end = addDays(start, 6);
          var title = "Semaine du " + start.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) +
                      " au " + end.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
          await renderWeek(title, weeks.others[wkKey]);
        }
      }
    }

    /* ======================
       Catégories (construction + styles dynamiques)
       ====================== */
    function buildCategories(list, active) {
      if (active == null) active = "Tous";
      if (!categoriesContainer) return;

      var nav = categoriesContainer.closest(".main-nav");
      var prevScroll = nav ? nav.scrollLeft : 0;

      var cats = Array.from(new Set(list.map(function (a) { return a.category; })));
      cats = cats.filter(function (c) { return c !== "Autre"; });
      cats.push("Autre");

      var colorMap = buildCategoryColorMap(cats);

      var html = '<li><a href="#" data-category="Tous" class="' + (active === "Tous" ? "active" : "") + '">Tous</a></li>' +
        cats.map(function (c) {
          return '<li><a href="#" data-category="' + c + '" class="' + (active === c ? "active" : "") + '">' + c + '</a></li>';
        }).join("");
      categoriesContainer.innerHTML = html;

      function applyActive(cat) {
        categoriesContainer.querySelectorAll("a").forEach(function (a) {
          a.style.background = "";
          a.style.color = "";
          a.style.backdropFilter = "";
          a.style.webkitBackdropFilter = "";
          clearInnerStroke(a);
        });

        var link = categoriesContainer.querySelector('a[data-category="' + cat + '"]');
        if (!link) return;

        if (cat === "Tous") {
          link.style.background = "rgba(255,255,255,0.22)";
          link.style.color = "#111";
        } else {
          var baseColor = colorMap[cat] || "#4B73FA";
          link.style.background = baseColor + "CC";
          link.style.color = "rgba(255,255,255,0.88)";
          link.style.backdropFilter = "blur(6px) saturate(180%)";
          link.style.webkitBackdropFilter = "blur(6px) saturate(180%)";
        }
        applyInnerStroke(link, 0.5, cat === "Tous" ? null : colorMap[cat]);
      }

      if (nav) requestAnimationFrame(function () { nav.scrollLeft = prevScroll; });

      categoriesContainer.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", function (e) {
          e.preventDefault();
          var cat = link.getAttribute("data-category");
          categoriesContainer.querySelectorAll("a").forEach(function (a) { a.classList.remove("active"); });
          link.classList.add("active");
          applyActive(cat);
          var filtered = cat === "Tous" ? all : all.filter(function (a) { return a.category === cat; });
          render(filtered);
        });
      });

      applyActive(active);
    }

    buildCategories(all, "Tous");
    await render(all);

    var css = document.createElement("style");
    css.textContent =
      ".thumb { transition: filter 220ms ease; }" +
      ".thumb-ready { filter: blur(0px) !important; }";
    document.head.appendChild(css);

  } catch (err) {
    console.error(err);
    var container2 = document.getElementById("articles");
    if (container2) container2.innerHTML = "<p>Erreur lors du chargement des articles.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadArticles);

/* ==============================
   Bouton combiné (recherche + menu)
   ============================== */
document.addEventListener("DOMContentLoaded", function () {
  var searchIcon = document.querySelector(".search-icon");
  var menuIcon = document.querySelector(".menu-icon");

  if (searchIcon) {
    searchIcon.addEventListener("click", function (e) {
      e.stopPropagation();
      console.log("Recherche ouverte");
    });
  }

  if (menuIcon) {
    menuIcon.addEventListener("click", function (e) {
      e.stopPropagation();
      console.log("Menu ouvert");
    });
  }
});
