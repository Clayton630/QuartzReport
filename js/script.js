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

async function loadArticles() {
  const container = document.getElementById("articles");
  const hottestContainer = document.getElementById("hottest");
  const categoriesContainer = document.getElementById("categories");

  const repo = "Clayton630/QuartzReport";
  const branch = "main";
  const workerBase = "https://quartzreport-oauth.claytonelhorga.workers.dev/api";

  try {
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
        filename: file.name,             // ⬅️ ajouté
        slug,                            // ⬅️ déjà présent
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
      // ⬇️ on passe slug + file pour compat totale
      link.href = `article.html?slug=${encodeURIComponent(article.slug)}&file=${encodeURIComponent(article.filename)}`;
      link.className = "card";
      const date = article.date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" });
      link.innerHTML = `
        <img src="${article.thumbnail}" alt="">
        <div class="card-content">
          <p class="card-meta">Par ${article.author}, le ${date}.</p>
          <h3>${article.title}</h3>
        </div>
      `;
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
            el.innerHTML = `
              <a href="article.html?slug=${encodeURIComponent(article.slug)}&file=${encodeURIComponent(article.filename)}" class="day-article-link">
                <img src="${article.thumbnail}" alt="${article.title}">
                <div class="day-article-info">
                  <p class="day-meta">Par ${article.author}, à ${time}</p>
                  <h4>${article.title}</h4>
                </div>
              </a>`;
            block.appendChild(el);
            if (i < arr.length - 1) block.appendChild(Object.assign(document.createElement("div"), { className: "day-separator" }));
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
                el.innerHTML = `
                  <a href="article.html?slug=${encodeURIComponent(article.slug)}&file=${encodeURIComponent(article.filename)}" class="day-article-link">
                    <img src="${article.thumbnail}" alt="${article.title}">
                    <div class="day-article-info">
                      <p class="day-meta">Par ${article.author}, à ${time}</p>
                      <h4>${article.title}</h4>
                    </div>
                  </a>`;
                dayBlock.appendChild(el);
                if (i < arr.length - 1) dayBlock.appendChild(Object.assign(document.createElement("div"), { className: "day-separator" }));
              });

            carousel.appendChild(dayBlock);
          });

        weekBlock.appendChild(carousel);
        container.appendChild(weekBlock);
      }

      // Cette semaine
      renderWeek("Cette semaine", weeks.current);
      // La semaine dernière
      renderWeek("La semaine dernière", weeks.previous);
      // Anciennes semaines
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

    // ✅ Filtrage catégories
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
    container.innerHTML = "<p>Erreur lors du chargement des articles.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadArticles);

// ==============================
// 🩹 iOS Safari flicker fix au scroll post-refresh
// ==============================
if (/iP(hone|od|ad)/.test(navigator.platform) || navigator.userAgent.includes("Mac") && "ontouchend" in document) {
  window.addEventListener("pageshow", () => {
    // Force le recalcul GPU des couches floutées après reload
    requestAnimationFrame(() => {
      document.body.style.webkitTransform = "translateZ(0)";
      document.body.style.transform = "translateZ(0)";
      document.body.offsetHeight; // trigger reflow
      document.body.style.webkitTransform = "";
      document.body.style.transform = "";
    });
  });
}
