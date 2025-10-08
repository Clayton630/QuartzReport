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

// ========= Décodage GitHub =========
function base64ToUtf8(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

// ========= Helpers images (anti-flicker iOS) =========
const isiOS = /iP(hone|od|ad)/.test(navigator.platform) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);

// Observer de lazy-loading (précharge douce + swap d’opacité)
let imgObserver = null;
function ensureImgObserver() {
  if (imgObserver) return imgObserver;
  imgObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      imgObserver.unobserve(img);

      // Déclenche le chargement seulement quand visible (avec marge)
      const src = img.getAttribute("data-src");
      if (!src) return;

      // On attend la fin de frame pour éviter un layout jank
      requestAnimationFrame(() => {
        img.onload = () => {
          img.setAttribute("data-loaded", "true");
          img.style.opacity = "1";
        };
        img.onerror = () => {
          // Fallback basique en cas d'erreur (évite toggle/reflow)
          img.style.opacity = "1";
        };
        img.decoding = "async";
        img.loading = "lazy"; // Safari >= 17.2 OK ; sinon ignoré sans dommage
        img.src = src;
        img.removeAttribute("data-src");
      });
    });
  }, { root: null, rootMargin: "250px 0px", threshold: 0.01 });
  return imgObserver;
}

// Crée une <img> stabilisée (sans src immédiat)
function createLazyImg({ src, alt = "", w = null, h = null }) {
  const img = document.createElement("img");
  if (w) img.setAttribute("width", String(w));
  if (h) img.setAttribute("height", String(h));
  img.setAttribute("alt", alt);
  img.style.opacity = "0";                 // invisible tant que non décodée
  img.style.transition = "opacity 150ms";  // apparition douce une fois chargée
  img.setAttribute("data-src", src);       // on ne fixe pas src tout de suite
  ensureImgObserver().observe(img);
  return img;
}

