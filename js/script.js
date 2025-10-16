// ========= Utils perf =========
const rIC = window.requestIdleCallback || (cb => setTimeout(cb, 1));
const nowTs = () => Date.now();

// ========= Fonctions utilitaires de date =========
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

// ========= Format dates (évite recréer des objets) =========
const DATE_OPTS_SHORT = { day: "numeric", month: "short" };
const DATE_OPTS_LONG  = { day: "numeric", month: "long" };
const TIME_OPTS_HM    = { hour: "2-digit", minute: "2-digit" };

// ========= Couleurs catégories (dynamiques) =========
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

// ========= Stroke interne + halo coloré (inchangé visuellement) =========
function getStrokeWidthPx() {
  const dpr = window.devicePixelRatio || 1;
  if (dpr >= 3) return 0.9;
  if (dpr >= 2) return 0.8;
  return 0.7;
}
function applyInnerStroke(linkEl, whiteAlpha = 0.5, colorHint = null) {
  const baseW = 0.8;
  const w = baseW * (window.devicePixelRatio >= 2 ? 0.9 : 1);
  const pixelAligned = Math.round(w * (window.devicePixelRatio || 1)) / (window.devicePixelRatio || 1);

  const strokeColor = `rgba(255,255,255,${whiteAlpha})`; // ✅ Blanc adouci
  const hint = colorHint ? colorHint + "40" : "rgba(0,0,0,0.15)";

  // ✅ Stroke équilibré haut/bas, côtés plus fins (identique au rendu actuel)
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

// ========= Cache léger (optimiste, sans changer le rendu final) =========
const CACHE_KEY = "qr_cache_v1";
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes (affiche instantanément si récent)
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (!ts || !data) return null;
    if (nowTs() - ts > CACHE_TTL_MS) return null;
    // réhydrate les dates pour le tri
    data.forEach(a => a.date = new Date(a.date));
    return data;
  } catch { return null; }
}
function saveCache(list) {
  try {
    const minimal = list.map(a => ({
      filename: a.filename,
      slug: a.slug,
      title: a.title,
      date: a.date, // ISO via JSON
      author: a.author,
      description: a.description,
      thumbnail: a.thumbnail,
      category: a.category,
      important: !!a.important,
      // body inutile pour l’index, mais on garde structure identique
    }));
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: nowTs(), data: minimal }));
  } catch {}
}

// ========= Concurrence limitée pour les fetchs =========
async function limitedMap(items, limit, mapper) {
  const ret = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const cur = i++;
      ret[cur] = await mapper(items[cur], cur);
    }
  });
  await Promise.all(workers);
  return ret;
}

// ========= Chargement principal (feed) =========
async function loadArticles() {
  const container = document.getElementById("articles");
  const hottestContainer = document.getElementById("hottest");
  const categoriesContainer = document.getElementById("categories");

  const repo = "Clayton630/QuartzReport";
  const branch = "main";
  const workerBase = "https://quartzreport-oauth.claytonelhorga.workers.dev/api";

  // 1) Si cache dispo, on affiche tout de suite (rendu identique), puis on rafraîchit en fond
  const cached = loadCache();
  if (cached && Array.isArray(cached) && cached.length) {
    // Tri (comme d’hab)
    cached.sort((a, b) => b.date - a.date);
    // Affiche instantané
    rIC(() => {
      buildAndRender(cached, { container, hottestContainer, categoriesContainer });
    });
  }

  try {
    // 2) Fetch liste des fichiers (HEAD)
    const listResp = await fetch(`${workerBase}/repos/${repo}/contents/articles?ref=${branch}&_=${Date.now()}`, { cache: "no-store" });
    if (!listResp.ok) throw new Error("Erreur chargement liste articles");
    const files = await listResp.json();

    // 3) Récupère le contenu de chaque .md en parallèle (concurrence limitée)
    const mdFiles = files.filter(f => f && f.name && f.name.endsWith(".md"));

    // Mapper de parsing (rapide)
    async function parseOne(file) {
      const apiResp = await fetch(`${workerBase}/repos/${repo}/contents/articles/${file.name}?ref=${branch}`, { cache: "no-store" });
      const apiData = await apiResp.json();
      const text = base64ToUtf8(apiData.content);

      const match = text.match(/^---([\s\S]*?)---([\s\S]*)$/);
      let meta = {}, body = text;
      if (match) {
        const yaml = match[1].trim();
        body = match[2].trim();
        // parse clé: valeur (simple, identique à l’existant)
        yaml.split("\n").forEach(line => {
          const idx = line.indexOf(":");
          if (idx === -1) return;
          const k = line.slice(0, idx).trim();
          const v = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
          meta[k] = v;
        });
      }

      const dateObj = parseDate(meta.date || "");
      const slug = file.name.replace(/\.md$/i, "");
      let cover = meta.thumbnail || "img/article-placeholder.jpg";
      const firstImg = body.match(/!$begin:math:display$.*?$end:math:display$$begin:math:text$(.*?)$end:math:text$/);
      if (!meta.thumbnail && firstImg) cover = firstImg[1];

      return {
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
      };
    }

    // Limite de concurrence (6 => bon équilibre latence/serveur)
    const all = (await limitedMap(mdFiles, 6, parseOne)).filter(Boolean);

    // 4) Tri
    all.sort((a, b) => b.date - a.date);

    // 5) Sauvegarde cache pour prochaines visites (instant load)
    rIC(() => saveCache(all));

    // 6) Rendu (identique à avant)
    await buildAndRender(all, { container, hottestContainer, categoriesContainer });

  } catch (err) {
    console.error(err);
    const c = container || document.getElementById("articles");
    if (c) c.innerHTML = "<p>Erreur lors du chargement des articles.</p>";
  }
}

