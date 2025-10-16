// ========= Perf helpers =========
const rIC = window.requestIdleCallback || (cb) => setTimeout(cb, 1);
const RAF = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));

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
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

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

// ========= Stroke interne + halo coloré =========
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

  const strokeColor = `rgba(255,255,255,${whiteAlpha})`; // Blanc adouci
  const hint = colorHint ? colorHint + "40" : "rgba(0,0,0,0.15)";

  // Stroke équilibré haut/bas, côtés plus fins
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

// ========= LQIP / Lazy helpers =========
function lowRes(url) {
  // Si le CDN supporte les params, garde-les; sinon renvoie tel quel (pas d'impact visuel)
  try {
    const u = new URL(url, location.href);
    if (!u.search) {
      u.search = "?w=40&blur=20";
    }
    return u.toString();
  } catch {
    return url;
  }
}
function upgradeThumb(divEl) {
  const full = divEl.getAttribute("data-src");
  if (!full) return;
  const img = new Image();
  img.decoding = "async";
  img.src = full;
  img.onload = () => {
    divEl.style.backgroundImage = `url("${full}")`;
    divEl.removeAttribute("data-src");
  };
}
function upgradeImg(imgEl) {
  const full = imgEl.getAttribute("data-src");
  if (!full) return;
  imgEl.decoding = "async";
  imgEl.loading = "lazy";
  const hi = new Image();
  hi.decoding = "async";
  hi.src = full;
  hi.onload = () => {
    imgEl.src = full;
    imgEl.removeAttribute("data-src");
  };
}

