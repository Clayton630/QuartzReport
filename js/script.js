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
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
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
   Stroke interne + halo coloré
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
  const hint = colorHint && /^#([0-9A-Fa-f]{6})$/.test(colorHint)
    ? colorHint + "40"
    : "rgba(0,0,0,0.15)";
  const stroke1 = `inset ${pixelAligned * 0.6}px ${pixelAligned}px 0 0 ${strokeColor}`;
  const stroke2 = `inset -${pixelAligned * 0.6}px -${pixelAligned}px 0 0 ${strokeColor}`;
  const stroke3 = `inset 0 ${pixelAligned * 0.7}px 0 0 ${strokeColor}`;
  const stroke4 = `inset 0 -${pixelAligned * 0.7}px 0 0 ${strokeColor}`;
  const shadowSoft = `0 6px 26px ${hint}, 0 2px 8px rgba(0,0,0,0.15)`;
  linkEl.style.boxShadow = `${stroke1}, ${stroke2}, ${stroke3}, ${stroke4}, ${shadowSoft}`;
  linkEl.style.border = "none";
  linkEl.style.backfaceVisibility = "hidden";
  linkEl.style.webkitTransform = "translateZ(0)";
}
function clearInnerStroke(linkEl) {
  linkEl.style.boxShadow = "";
  linkEl.style.border = "";
  linkEl.style.backfaceVisibility = "";
  linkEl.style.webkitTransform = ""; // enlève translateZ(0) inline
  linkEl.style.transform = "";       // au cas où
}

/* =========================
   Optimisation et resize images (CDN externe)
   ========================= */
function getOptimizedImageUrl(url, maxWidth) {
  try {
    if (!url || !url.startsWith("http")) return url;
    const clean = encodeURIComponent(url.split("?")[0]);
    return `https://quartzreport-oauth.claytonelhorga.workers.dev/img?src=${clean}&w=${maxWidth}&q=85`;
  } catch (e) {
    console.error("getOptimizedImageUrl failed:", e);
    return url;
  }
}

/* =========================
   Lazy helpers (LQIP + IO)
   ========================= */
let ioThumb = null;
function ensureThumbObserver() {
  if (ioThumb) return ioThumb;
  ioThumb = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const real = el.getAttribute("data-bg");
        if (real) {
          el.style.backgroundImage = `url('${real}')`;
          el.classList.add("thumb-ready");
          el.removeAttribute("data-bg");
        }
        ioThumb.unobserve(el);
      });
    },
    { rootMargin: "200px 0px", threshold: 0.01 }
  );
  return ioThumb;
}
function prepareThumb(divEl, realUrl) {
  divEl.style.backgroundImage = "url('data:image/gif;base64,R0lGODlhAQABAAAAACw=')";
  divEl.style.filter = "blur(8px)";
  divEl.style.transform = "translateZ(0)";
  const optimized = getOptimizedImageUrl(realUrl, 800);
  divEl.setAttribute("data-bg", optimized);
  ensureThumbObserver().observe(divEl);
}

/* =========================
   Chargement principal (feed)
   ========================= */