// ========= Construction + rendu (strictement le même rendu visuel) =========
async function buildAndRender(all, ctx) {
  const { container, hottestContainer, categoriesContainer } = ctx;

  // ======================
  // SECTION HOTTEST (identique rendu, + lazy/async pour perf)
  // ======================
  if (hottestContainer) {
    hottestContainer.innerHTML = "";
    const hottest = all.filter(a => a.important).slice(0, 3);

    const frag = document.createDocumentFragment();
    const now = new Date();

    for (const article of hottest) {
      const link = document.createElement("a");
      link.href = `article.html?slug=${encodeURIComponent(article.slug)}&file=${encodeURIComponent(article.filename)}`;
      link.className = "card";

      const isToday =
        article.date.getDate() === now.getDate() &&
        article.date.getMonth() === now.getMonth() &&
        article.date.getFullYear() === now.getFullYear();

      const dateDisplay = isToday
        ? `à ${article.date.toLocaleTimeString("fr-FR", TIME_OPTS_HM)}`
        : article.date.toLocaleDateString("fr-FR", DATE_OPTS_SHORT);

      // width/height n’altèrent pas le style (aspect-ratio gère), mais aident le layout
      link.innerHTML = `
        <img src="${article.thumbnail}" alt="" loading="lazy" decoding="async" width="320" height="180">
        <div class="card-content">
          <p class="card-meta">Par ${article.author}, ${dateDisplay}</p>
          <h3>${article.title}</h3>
        </div>
      `;
      frag.appendChild(link);
    }
    hottestContainer.appendChild(frag);
  }

  // ======================
  // RENDER PRINCIPAL (strictement identique — on garde les chunks + 200ms)
  // ======================
  async function render(list) {
    if (!container) return;
    container.innerHTML = "";
    const isMobile = window.matchMedia("(max-width: 768px)").matches;

    if (isMobile) {
      // === VERSION MOBILE — par jour ===
      const byDay = {};
      for (const a of list) {
        const key = ymdKey(a.date);
        (byDay[key] ||= []).push(a);
      }

      const sortedDays = Object.keys(byDay).sort((a, b) => new Date(b) - new Date(a));
      for (const k of sortedDays) {
        const d = new Date(k);
        const dateStr = d.toLocaleDateString("fr-FR", DATE_OPTS_LONG);
        const block = document.createElement("div");
        block.className = "day-block";
        block.innerHTML = `<h3 class="day-title">${dateStr}</h3>`;
        container.appendChild(block);

        const articles = byDay[k].sort((a, b) => b.date - a.date);
        for (let i = 0; i < articles.length; i += 4) {
          const chunk = articles.slice(i, i + 4);
          const frag = document.createDocumentFragment();

          chunk.forEach((article, idx) => {
            const time = article.date.toLocaleTimeString("fr-FR", TIME_OPTS_HM);
            const el = document.createElement("div");
            el.className = "day-article";
            el.innerHTML = `
              <a href="article.html?slug=${encodeURIComponent(article.slug)}&file=${encodeURIComponent(article.filename)}" class="day-article-link">
                <div class="thumb" style="background-image:url('${article.thumbnail}')"></div>
                <div class="day-article-info">
                  <p class="day-meta">Par ${article.author}, à ${time}</p>
                  <h4>${article.title}</h4>
                  <p class="day-desc">${article.description}</p>
                </div>
              </a>`;
            frag.appendChild(el);
            if (idx < chunk.length - 1 || i + chunk.length < articles.length) {
              frag.appendChild(Object.assign(document.createElement("div"), { className: "day-separator" }));
            }
          });

          block.appendChild(frag);
          // ✅ conserve EXACTEMENT ton tempo progressif (ne pas modifier)
          await new Promise(res => setTimeout(res, 200));
        }
      }
    } else {
      // === VERSION DESKTOP — par semaine ===
      const mondayThis = startOfWeekMonday(new Date());
      const mondayNext = addDays(mondayThis, 7);
      const mondayPrev = addDays(mondayThis, -7);

      const weeks = { current: {}, previous: {}, others: {} };

      for (const article of list) {
        const d = normalizeDate(article.date);
        const dayKey = ymdKey(d);
        const dTime = d.getTime();
        const mondayThisTime = mondayThis.getTime();
        const mondayNextTime = mondayNext.getTime();
        const mondayPrevTime = mondayPrev.getTime();

        if (dTime >= mondayThisTime && dTime < mondayNextTime) {
          (weeks.current[dayKey] ||= []).push(article);
        } else if (dTime >= mondayPrevTime && dTime < mondayThisTime) {
          (weeks.previous[dayKey] ||= []).push(article);
        } else {
          const wk = startOfWeekMonday(d);
          const wkKey = ymdKey(wk);
          (weeks.others[wkKey] ||= {});
          (weeks.others[wkKey][dayKey] ||= []).push(article);
        }
      }

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
          const label = d.toLocaleDateString("fr-FR", DATE_OPTS_LONG);
          const dayBlock = document.createElement("div");
          dayBlock.className = "day-block";
          dayBlock.innerHTML = `<h3 class="day-title">${label}</h3>`;

          const articles = daysMap[dayKey].sort((a, b) => b.date - a.date);
          for (let i = 0; i < articles.length; i += 4) {
            const chunk = articles.slice(i, i + 4);
            const frag = document.createDocumentFragment();

            chunk.forEach((article, idx) => {
              const time = article.date.toLocaleTimeString("fr-FR", TIME_OPTS_HM);
              const el = document.createElement("div");
              el.className = "day-article";
              el.innerHTML = `
                <a href="article.html?slug=${encodeURIComponent(article.slug)}&file=${encodeURIComponent(article.filename)}" class="day-article-link">
                  <div class="thumb" style="background-image:url('${article.thumbnail}')"></div>
                  <div class="day-article-info">
                    <p class="day-meta">Par ${article.author}, à ${time}</p>
                    <h4>${article.title}</h4>
                    <p class="day-desc">${article.description}</p>
                  </div>
                </a>`;
              frag.appendChild(el);
              if (idx < chunk.length - 1 || i + chunk.length < articles.length) {
                frag.appendChild(Object.assign(document.createElement("div"), { className: "day-separator" }));
              }
            });

            dayBlock.appendChild(frag);
            // ✅ garde ton tempo
            await new Promise(res => setTimeout(res, 200));
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

  // ======================
  // CATÉGORIES (construction + styles dynamiques)
  // ======================
  function buildCategories(list, active = "Tous") {
    if (!categoriesContainer) return;

    const nav = categoriesContainer.closest(".main-nav");
    const prevScroll = nav ? nav.scrollLeft : 0;

    let cats = [...new Set(list.map(a => a.category))];
    cats = cats.filter(c => c !== "Autre");
    cats.push("Autre");

    const colorMap = buildCategoryColorMap(cats);

    const html =
      `<li><a href="#" data-category="Tous" class="${active === "Tous" ? "active" : ""}">Tous</a></li>` +
      cats.map(c => `<li><a href="#" data-category="${c}" class="${active === c ? "active" : ""}">${c}</a></li>`).join("");
    categoriesContainer.innerHTML = html;

    const applyActive = (cat) => {
      categoriesContainer.querySelectorAll("a").forEach(a => {
        a.style.background = "";
        a.style.color = "";
        clearInnerStroke(a);
      });

      const link = categoriesContainer.querySelector(`a[data-category="${cat}"]`);
      if (!link) return;

      if (cat === "Tous") {
        link.style.background = "rgba(255,255,255,0.22)";
        link.style.color = "#111";
      } else {
        const baseColor = colorMap[cat] || "#4B73FA";
        link.style.background = baseColor + "CC";
        link.style.color = "rgba(255,255,255,0.88)";
        link.style.backdropFilter = "blur(6px) saturate(180%)";
        link.style.webkitBackdropFilter = "blur(6px) saturate(180%)";
      }
      applyInnerStroke(link, 0.5, cat === "Tous" ? null : colorMap[cat]);
    };

    if (nav) requestAnimationFrame(() => { nav.scrollLeft = prevScroll; });

    // ✅ Gestion correcte de .active + rendu
    categoriesContainer.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        const cat = link.getAttribute("data-category");
        categoriesContainer.querySelectorAll("a").forEach(a => a.classList.remove("active"));
        link.classList.add("active");
        applyActive(cat);
        const filtered = cat === "Tous" ? all : all.filter(a => a.category === cat);
        render(filtered);
      }, { passive: true });
    });

    applyActive(active);
  }

  // Première construction + rendu
  buildCategories(all, "Tous");
  await render(all);
}

// ========= Boot =========
document.addEventListener("DOMContentLoaded", loadArticles, { once: true });

// ==============================
// Bouton combiné (recherche + menu) — inchangé
// ==============================
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
}, { once: true });
