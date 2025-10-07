// ========= Utils dates (local, robustes) =========
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
  const dow = x.getDay() || 7; // 1..7 (lundi..dimanche)
  x.setDate(x.getDate() - (dow - 1));
  x.setHours(12, 0, 0, 0);
  return x;
}
function ymdKeyLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
// Parse très tolérant (évite décalages de fuseau)
function parseDateFlexible(input) {
  if (!input) return new Date(NaN);
  if (input instanceof Date) return input;
  const s = String(input).trim();

  // ISO avec Z / offset -> laisse le moteur gérer
  if (/[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?([+-]\d{2}:?\d{2}|Z)$/i.test(s)) {
    const d = new Date(s);
    if (!isNaN(d)) return d;
  }
  // YYYY-MM-DD[ HH[:mm[:ss]]], interprété en LOCAL
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2})(?::(\d{2}))?(?::(\d{2}))?)?/.exec(s);
  if (m) {
    const [, Y, Mo, D, H = "12", Mi = "0", S = "0"] = m;
    return new Date(+Y, +Mo - 1, +D, +H, +Mi, +S, 0);
  }
  const d2 = new Date(s);
  return new Date(isNaN(d2) ? NaN : d2.getTime());
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
    const resp = await fetch(`${workerBase}/repos/${repo}/contents/articles?ref=${branch}&_=${Date.now()}`, { cache: "no-store" });
    if (!resp.ok) {
      container.innerHTML = "<p>Impossible de charger les articles.</p>";
      return;
    }

    const files = await resp.json();
    const all = [];

    for (let file of files) {
      if (!file.name.endsWith(".md")) continue;

      const apiResp = await fetch(`${workerBase}/repos/${repo}/contents/articles/${file.name}?ref=${branch}&_=${Date.now()}`, { cache: "no-store" });
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
      const dateObj = parseDateFlexible(meta.date || "");
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

    // Tri global (plus récent d'abord)
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
        // ---- MOBILE : regroupé par jour ----
        const byDay = {};
        list.forEach(a => {
          const k = ymdKeyLocal(a.date);
          (byDay[k] ||= []).push(a);
        });

        Object.keys(byDay).sort((a,b)=>new Date(b)-new Date(a)).forEach(k=>{
          const d = parseDateFlexible(k);
          const label = d.toLocaleDateString("fr-FR",{day:"numeric",month:"long"});
          const block = document.createElement("div");
          block.className = "day-block";
          block.innerHTML = `<h3 class="day-title">${label}</h3>`;
          byDay[k].sort((a,b)=>b.date-a.date).forEach((article,i,arr)=>{
            const time = article.date.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
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
            if (i < arr.length-1) block.appendChild(Object.assign(document.createElement("div"),{className:"day-separator"}));
          });
          container.appendChild(block);
        });

      } else {
        // ---- DESKTOP : regroupé par semaine avec bornes fixes ----
        const mondayThis = startOfWeekMonday(new Date());
        const mondayNext = addDays(mondayThis, 7);
        const mondayPrev = addDays(mondayThis, -7);

        const currentWeek = {};   // jours -> []
        const previousWeek = {};  // jours -> []
        const olderWeeks = {};    // mondayKey -> { jours -> [] }

        function pushInDay(map, date, article) {
          const k = ymdKeyLocal(new Date(date.getFullYear(),date.getMonth(),date.getDate(),12,0,0,0));
          (map[k] ||= []).push(article);
        }

        list.forEach(article => {
          const d = article.date;
          if (d >= mondayThis && d < mondayNext) {
            pushInDay(currentWeek, d, article);
          } else if (d >= mondayPrev && d < mondayThis) {
            pushInDay(previousWeek, d, article);
          } else {
            const wk = startOfWeekMonday(d);
            const wkKey = ymdKeyLocal(wk);
            olderWeeks[wkKey] ||= {};
            pushInDay(olderWeeks[wkKey], d, article);
          }
        });

        function renderWeekBlock(title, daysMap) {
          if (!daysMap || Object.keys(daysMap).length === 0) return;
          const weekBlock = document.createElement("div");
          weekBlock.className = "week-block";
          weekBlock.innerHTML = `<h3 class="week-title">${title}</h3>`;
          const carousel = document.createElement("div");
          carousel.className = "week-carousel";

          Object.keys(daysMap)
            .sort((a,b)=>parseDateFlexible(b)-parseDateFlexible(a)) // gauche = plus récent
            .forEach(dayKey => {
              const d = parseDateFlexible(dayKey);
              const label = d.toLocaleDateString("fr-FR",{day:"numeric",month:"long"});
              const dayCard = document.createElement("div");
              dayCard.className = "day-block"; // on garde le style actuel
              dayCard.innerHTML = `<h3 class="day-title">${label}</h3>`;

              daysMap[dayKey].sort((a,b)=>b.date-a.date).forEach((article,i,arr)=>{
                const time = article.date.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
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
                dayCard.appendChild(el);
                if (i < arr.length-1) dayCard.appendChild(Object.assign(document.createElement("div"),{className:"day-separator"}));
              });

              carousel.appendChild(dayCard);
            });

          weekBlock.appendChild(carousel);
          container.appendChild(weekBlock);
        }

        // 1) Cette semaine
        renderWeekBlock("Cette semaine", currentWeek);

        // 2) La semaine dernière
        renderWeekBlock("La semaine dernière", previousWeek);

        // 3) Anciennes semaines (du … au …)
        Object.keys(olderWeeks)
          .sort((a,b)=>parseDateFlexible(b)-parseDateFlexible(a))
          .forEach(mondayKey => {
            const start = parseDateFlexible(mondayKey);
            const end = addDays(start, 6);
            const title = `Semaine du ${start.toLocaleDateString("fr-FR",{day:"numeric",month:"long"})} au ${end.toLocaleDateString("fr-FR",{day:"numeric",month:"long"})}`;
            renderWeekBlock(title, olderWeeks[mondayKey]);
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

    // Re-render on resize to switch layout
    window.addEventListener("resize", () => render(all));

  } catch (err) {
    console.error("Erreur lors du chargement :", err);
    container.innerHTML = "<p>Erreur lors du chargement des articles.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadArticles);
