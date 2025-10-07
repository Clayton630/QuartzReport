// ========= Outils date fiables =========
function startOfWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay() || 7; // 1 = lundi
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (day - 1));
  return d;
}
function endOfWeekSunday(date) {
  const d = startOfWeekMonday(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function ymd(date) {
  return date.toISOString().split("T")[0];
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
      const slug = file.name.replace(".md", "");
      let cover = meta.thumbnail || "img/article-placeholder.jpg";
      const firstImg = body.match(/!\[.*?\]\((.*?)\)/);
      if (!meta.thumbnail && firstImg) cover = firstImg[1];

      all.push({
        slug,
        title: meta.title || "Sans titre",
        date: dateObj,
        author: meta.author || "Inconnu",
        thumbnail: cover,
        category: meta.category || "Autre",
        important: meta.important === "true" || meta.important === true,
        body
      });
    }

    // Tri du plus récent au plus ancien
    all.sort((a, b) => b.date - a.date);

    // ========= Hottest =========
    hottestContainer.innerHTML = "";
    const hottest = all.filter(a => a.important).slice(0, 3);
    hottest.forEach(article => {
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

    // ========= Catégories =========
    const cats = [...new Set(all.map(a => a.category))];
    categoriesContainer.innerHTML = cats.map(c => `<li><a href="#" data-category="${c}">${c}</a></li>`).join("");

    // ========= Feed =========
    function render(list) {
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      container.innerHTML = "";

      // --------- MOBILE : par jour ---------
      if (isMobile) {
        const byDay = {};
        list.forEach(a => {
          const key = ymd(a.date);
          (byDay[key] ||= []).push(a);
        });

        Object.keys(byDay)
          .sort((a, b) => new Date(b) - new Date(a))
          .forEach(k => {
            const d = new Date(k);
            const label = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
            const block = document.createElement("div");
            block.className = "day-block";
            block.innerHTML = `<h3 class="day-title">${label}</h3>`;

            byDay[k]
              .sort((a, b) => b.date - a.date)
              .forEach((article, i, arr) => {
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
                  </a>`;
                block.appendChild(el);
                if (i < arr.length - 1)
                  block.appendChild(Object.assign(document.createElement("div"), { className: "day-separator" }));
              });

            container.appendChild(block);
          });

        return;
      }

      // --------- DESKTOP : par semaine ---------
      const mondayThis = startOfWeekMonday(new Date());
      const sundayThis = endOfWeekSunday(new Date());
      const mondayPrev = addDays(mondayThis, -7);
      const sundayPrev = addDays(mondayPrev, 6);

      const weeks = {
        current: {},
        previous: {},
        others: {},
      };

      list.forEach(article => {
        const d = article.date;
        const dayKey = ymd(d);

        if (d >= mondayThis && d <= sundayThis) {
          (weeks.current[dayKey] ||= []).push(article);
        } else if (d >= mondayPrev && d <= sundayPrev) {
          (weeks.previous[dayKey] ||= []).push(article);
        } else {
          const monday = startOfWeekMonday(d);
          const mondayKey = ymd(monday);
          (weeks.others[mondayKey] ||= {});
          (weeks.others[mondayKey][dayKey] ||= []).push(article);
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
                  <a href="article.html?slug=${encodeURIComponent(article.slug)}" class="day-article-link">
                    <img src="${article.thumbnail}" alt="${article.title}">
                    <div class="day-article-info">
                      <p class="day-meta">Par ${article.author}, à ${time}</p>
                      <h4>${article.title}</h4>
                    </div>
                  </a>`;
                dayBlock.appendChild(el);
                if (i < arr.length - 1)
                  dayBlock.appendChild(Object.assign(document.createElement("div"), { className: "day-separator" }));
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
        .forEach(mondayKey => {
          const start = new Date(mondayKey);
          const end = addDays(start, 6);
          const title = `Semaine du ${start.toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
          })} au ${end.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
          renderWeek(title, weeks.others[mondayKey]);
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
    console.error("Erreur :", err);
    container.innerHTML = "<p>Erreur lors du chargement des articles.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadArticles);