// ========= Chargement principal =========
async function loadArticles() {
  const container = document.getElementById("articles");
  const hottestContainer = document.getElementById("hottest");
  const categoriesContainer = document.getElementById("categories");

  const repo = "Clayton630/QuartzReport";
  const branch = "main";
  const workerBase = "https://quartzreport-oauth.claytonelhorga.workers.dev/api";

  try {
    // On peut garder le cache-bust pour la LISTE (JSON) uniquement
    const resp = await fetch(`${workerBase}/repos/${repo}/contents/articles?ref=${branch}&_=${Date.now()}`);
    if (!resp.ok) throw new Error("Erreur chargement liste articles");

    const files = await resp.json();
    const all = [];

    for (const file of files) {
      if (!file.name.endsWith(".md")) continue;

      const apiResp = await fetch(`${workerBase}/repos/${repo}/contents/articles/${file.name}?ref=${branch}`);
      const apiData = await apiResp.json();
      const text = base64ToUtf8(apiData.content);

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

    // Tri global (plus récent en premier)
    all.sort((a, b) => b.date - a.date);

    // ======================
    // SECTION HOTTEST
    // ======================
    hottestContainer.innerHTML = "";
    const hottest = all.filter(a => a.important).slice(0, 3);
    hottest.forEach(article => {
      const link = document.createElement("a");
      link.href = `article.html?slug=${encodeURIComponent(article.slug)}&file=${encodeURIComponent(article.filename)}`;
      link.className = "card";

      // Image HOTTEST — lazy + opacity swap (dimensions cohérentes)
      const img = createLazyImg({
        src: article.thumbnail,
        alt: "",
        w: 320,
        h: 180
      });

      const content = document.createElement("div");
      content.className = "card-content";
      const date = article.date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" });

      const metaP = document.createElement("p");
      metaP.className = "card-meta";
      metaP.textContent = `Par ${article.author}, le ${date}.`;

      const h3 = document.createElement("h3");
      h3.textContent = article.title;

      content.appendChild(metaP);
      content.appendChild(h3);

      link.appendChild(img);
      link.appendChild(content);
      hottestContainer.appendChild(link);
    });

    // ======================
    // SECTION CATÉGORIES
    // ======================
    const categories = [...new Set(all.map(a => a.category))];
    categoriesContainer.innerHTML = categories
      .map(c => `<li><a href="#" data-category="${c}">${c}</a></li>`)
      .join("");

    // ======================
    // FEED ARTICLES
    // ======================
    function render(list) {
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      container.innerHTML = "";

      // Réinitialise l'observer (pour éviter des références obsolètes après rerender)
      imgObserver = null;
      ensureImgObserver();

      // === MOBILE : regroupement par jour ===
      if (isMobile) {
        const byDay = {};
        list.forEach(a => {
          const key = ymdKey(a.date);
          if (!byDay[key]) byDay[key] = [];
          byDay[key].push(a);
        });

        Object.keys(byDay).sort((a, b) => new Date(b) - new Date(a)).forEach(k => {
          const d = new Date(k);
          const dateStr = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
          const block = document.createElement("div");
          block.className = "day-block";
          block.innerHTML = `<h3 class="day-title">${dateStr}</h3>`;

          byDay[k].sort((a, b) => b.date - a.date).forEach((article, i, arr) => {
            const time = article.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
            const el = document.createElement("div");
            el.className = "day-article";

            const aLink = document.createElement("a");
            aLink.href = `article.html?slug=${encodeURIComponent(article.slug)}&file=${encodeURIComponent(article.filename)}`;
            aLink.className = "day-article-link";

            const img = createLazyImg({
              src: article.thumbnail,
              alt: article.title,
              w: 72,
              h: 72
            });

            const info = document.createElement("div");
            info.className = "day-article-info";

            const pMeta = document.createElement("p");
            pMeta.className = "day-meta";
            pMeta.textContent = `Par ${article.author}, à ${time}`;

            const h4 = document.createElement("h4");
            h4.textContent = article.title;

            info.appendChild(pMeta);
            info.appendChild(h4);

            aLink.appendChild(img);
            aLink.appendChild(info);
            el.appendChild(aLink);
            block.appendChild(el);

            if (i < arr.length - 1) {
              const sep = document.createElement("div");
              sep.className = "day-separator";
              block.appendChild(sep);
            }
          });

          container.appendChild(block);
        });
        return;
      }

      // === DESKTOP : regroupement par semaine ===
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

      function renderWeek(title, daysMap) {
        if (!Object.keys(daysMap).length) return;
        const weekBlock = document.createElement("div");
        weekBlock.className = "week-block";
        weekBlock.innerHTML = `<h3 class="week-title">${title}</h3>`;

        const carousel = document.createElement("div");
        carousel.className = "week-carousel";

        Object.keys(daysMap)
          .sort((a, b) => new Date(b) - new Date(a))
          .forEach(dayKey => {
            const d = new Date(dayKey);
            const label = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
            const dayBlock = document.createElement("div");
            dayBlock.className = "day-block";
            dayBlock.innerHTML = `<h3 class="day-title">${label}</h3>`;

            daysMap[dayKey]
              .sort((a, b) => b.date - a.date)
              .forEach((article, i, arr) => {
                const time = article.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                const el = document.createElement("div");
                el.className = "day-article";

                const aLink = document.createElement("a");
                aLink.href = `article.html?slug=${encodeURIComponent(article.slug)}&file=${encodeURIComponent(article.filename)}`;
                aLink.className = "day-article-link";

                const img = createLazyImg({
                  src: article.thumbnail,
                  alt: article.title,
                  w: 72,
                  h: 72
                });

                const info = document.createElement("div");
                info.className = "day-article-info";

                const pMeta = document.createElement("p");
                pMeta.className = "day-meta";
                pMeta.textContent = `Par ${article.author}, à ${time}`;

                const h4 = document.createElement("h4");
                h4.textContent = article.title;

                info.appendChild(pMeta);
                info.appendChild(h4);

                aLink.appendChild(img);
                aLink.appendChild(info);
                el.appendChild(aLink);
                dayBlock.appendChild(el);

                if (i < arr.length - 1) {
                  const sep = document.createElement("div");
                  sep.className = "day-separator";
                  dayBlock.appendChild(sep);
                }
              });

            carousel.appendChild(dayBlock);
          });

        weekBlock.appendChild(carousel);
        container.appendChild(weekBlock);
      }

      renderWeek("Cette semaine", weeks.current);
      renderWeek("La semaine dernière", weeks.previous);
      Object.keys(weeks.others)
        .sort((a, b) => new Date(b) - new Date(a))
        .forEach(wkKey => {
          const start = new Date(wkKey);
          const end = addDays(start, 6);
          const title = `Semaine du ${start.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au ${end.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
          renderWeek(title, weeks.others[wkKey]);
        });
    }

    render(all);

    categoriesContainer.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        const cat = link.getAttribute("data-category");
        const filtered = cat === "Tous" ? all : all.filter(a => a.category === cat);
        render(filtered);
      });
    });

    window.addEventListener("resize", () => render(all));

  } catch (err) {
    console.error(err);
    const container = document.getElementById("articles");
    if (container) container.innerHTML = "<p>Erreur lors du chargement des articles.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadArticles);

// ==============================
// Patch post-reload iOS (stabilisation observer/images)
// ==============================
(function () {
  if (!isiOS) return;
  window.addEventListener("pageshow", (e) => {
    // Après reload/BFCache, on réarme l'observer pour re-stabiliser le pipeline
    if (e.persisted || (performance.getEntriesByType("navigation")[0]?.type === "reload")) {
      // Re-observe toutes les images non encore chargées
      const imgs = document.querySelectorAll('.day-article img:not([data-loaded="true"]), .hottest-grid img:not([data-loaded="true"]), .article-image img:not([data-loaded="true"])');
      if (!imgs.length) return;
      imgObserver = null;
      ensureImgObserver();
      imgs.forEach(img => {
        // Si l’img a encore un data-src, on la (ré)observe
        if (img.hasAttribute("data-src")) {
          ensureImgObserver().observe(img);
        } else if (!img.src) {
          // cas rare: réarmer si src absent
          const ds = img.getAttribute("data-src");
          if (ds) ensureImgObserver().observe(img);
        }
      });
    }
  });
})();
