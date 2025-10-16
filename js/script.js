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
   Stroke interne + halo coloré (stable)
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

  const strokeColor = `rgba(255,255,255,${whiteAlpha})`;
  const hint =
    colorHint && /^#([0-9A-Fa-f]{6})$/.test(colorHint)
      ? colorHint + "40"
      : "rgba(0,0,0,0.15)";

  // 2 diagonales + haut/bas (côtés visuellement plus fins)
  const stroke1 = `inset ${pixelAligned * 0.6}px ${pixelAligned}px 0 0 ${strokeColor}`;     // bas-droite
  const stroke2 = `inset -${pixelAligned * 0.6}px -${pixelAligned}px 0 0 ${strokeColor}`;   // haut-gauche
  const stroke3 = `inset 0 ${pixelAligned * 0.7}px 0 0 ${strokeColor}`;                     // bas
  const stroke4 = `inset 0 -${pixelAligned * 0.7}px 0 0 ${strokeColor}`;                    // haut
  const shadowSoft = `0 6px 26px ${hint}, 0 2px 8px rgba(0,0,0,0.15)`;

  linkEl.style.boxShadow = `${stroke1}, ${stroke2}, ${stroke3}, ${stroke4}, ${shadowSoft}`;
  linkEl.style.border = "none";
  linkEl.style.backfaceVisibility = "hidden";
  linkEl.style.webkitTransform = "translateZ(0)";
}
function clearInnerStroke(linkEl) {
  linkEl.style.boxShadow = "";
  linkEl.style.border = "";
}

/* =========================
   requestIdleCallback (polyfill léger)
   ========================= */
(function ensureRIC() {
  if (!("requestIdleCallback" in window)) {
    window.requestIdleCallback = function (cb, { timeout } = {}) {
      const start = Date.now();
      return setTimeout(() => {
        cb({
          didTimeout: !!timeout && (Date.now() - start) > timeout,
          timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
        });
      }, 1);
    };
    window.cancelIdleCallback = function (id) { clearTimeout(id); };
  }
})();

/* =========================
   Lazy loading BG (thumb) + LQIP + pré-cache
   ========================= */
let ioThumb = null;
function ensureThumbObserver() {
  if (ioThumb) return ioThumb;
  ioThumb = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const real = el.getAttribute("data-bg");
      if (real) {
        el.style.backgroundImage = `url('${real}')`;
        el.style.transition = "filter 0.4s ease-out";
        el.style.filter = "blur(0px)";
        setTimeout(() => { el.style.filter = "blur(0px)"; }, 20);
        el.removeAttribute("data-bg");
        queueIdlePreload(real);
      }
      ioThumb.unobserve(el);
    });
  }, { rootMargin: "200px 0px", threshold: 0.01 });
  return ioThumb;
}

function prepareThumb(divEl, realUrl) {
  // 1x1 transparent (évite reflow/clignotement)
  divEl.style.backgroundImage = "url('data:image/gif;base64,R0lGODlhAQABAAAAACw=')";
  divEl.style.filter = "blur(8px)";
  divEl.style.transform = "translateZ(0)";
  divEl.setAttribute("data-bg", realUrl);
  ensureThumbObserver().observe(divEl);
}

/* =========================
   Pré-cache images quand le thread est idle
   ========================= */
const preloadQueue = new Set();
let idleScheduled = false;

function queueIdlePreload(url) {
  if (!url || preloadQueue.has(url)) return;
  preloadQueue.add(url);
  if (!idleScheduled) {
    idleScheduled = true;
    requestIdleCallback(preloadNextImage, { timeout: 1500 });
  }
}

function preloadNextImage(deadline) {
  while ((deadline.timeRemaining() > 5 || deadline.didTimeout) && preloadQueue.size) {
    const url = preloadQueue.values().next().value;
    preloadQueue.delete(url);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }
  if (preloadQueue.size) {
    requestIdleCallback(preloadNextImage, { timeout: 1500 });
  } else {
    idleScheduled = false;
  }
}

/* =========================
   Chargement principal
   ========================= */