// ========= Chargement principal (feed) =========
async function loadArticles() {
  const container = document.getElementById("articles");
  const hottestContainer = document.getElementById("hottest");
  const categoriesContainer = document.getElementById("categories");

  const repo = "Clayton630/QuartzReport";
  const branch = "main";
  const workerBase = "https://quartzreport-oauth.claytonelhorga.workers.dev/api";

  try {
    const listResp = await fetch(`${workerBase}/repos/${repo}/contents/articles?ref=${branch}&_=${Date.now()}`, { cache: "no-store" });
    if (!listResp.ok) throw new Error("Erreur chargement liste articles");
    const files = await listResp.json();

    // Concurrency limitée pour récupérer le contenu
    const MAX_CONC = 6;
    const mdFiles = files.filter(f => f.name.endsWith(".md"));
    const all = [];
    let idx = 0;

    async function fetchOne(file) {
      const apiResp = await fetch(`${workerBase}/repos/${repo}/contents/articles/${file.name}?ref=${branch}`, { cache: "no-store" });
      const apiData = await apiResp.json();
      const text = base64ToUtf8(apiData.content);

      const match = text.match(/^---([\s\S]*?)---([\s\S]*)$/);
      let meta = {}, body = text;
      if (match) {
        const yaml = match[1].trim();
        body = match[2].trim();
        yaml.split("\n").forEach(line => {
          const i = line.indexOf(":");
          if (i === -1) return;
          const k = line.slice(0, i).trim();
          const v = line.slice(i + 1).trim().replace(/^"|"$/g, "");
          meta[k] = v;
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

    async function runQueue() {
      const running = new Set();
      while (idx < mdFiles.length) {
        while (running.size < MAX_CONC && idx < mdFiles.length) {
          const f = mdFiles[idx++];
          const p = fetchOne(f).finally(() => running.delete(p));
          running.add(p);
        }
        // Attend le plus rapide
        await Promise.race([...running]);
      }
      await Promise.all([...running]);
    }
    await runQueue();

    // Tri du plus récent au plus ancien
    all.sort((a, b) => b.date - a.date);

    // ======================
    // SECTION HOTTEST
    // ======================
    hottestContainer.innerHTML = "";
    const hottest = all.filter(a => a.important).slice(0, 3);
    const fragHot = document.createDocumentFragment();
    const now = new Date();

    hottest.forEach(article => {
      const link = document.createElement("a");
      link.href = `article.html?slug=${encodeURIComponent(article.slug)}&file=${encodeURIComponent(article.filename)}`;
      link.className = "card";

      const isToday =
        article.date.getDate() === now.getDate() &&
        article.date.getMonth() === now.getMonth() &&
        article.date.getFullYear() === now.getFullYear();

      const dateDisplay = isToday
        ? `à ${article.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
        : article.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

      const low = lowRes(article.thumbnail);

      link.innerHTML = `
        <img src="${low}" data-src="${article.thumbnail}" alt="" loading="lazy" decoding="async" class="lazy-img" width="320" height="180">
        <div class="card-content">
          <p class="card-meta">Par ${article.author}, ${dateDisplay}</p>
          <h3>${article.title}</h3>
        </div>
      `;
      fragHot.appendChild(link);
    });
    hottestContainer.appendChild(fragHot);

    // ======================
    // RENDER PRINCIPAL
    // ======================
    async function render(list) {
      container.innerHTML = "";
      const isMobile = window.matchMedia("(max-width: 768px)").matches;

      if (isMobile) {
        // === VERSION MOBILE — par jour ===
        const byDay = {};
        list.forEach(a => {
          const key = ymdKey(a.date);
          (byDay[key] ||= []).push(a);
        });

        const sortedDays = Object.keys(byDay).sort((a, b) => new Date(b) - new Date(a));
        for (const k of sortedDays) {
          const d = new Date(k);
          const dateStr = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
          const block = document.createElement("div");
          block.className = "day-block";
          block.innerHTML = `<h3 class="day-title">${dateStr}</h3>`;
          container.appendChild(block);

          const articles = byDay[k].sort((a, b) => b.date - a.date);
          for (let i = 0; i < articles.length; i += 4) {
            const chunk = articles.slice(i, i + 4);
            const frag = document.createDocumentFragment();

            chunk.forEach((article, idx) => {
              const time = article.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
              const low = lowRes(article.thumbnail);
              const el = document.createElement("div");
              el.className = "day-article";
              el.innerHTML = `
                <a href="article.html?slug=${encodeURIComponent(article.slug)}&file=${encodeURIComponent(article.filename)}" class="day-article-link">
                  <div class="thumb" style="background-image:url('${low}')" data-src="${article.thumbnail}"></div>
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
            await new Promise(res => setTimeout(res, 200));
          }
        }
      } else {
        // === VERSION DESKTOP — par semaine ===
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
                const low = lowRes(article.thumbnail);
                const el = document.createElement("div");
                el.className = "day-article";
                el.innerHTML = `
                  <a href="article.html?slug=${encodeURIComponent(article.slug)}&file=${encodeURIComponent(article.filename)}" class="day-article-link">
                    <div class="thumb" style="background-image:url('${low}')" data-src="${article.thumbnail}"></div>
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

      // Après rendu, active le lazy
      rIC(setupLazyImages);
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
          link.style.background = "rgba(255,255,255,0.22)"; // fond “verre” original
          link.style.color = "#111";
        } else {
          const baseColor = colorMap[cat] || "#4B73FA";
          link.style.background = baseColor + "CC"; // ~80%
          link.style.color = "rgba(255,255,255,0.88)";
          link.style.backdropFilter = "blur(6px) saturate(180%)";
          link.style.webkitBackdropFilter = "blur(6px) saturate(180%)";
        }
        applyInnerStroke(link, 0.5, cat === "Tous" ? null : colorMap[cat]);
      };

      if (nav) requestAnimationFrame(() => { nav.scrollLeft = prevScroll; });

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

      applyActive(active);
    }

    // Première construction + rendu + lazy après paint
    buildCategories(all, "Tous");
    await render(all);

  } catch (err) {
    console.error(err);
    const container = document.getElementById("articles");
    if (container) container.innerHTML = "<p>Erreur lors du chargement des articles.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadArticles);

// ==============================
// Lazy loading & LQIP upgrade
// ==============================
function setupLazyImages() {
  const nodes = document.querySelectorAll(".lazy-img, .thumb[data-src]");
  if (!nodes.length) return;

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;

      if (el.tagName === "IMG" && el.classList.contains("lazy-img")) {
        upgradeImg(el);
      } else if (el.classList.contains("thumb")) {
        upgradeThumb(el);
      }
      obs.unobserve(el);
    });
  }, {
    root: null,
    rootMargin: "300px 0px", // préchargement en avance
    threshold: 0.01
  });

  nodes.forEach((n) => io.observe(n));
}

// ==============================
// Bouton combiné (recherche + menu)
// ==============================
document.addEventListener("DOMContentLoaded", () => {
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