async function loadArticles() {
  const container = document.getElementById("articles");
  const hottestContainer = document.getElementById("hottest");
  const categoriesContainer = document.getElementById("categories");

  const repo = "Clayton630/QuartzReport";
  const branch = "main";
  const workerBase = "https://quartzreport-oauth.claytonelhorga.workers.dev/api";

  try {
    const resp = await fetch(
      `${workerBase}/repos/${repo}/contents/articles?ref=${branch}&_=${Date.now()}`,
      { cache: "force-cache" }
    );
    if (!resp.ok) throw new Error("Erreur chargement liste articles");

    const files = await resp.json();
    const mdFiles = files.filter((f) => /\.md$/i.test(f.name));

    async function fetchAllWithLimit(urls, limit) {
      const results = [];
      let i = 0;
      async function next() {
        if (i >= urls.length) return;
        const idx = i++;
        try {
          const r = await fetch(urls[idx], { cache: "force-cache" });
          results[idx] = await r.json();
        } catch {
          results[idx] = null;
        }
        return next();
      }
      const workers = [];
      for (let k = 0; k < limit; k++) workers.push(next());
      await Promise.all(workers);
      return results;
    }

    const urls = mdFiles.map(
      (file) =>
        `${workerBase}/repos/${repo}/contents/articles/${file.name}?ref=${branch}`
    );
    const apiDatas = await fetchAllWithLimit(urls, 6);

    const all = [];
    for (let i = 0; i < mdFiles.length; i++) {
      const file = mdFiles[i];
      const apiData = apiDatas[i];
      if (!apiData || !apiData.content) continue;
      const text = base64ToUtf8(apiData.content);

      const match = text.match(/^---([\s\S]*?)---([\s\S]*)$/);
      let meta = {},
        body = text;
      if (match) {
        const yaml = match[1].trim();
        body = match[2].trim();
        yaml.split("\n").forEach((line) => {
          const parts = line.split(":");
          const k = parts.shift().trim();
          const rest = parts.join(":").trim().replace(/^"|"$/g, "");
          meta[k] = rest;
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
        body,
      });
    }

    all.sort((a, b) => b.date - a.date);

    /* ======================
       HOTTEST
       ====================== */
    hottestContainer.innerHTML = "";
    const hottest = all.filter((a) => a.important).slice(0, 3);
    const fragHot = document.createDocumentFragment();
    hottest.forEach((article, j) => {
      const optimizedThumb = getOptimizedImageUrl(article.thumbnail, 1280);
      const link = document.createElement("a");
      link.href = `article.html?slug=${encodeURIComponent(
        article.slug
      )}&file=${encodeURIComponent(article.filename)}`;
      link.className = "card";

      const now = new Date();
      const isToday =
        article.date.getDate() === now.getDate() &&
        article.date.getMonth() === now.getMonth() &&
        article.date.getFullYear() === now.getFullYear();
      const dateDisplay = isToday
        ? "à " +
          article.date.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : article.date.toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
          });

      const loadingAttr = j === 0 ? "eager" : "lazy";
      link.innerHTML = `
        <img src="${optimizedThumb}" alt="" decoding="async" loading="${loadingAttr}">
        <div class="card-content">
          <p class="card-meta">Par ${article.author}, ${dateDisplay}</p>
          <h3>${article.title}</h3>
        </div>`;
      fragHot.appendChild(link);
    });
    hottestContainer.appendChild(fragHot);

    /* ======================
       RENDER PRINCIPAL (feed)
       ====================== */
    async function render(list) {
      container.innerHTML = "";
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      if (isMobile) {
        const byDay = {};
        list.forEach((a) => (byDay[ymdKey(a.date)] ||= []).push(a));
        const sortedDays = Object.keys(byDay).sort(
          (a, b) => new Date(b) - new Date(a)
        );
        for (const k of sortedDays) {
          const d = new Date(k);
          const dateStr = d.toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
          });
          const block = document.createElement("div");
          block.className = "day-block";
          block.innerHTML = `<h3 class="day-title">${dateStr}</h3>`;
          container.appendChild(block);
          const articles = byDay[k].sort((a, b) => b.date - a.date);
          for (let i4 = 0; i4 < articles.length; i4 += 4) {
            const chunk = articles.slice(i4, i4 + 4);
            const frag = document.createDocumentFragment();
            chunk.forEach((article) => {
              const time = article.date.toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              });
              const el = document.createElement("div");
              el.className = "day-article";
              el.innerHTML = `
                <a href="article.html?slug=${encodeURIComponent(
                  article.slug
                )}&file=${encodeURIComponent(article.filename)}" class="day-article-link">
                  <div class="thumb"></div>
                  <div class="day-article-info">
                    <p class="day-meta">Par ${article.author}, à ${time}</p>
                    <h4>${article.title}</h4>
                    <p class="day-desc">${article.description}</p>
                  </div>
                </a>`;
              const t = el.querySelector(".thumb");
              prepareThumb(t, getOptimizedImageUrl(article.thumbnail, 800));
              frag.appendChild(el);
            });
            block.appendChild(frag);
            await new Promise((res) => setTimeout(res, 200));
          }
        }
      } else {
        const mondayThis = startOfWeekMonday(new Date());
        const mondayNext = addDays(mondayThis, 7);
        const mondayPrev = addDays(mondayThis, -7);
        const weeks = { current: {}, previous: {}, others: {} };
        list.forEach((article) => {
          const d = normalizeDate(article.date);
          const dayKey = ymdKey(d);
          const dTime = d.getTime();
          if (dTime >= mondayThis && dTime < mondayNext)
            (weeks.current[dayKey] ||= []).push(article);
          else if (dTime >= mondayPrev && dTime < mondayThis)
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
          const sortedDays = Object.keys(daysMap).sort(
            (a, b) => new Date(b) - new Date(a)
          );
          for (const dayKey of sortedDays) {
            const d = new Date(dayKey);
            const label = d.toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
            });
            const dayBlock = document.createElement("div");
            dayBlock.className = "day-block";
            dayBlock.innerHTML = `<h3 class="day-title">${label}</h3>`;
            const articles = daysMap[dayKey].sort((a, b) => b.date - a.date);
            for (let i5 = 0; i5 < articles.length; i5 += 4) {
              const chunk = articles.slice(i5, i5 + 4);
              const frag = document.createDocumentFragment();
              chunk.forEach((article) => {
                const time = article.date.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const el = document.createElement("div");
                el.className = "day-article";
                el.innerHTML = `
                  <a href="article.html?slug=${encodeURIComponent(
                    article.slug
                  )}&file=${encodeURIComponent(article.filename)}" class="day-article-link">
                    <div class="thumb"></div>
                    <div class="day-article-info">
                      <p class="day-meta">Par ${article.author}, à ${time}</p>
                      <h4>${article.title}</h4>
                      <p class="day-desc">${article.description}</p>
                    </div>
                  </a>`;
                const t = el.querySelector(".thumb");
                prepareThumb(t, getOptimizedImageUrl(article.thumbnail, 800));
                frag.appendChild(el);
              });
              dayBlock.appendChild(frag);
              await new Promise((res) => setTimeout(res, 200));
            }
            carousel.appendChild(dayBlock);
          }
          weekBlock.appendChild(carousel);
          container.appendChild(weekBlock);
        }

        await renderWeek("Cette semaine", weeks.current);
        await renderWeek("La semaine dernière", weeks.previous);

        const otherWeeks = Object.keys(weeks.others).sort(
          (a, b) => new Date(b) - new Date(a)
        );
        for (const wkKey of otherWeeks) {
          const start = new Date(wkKey);
          const end = addDays(start, 6);
          const title = `Semaine du ${start.toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
          })} au ${end.toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
          })}`;
          await renderWeek(title, weeks.others[wkKey]);
        }
      }
    }

    /* ======================
       Catégories
       ====================== */
    function buildCategories(list, active = "Tous") {
      if (!categoriesContainer) return;
      const nav = categoriesContainer.closest(".main-nav");
      const prevScroll = nav ? nav.scrollLeft : 0;
      const cats = Array.from(
        new Set(list.map((a) => a.category))
      ).filter((c) => c !== "Autre");
      cats.push("Autre");
      const colorMap = buildCategoryColorMap(cats);
      const html =
        `<li><a href="#" data-category="Tous" class="${
          active === "Tous" ? "active" : ""
        }">Tous</a></li>` +
        cats
          .map(
            (c) =>
              `<li><a href="#" data-category="${c}" class="${
                active === c ? "active" : ""
              }">${c}</a></li>`
          )
          .join("");
      categoriesContainer.innerHTML = html;

      function applyActive(cat) {
        categoriesContainer.querySelectorAll("a").forEach((a) => {
          a.style.background = "";
          a.style.color = "";
          a.style.backdropFilter = "";
          a.style.webkitBackdropFilter = "";
          clearInnerStroke(a);
           
        });
        const link = categoriesContainer.querySelector(
          `a[data-category="${cat}"]`
        );
        if (!link) return;
        if (cat === "Tous") {
          link.style.background = "rgba(255,255,255,0.22)";
          link.style.color = "#111";
        } else {
          const baseColor = colorMap[cat] || "#4B73FA";
      
          // Conversion hex → RGB
          const rgb = baseColor.match(/[A-Fa-f0-9]{2}/g)
            .map(x => parseInt(x, 16));
      
          const [r, g, b] = rgb;
          const max = Math.max(r, g, b);
      
          // 💥 Paramètres : très saturé + très clair
          const saturationBoost = 1.9;   // pousse la couleur
          const brightnessBoost = 1.6;   // presque blanc
      
          // Calcul RGB ajusté
          const rr = Math.min(255, (r / max) * 255 * saturationBoost * brightnessBoost);
          const gg = Math.min(255, (g / max) * 255 * saturationBoost * brightnessBoost);
          const bb = Math.min(255, (b / max) * 255 * saturationBoost * brightnessBoost);
      
          const textColor = `rgb(${rr.toFixed(0)}, ${gg.toFixed(0)}, ${bb.toFixed(0)})`;
      
          // Application styles
          link.style.background = baseColor + "CC";
          link.style.color = textColor;
          link.style.backdropFilter = "blur(6px) saturate(180%)";
          link.style.webkitBackdropFilter = "blur(6px) saturate(180%)";
        }
        applyInnerStroke(link, 0.5, cat === "Tous" ? null : colorMap[cat]);
      }

      if (nav) requestAnimationFrame(() => (nav.scrollLeft = prevScroll));
categoriesContainer.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();

    // 💫 Étape 1 : joue l’animation bounce tout de suite
    link.classList.remove("tap-anim");
    void link.offsetWidth;
    link.classList.add("tap-anim");

    // ⏱ Étape 2 : change la couleur après un léger délai
    setTimeout(() => {
      const cat = link.getAttribute("data-category");
      categoriesContainer
        .querySelectorAll("a")
        .forEach((a) => a.classList.remove("active"));
      link.classList.add("active");
      applyActive(cat);

      const filtered =
        cat === "Tous" ? all : all.filter((a) => a.category === cat);
      render(filtered);
    }, 100); // délai de 100 ms avant le changement de couleur
  });
});
      applyActive(active);
    }

    buildCategories(all, "Tous");
    await render(all);

    const css = document.createElement("style");
    css.textContent =
      ".thumb { transition: filter 220ms ease; } .thumb-ready { filter: blur(0px) !important; }";
    document.head.appendChild(css);
  } catch (err) {
    console.error(err);
    const container2 = document.getElementById("articles");
    if (container2)
      container2.innerHTML = "<p>Erreur lors du chargement des articles.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadArticles);

/* ==============================
   Bouton combiné (recherche + menu)
   ============================== */
document.addEventListener("DOMContentLoaded", function () {
  const searchIcon = document.querySelector(".search-icon");
  const menuIcon = document.querySelector(".menu-icon");
  if (searchIcon) {
    searchIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      console.log("Recherche ouverte");
    });
  }
  if (menuIcon) {
    menuIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      console.log("Menu ouvert");
    });
  }
});