async function loadArticles() {
  const container = document.getElementById("articles");
  const hottestContainer = document.getElementById("hottest");
  const categoriesContainer = document.getElementById("categories");

  const repo = "Clayton630/QuartzReport";
  const branch = "main";
  const workerBase = "https://quartzreport-oauth.claytonelhorga.workers.dev/api";

  try {
    // Liste des fichiers
    const resp = await fetch(`${workerBase}/repos/${repo}/contents/articles?ref=${branch}&_=${Date.now()}`, { cache: "no-store" });
    if (!resp.ok) throw new Error("Erreur chargement liste articles");
    const files = await resp.json();
    const mdFiles = files.filter(f => /\.md$/i.test(f.name));

    // Concurrency-limited fetch
    async function fetchAllWithLimit(urls, limit) {
      const results = new Array(urls.length);
      let idx = 0;
      async function runner() {
        while (idx < urls.length) {
          const i = idx++;
          try {
            const r = await fetch(urls[i], { cache: "force-cache" });
            results[i] = await r.json();
          } catch {
            results[i] = null;
          }
        }
      }
      const workers = new Array(Math.min(limit, urls.length)).fill(0).map(runner);
      await Promise.all(workers);
      return results;
    }

    const urls = mdFiles.map(file =>
      `${workerBase}/repos/${repo}/contents/articles/${file.name}?ref=${branch}`
    );
    const apiDatas = await fetchAllWithLimit(urls, 6);

    const all = [];
    for (let i = 0; i < mdFiles.length; i++) {
      const file = mdFiles[i];
      const apiData = apiDatas[i];
      if (!apiData || !apiData.content) continue;

      const text = base64ToUtf8(apiData.content);

      // Front-matter
      const match = text.match(/^---([\s\S]*?)---([\s\S]*)$/);
      let meta = {}, body = text;
      if (match) {
        const yaml = match[1].trim();
        body = match[2].trim();
        yaml.split("\n").forEach(line => {
          const [k, ...rest] = line.split(":");
          meta[k.trim()] = rest.join(":").trim().replace(/^"|"$/g, "");
        });
      }

      const dateObj = parseDate(meta.date || "");
      const slug = file.name.replace(/\.md$/i, "");
      let cover = meta.thumbnail || "img/article-placeholder.jpg";
      const firstImg = body.match(/!\[.*?\]\((.*?)\)/);
      if (!meta.thumbnail && firstImg) cover = firstImg[1];

      all.push({
        filename: file.name,
        slug,
        title: meta.title || "Sans titre",
        date: dateObj,
        author: meta.author || "Inconnu",
        description: meta.description || "",
        thumbnail: cover,
        category: meta.category || "Autre",
        important: meta.important === "true" || meta.important === true,
        body
      });
    }

    // Tri récents → anciens
    all.sort((a, b) => b.date - a.date);

    /* ======================
       HOTTEST
       ====================== */
    hottestContainer.innerHTML = "";
    const hottest = all.filter(a => a.important).slice(0, 3);
    const hottestFrag = document.createDocumentFragment();
    hottest.forEach((article, i) => {
      const link = document.createElement("a");
      link.href = `article.html?slug=${encodeURIComponent(article.slug)}&file=${encodeURIComponent(article.filename)}`;
      link.className = "card";

      const now = new Date();
      const isToday =
        article.date.getDate() === now.getDate() &&
        article.date.getMonth() === now.getMonth() &&
        article.date.getFullYear() === now.getFullYear();
      const dateDisplay = isToday
        ? `à ${article.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
        : article.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

      // image hottest (1ère eager, le reste lazy)
      const imgLoading = i === 0 ? "eager" : "lazy";
      link.innerHTML = `
        <img src="${article.thumbnail}" alt="" decoding="async" loading="${imgLoading}">
        <div class="card-content">
          <p class="card-meta">Par ${article.author}, ${dateDisplay}</p>
          <h3>${article.title}</h3>
        </div>
      `;
      hottestFrag.appendChild(link);
    });
    hottestContainer.appendChild(hottestFrag);

    /* ======================
       RENDER FEED (mobile + desktop)
       ====================== */
    async function render(list) {
      container.innerHTML = "";
      const isMobile = window.matchMedia("(max-width: 768px)").matches;

      if (isMobile) {
        // Groupé par jour
        const byDay = {};
        list.forEach(a => (byDay[ymdKey(a.date)] ||= []).push(a));
        const sortedDays = Object.keys(byDay).sort((a, b) => new Date(b) - new Date(a));

        for (const k of sortedDays) {
          const d = new Date(k);
          const block = document.createElement("div");
          block.className = "day-block";
          block.innerHTML = `<h3 class="day-title">${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</h3>`;
          container.appendChild(block);

          const articles = byDay[k].sort((a, b) => b.date - a.date);
          for (let i = 0; i < articles.length; i += 4) {
            const chunk = articles.slice(i, i + 4);
            const frag = document.createDocumentFragment();
            chunk.forEach((article, idx) => {
              const time = article.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
              const el = document.createElement("div");
              el.className = "day-article";
              el.innerHTML = `
                <a href="article.html?slug=${encodeURIComponent(article.slug)}&file=${encodeURIComponent(article.filename)}" class="day-article-link">
                  <div class="thumb"></div>
                  <div class="day-article-info">
                    <p class="day-meta">Par ${article.author}, à ${time}</p>
                    <h4>${article.title}</h4>
                    <p class="day-desc">${article.description}</p>
                  </div>
                </a>`;
              const t = el.querySelector(".thumb");
              prepareThumb(t, article.thumbnail);
              frag.appendChild(el);
              if (idx < chunk.length - 1 || i + chunk.length < articles.length) {
                frag.appendChild(Object.assign(document.createElement("div"), { className: "day-separator" }));
              }
            });
            block.appendChild(frag);
            // micro-yield pour fluidifier le rendu
            await new Promise(res => setTimeout(res, 200));
          }
        }
      } else {
        // Desktop : groupé par semaine, puis par jour
        const mondayThis = startOfWeekMonday(new Date());
        const mondayNext = addDays(mondayThis, 7);
        const mondayPrev = addDays(mondayThis, -7);

        const weeks = { current: {}, previous: {}, others: {} };

        list.forEach(article => {
          const d = normalizeDate(article.date);
          const dayKey = ymdKey(d);
          const dTime = d.getTime();
          const mondayThisTime = mondayThis.getTime();
          const mondayNextTime = mondayNext.getTime();
          const mondayPrevTime = mondayPrev.getTime();

          if (dTime >= mondayThisTime && dTime < mondayNextTime)
            (weeks.current[dayKey] ||= []).push(article);
          else if (dTime >= mondayPrevTime && dTime < mondayThisTime)
            (weeks.previous[dayKey] ||= []).push(article);
          else {
            const wk = startOfWeekMonday(d);
            const wkKey = ymdKey(wk);
            (weeks.others[wkKey] ||= {});
            (weeks.others[wkKey][dayKey] ||= []).push(article);
          }
        });

        async function renderWeek(title, daysMap) {
          if (!Object.keys(daysMap).length) return;

          const weekBlock = document.createElement("div");
          weekBlock.className = "week-block";
          weekBlock.innerHTML = `<h3 class="week-title">${title}</h3>`;

          const carousel = document.createElement("div");
          carousel.className = "week-carousel";

          const sortedDays = Object.keys(daysMap).sort((a, b) => new Date(b) - new Date(a));
          for (const dayKey of sortedDays) {
            const d = new Date(dayKey);
            const label = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

            const dayBlock = document.createElement("div");
            dayBlock.className = "day-block";
            dayBlock.innerHTML = `<h3 class="day-title">${label}</h3>`;

            const articles = daysMap[dayKey].sort((a, b) => b.date - a.date);
            for (let i = 0; i < articles.length; i += 4) {
              const chunk = articles.slice(i, i + 4);
              const frag = document.createDocumentFragment();

              chunk.forEach((article, idx) => {
                const time = article.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                const el = document.createElement("div");
                el.className = "day-article";
                el.innerHTML = `
                  <a href="article.html?slug=${encodeURIComponent(article.slug)}&file=${encodeURIComponent(article.filename)}" class="day-article-link">
                    <div class="thumb"></div>
                    <div class="day-article-info">
                      <p class="day-meta">Par ${article.author}, à ${time}</p>
                      <h4>${article.title}</h4>
                      <p class="day-desc">${article.description}</p>
                    </div>
                  </a>`;
                const t = el.querySelector(".thumb");
                prepareThumb(t, article.thumbnail);
                frag.appendChild(el);
                if (idx < chunk.length - 1 || i + chunk.length < articles.length) {
                  frag.appendChild(Object.assign(document.createElement("div"), { className: "day-separator" }));
                }
              });

              dayBlock.appendChild(frag);
              await new Promise(res => setTimeout(res, 200)); // respiration du thread
            }

            carousel.appendChild(dayBlock);
          }

          weekBlock.appendChild(carousel);
          container.appendChild(weekBlock);
        }

        await renderWeek("Cette semaine", weeks.current);
        await renderWeek("La semaine dernière", weeks.previous);

        const otherWeeks = Object.keys(weeks.others).sort((a, b) => new Date(b) - new Date(a));
        for (const wkKey of otherWeeks) {
          const start = new Date(wkKey);
          const end = addDays(start, 6);
          const title = `Semaine du ${start.toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long"
          })} au ${end.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
          await renderWeek(title, weeks.others[wkKey]);
        }
      }
    }

    /* ======================
       Catégories (ordre, couleurs, stroke)
       ====================== */
    function buildCategories(list, active = "Tous") {
      if (!categoriesContainer) return;

      // mémorise la position de scroll
      const nav = categoriesContainer.closest(".main-nav");
      const prevScroll = nav ? nav.scrollLeft : 0;

      // « Autre » toujours tout à droite
      let cats = [...new Set(list.map(a => a.category))].filter(c => c !== "Autre");
      cats.push("Autre");

      const colorMap = buildCategoryColorMap(cats);

      // HTML
      const html =
        `<li><a href="#" data-category="Tous" class="${active === "Tous" ? "active" : ""}">Tous</a></li>` +
        cats.map(c => `<li><a href="#" data-category="${c}" class="${active === c ? "active" : ""}">${c}</a></li>`).join("");
      categoriesContainer.innerHTML = html;

      // applique styles sélection
      const applyActive = (cat) => {
        categoriesContainer.querySelectorAll("a").forEach(a => {
          a.style.background = "";
          a.style.color = "";
          a.style.backdropFilter = "";
          a.style.webkitBackdropFilter = "";
          clearInnerStroke(a);
        });

        const link = categoriesContainer.querySelector(`a[data-category="${cat}"]`);
        if (!link) return;

        if (cat === "Tous") {
          // fond « verre » ultra léger + texte noir
          link.style.background = "rgba(255,255,255,0.22)";
          link.style.color = "#111";
          applyInnerStroke(link, 0.5, null);
        } else {
          const baseColor = colorMap[cat] || "#4B73FA";
          link.style.background = baseColor + "CC"; // ~80% opacité
          link.style.color = "rgba(255,255,255,0.88)";
          link.style.backdropFilter = "blur(6px) saturate(180%)";
          link.style.webkitBackdropFilter = "blur(6px) saturate(180%)";
          applyInnerStroke(link, 0.5, baseColor);
        }
      };

      // restaure scroll
      if (nav) requestAnimationFrame(() => { nav.scrollLeft = prevScroll; });

      // click handlers
      categoriesContainer.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", e => {
          e.preventDefault();
          const cat = link.getAttribute("data-category");

          categoriesContainer.querySelectorAll("a").forEach(a => a.classList.remove("active"));
          link.classList.add("active");

          applyActive(cat);

          const filtered = cat === "Tous" ? all : all.filter(a => a.category === cat);
          render(filtered);
        });
      });

      // état initial
      applyActive(active);
    }

    // init
    buildCategories(all, "Tous");
    await render(all);

  } catch (err) {
    console.error(err);
    const container = document.getElementById("articles");
    if (container) container.innerHTML = "<p>Erreur lors du chargement des articles.</p>";
  }
}

/* =========================
   DOM ready
   ========================= */
document.addEventListener("DOMContentLoaded", loadArticles);

/* =========================
   Bouton combiné (recherche + menu)
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  const searchIcon = document.querySelector(".search-icon");
  const menuIcon = document.querySelector(".menu-icon");

  if (searchIcon) {
    searchIcon.addEventListener("click", e => {
      e.stopPropagation();
      console.log("Recherche ouverte");
    });
  }

  if (menuIcon) {
    menuIcon.addEventListener("click", e => {
      e.stopPropagation();
      console.log("Menu ouvert");
    });
  }
});
