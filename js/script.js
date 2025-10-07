// ========= Dates (local, robustes) =========
function normalizeDate(d) {
  // milieu de journée pour éviter toute bizarrerie DST
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}
function parseYMDLocal(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  const d = new Date(str);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), 0, 0);
}
function ymdKeyLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function getMondayLocal(date) {
  const d = normalizeDate(date);
  const day = d.getDay() || 7; // lun=1..dim=7
  d.setDate(d.getDate() - (day - 1));
  d.setHours(12, 0, 0, 0);
  return d;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}
function formatWeekLabel(weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const today = normalizeDate(new Date());

  // ✅ si "today" dans l'intervalle [weekStart, weekEnd] => Cette semaine
  if (today >= weekStart && today <= weekEnd) return "Cette semaine";

  const lastStart = addDays(weekStart, 7); // semaineStart + 7 = début de la semaine suivante
  const prevStart = addDays(weekStart, -7);
  // si la semaine suivante contient today => la semaine courante est "la semaine dernière"
  if (today >= prevStart && today <= addDays(prevStart, 6)) return "La semaine dernière";

  const opt = { day: "numeric", month: "long" };
  const startStr = weekStart.toLocaleDateString("fr-FR", opt);
  const endStr = weekEnd.toLocaleDateString("fr-FR", opt);
  return `Semaine du ${startStr} au ${endStr}`;
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
    const resp = await fetch(
      `${workerBase}/repos/${repo}/contents/articles?ref=${branch}&_=${Date.now()}`,
      { cache: "no-store" }
    );
    if (!resp.ok) {
      container.innerHTML = "<p>Impossible de charger les articles.</p>";
      return;
    }

    const files = await resp.json();
    const all = [];

    for (let file of files) {
      if (!file.name.endsWith(".md")) continue;

      const apiResp = await fetch(
        `${workerBase}/repos/${repo}/contents/articles/${file.name}?ref=${branch}&_=${Date.now()}`,
        { cache: "no-store" }
      );
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

      const slug = file.name.replace(".md", "");
      const dateObj = parseYMDLocal(meta.date || "");
      let cover = meta.thumbnail || "img/article-placeholder.jpg";
      const firstImg = body.match(/!\[.*?\]\((.*?)\)/);
      if (!meta.thumbnail && firstImg) cover = firstImg[1];

      all.push({
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

    // Tri global décroissant
    all.sort((a, b) => b.date - a.date);

    // ====== Hottest ======
    hottestContainer.innerHTML = "";
    const hottestArticles = all.filter(a => a.important).slice(0, 3);
    hottestArticles.forEach(article => {
      const link = document.createElement("a");
      link.href = `article.html?slug=${encodeURIComponent(article.slug)}`;
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

    // ====== Catégories ======
    const uniqueCategories = [...new Set(all.map(a => a.category))];
    categoriesContainer.innerHTML = uniqueCategories
      .map(cat => `<li><a href="#" data-category="${cat}">${cat}</a></li>`)
      .join("");

    // ====== Rendu (mobile vs desktop) ======
    function render(list) {
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      container.innerHTML = "";

      if (isMobile) {
        // ---- MOBILE : regroupé par jour (inchangé) ----
        const grouped = {};
        list.forEach(article => {
          const key = ymdKeyLocal(article.date);
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(article);
        });

        Object.keys(grouped)
          .sort((a, b) => new Date(b) - new Date(a))
          .forEach(dateKey => {
            const d = parseYMDLocal(dateKey);
            const label = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

            const dayBlock = document.createElement("div");
            dayBlock.className = "day-block";
            dayBlock.innerHTML = `<h3 class="day-title">${label}</h3>`;

            // articles du jour : décroissant + heure
            grouped[dateKey]
              .sort((a, b) => b.date - a.date)
              .forEach((article, index, arr) => {
                const time = article.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                const el = document.createElement("div");
                el.className = "day-article";
                el.innerHTML = `
                  <a href="article.html?slug=${encodeURIComponent(article.slug)}" class="day-article-link">
                    <img src="${article.thumbnail}" alt="${article.title}">
                    <div class="day-article-info">
                      <p class="day-meta">Par ${article.author}, à ${time}</p>
                      <h4>${article.title}</h4>
                    </div>
                  </a>
                `;
                dayBlock.appendChild(el);
                if (index < arr.length - 1) {
                  const sep = document.createElement("div");
                  sep.className = "day-separator";
                  dayBlock.appendChild(sep);
                }
              });

            container.appendChild(dayBlock);
          });

      } else {
        // ---- DESKTOP : regroupé par semaine ----
        const weeks = {};

        list.forEach(article => {
          const monday = getMondayLocal(article.date);
          const mondayKey = ymdKeyLocal(monday);
          if (!weeks[mondayKey]) weeks[mondayKey] = {};
          const dayKey = ymdKeyLocal(article.date);
          if (!weeks[mondayKey][dayKey]) weeks[mondayKey][dayKey] = [];
          weeks[mondayKey][dayKey].push(article);
        });

        Object.keys(weeks)
          .sort((a, b) => parseYMDLocal(b) - parseYMDLocal(a)) // semaines récentes d'abord
          .forEach(mondayKey => {
            const weekStart = parseYMDLocal(mondayKey);
            const weekBlock = document.createElement("div");
            weekBlock.className = "week-block";
            weekBlock.innerHTML = `<h3 class="week-title">${formatWeekLabel(weekStart)}</h3>`;

            const carousel = document.createElement("div");
            carousel.className = "week-carousel";

            // ✅ jours : du plus récent (gauche) au plus ancien (droite)
            Object.keys(weeks[mondayKey])
              .sort((a, b) => parseYMDLocal(b) - parseYMDLocal(a))
              .forEach(dayKey => {
                const d = parseYMDLocal(dayKey);
                const label = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

                const dayBlock = document.createElement("div");
                dayBlock.className = "day-block";
                dayBlock.innerHTML = `<h3 class="day-title">${label}</h3>`;

                // articles dans la journée : du plus récent au plus ancien
                weeks[mondayKey][dayKey]
                  .sort((a, b) => b.date - a.date)
                  .forEach((article, index, arr) => {
                    const time = article.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                    const el = document.createElement("div");
                    el.className = "day-article";
                    el.innerHTML = `
                      <a href="article.html?slug=${encodeURIComponent(article.slug)}" class="day-article-link">
                        <img src="${article.thumbnail}" alt="${article.title}">
                        <div class="day-article-info">
                          <p class="day-meta">Par ${article.author}, à ${time}</p>
                          <h4>${article.title}</h4>
                        </div>
                      </a>
                    `;
                    dayBlock.appendChild(el);
                    if (index < arr.length - 1) {
                      const sep = document.createElement("div");
                      sep.className = "day-separator";
                      dayBlock.appendChild(sep);
                    }
                  });

                carousel.appendChild(dayBlock);
              });

            weekBlock.appendChild(carousel);
            container.appendChild(weekBlock);
          });
      }
    }

    render(all);

    // Filtrage catégories
    categoriesContainer.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        const cat = link.getAttribute("data-category");
        const filtered = cat === "Tous" ? all : all.filter(a => a.category === cat);
        render(filtered);
      });
    });

    // Re-render on resize to switch mobile/desktop layouts if needed
    window.addEventListener("resize", () => render(all));

  } catch (err) {
    console.error("Erreur lors du chargement :", err);
    container.innerHTML = "<p>Erreur lors du chargement des articles.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadArticles);
