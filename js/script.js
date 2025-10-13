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

// ========= Chargement principal (feed) =========
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

    // Tri du plus récent au plus ancien
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

      const now = new Date();
      const isToday =
        article.date.getDate() === now.getDate() &&
        article.date.getMonth() === now.getMonth() &&
        article.date.getFullYear() === now.getFullYear();

      let dateDisplay;
      if (isToday) {
        const time = article.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        dateDisplay = `à ${time}`;
      } else {
        dateDisplay = article.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
      }

      link.innerHTML = `
        <img src="${article.thumbnail}" alt="" width="320" height="180" decoding="sync" loading="eager">
        <div class="card-content">
          <p class="card-meta">Par ${article.author}, ${dateDisplay}</p>
          <h3>${article.title}</h3>
        </div>
      `;
      hottestContainer.appendChild(link);
    });

    // ======================
    // RENDER PRINCIPAL
    // ======================
    async function render(list) {
      container.innerHTML = "";
      const isMobile = window.matchMedia("(max-width: 768px)").matches;

      if (isMobile) {
        const byDay = {};
        list.forEach(a => {
          const key = ymdKey(a.date);
          if (!byDay[key]) byDay[key] = [];
          byDay[key].push(a);
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
            chunk.forEach((article, idx) => {
              const time = article.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
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
              block.appendChild(el);
              if (idx < chunk.length - 1 || i + chunk.length < articles.length) {
                block.appendChild(Object.assign(document.createElement("div"), { className: "day-separator" }));
              }
            });
            await new Promise(res => setTimeout(res, 200));
          }
        }
      } else {
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
              chunk.forEach((article, idx) => {
                const time = article.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
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
                dayBlock.appendChild(el);
                if (idx < chunk.length - 1 || i + chunk.length < articles.length) {
                  dayBlock.appendChild(Object.assign(document.createElement("div"), { className: "day-separator" }));
                }
              });
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
    // CATÉGORIES (couleurs dynamiques + effet verre)
    // ======================
    function buildCategories(list, active = "Tous") {
      if (!categoriesContainer) return;
      const nav = categoriesContainer.closest(".main-nav");
      const prevScroll = nav ? nav.scrollLeft : 0;

      const cats = Array.from(new Set(list.map(a => a.category)));

      const categoryColors = {};
      const palette = [
        "#4B73FA", "#FF6F61", "#2ECC71", "#F4C542", "#9B59B6",
        "#00B8D9", "#E67E22", "#1ABC9C", "#E84393", "#16A085",
        "#F39C12", "#2980B9", "#C0392B"
      ];
      categoryColors["Tous"] = "none";
      categoryColors["Autre"] = "#555";
      let colorIndex = 0;
      for (const cat of cats) {
        if (cat === "Tous" || cat === "Autre") continue;
        categoryColors[cat] = palette[colorIndex % palette.length];
        colorIndex++;
      }

      const html =
        `<li><a href="#" data-category="Tous" class="${active === "Tous" ? "active" : ""}">Tous</a></li>` +
        cats.map(c => `<li><a href="#" data-category="${c}" class="${active === c ? "active" : ""}">${c}</a></li>`).join("");
      categoriesContainer.innerHTML = html;

      if (nav) {
        requestAnimationFrame(() => {
          nav.scrollLeft = prevScroll;
        });
      }

      const applyActiveColor = (catName) => {
        categoriesContainer.querySelectorAll("a").forEach(a => {
          a.style.background = "";
          a.style.borderColor = "";
          a.style.boxShadow = "";
          a.style.color = "#111";
        });

        const activeLink = categoriesContainer.querySelector(`a[data-category="${catName}"]`);
        if (activeLink) {
          // ✅ Catégorie "Tous" → fond original, texte noir
          if (catName === "Tous") {
            activeLink.style.background =
              `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.5), rgba(255,255,255,0) 70%),
               radial-gradient(circle at 70% 70%, rgba(255,255,255,0.2), rgba(255,255,255,0) 80%),
               rgba(255,255,255,0.65)`;
            activeLink.style.color = "#111";
            activeLink.style.borderColor = "rgba(255,255,255,0.35)";
            activeLink.style.boxShadow =
              "inset 0.8px 0.8px 0 rgba(255,255,255,0.85), inset -0.8px -0.8px 0 rgba(255,255,255,0.75), 0 2px 20px rgba(0,0,0,0.1)";
            return;
          }

          const baseColor = categoryColors[catName] || "#4B73FA";
          const hex = baseColor.replace("#", "");
          const bigint = parseInt(hex, 16);
          const r = (bigint >> 16) & 255;
          const g = (bigint >> 8) & 255;
          const b = bigint & 255;

          // 🔹 Couleur très translucide
          const translucent = `rgba(${r},${g},${b},0.45)`;
          activeLink.style.background = translucent;
          activeLink.style.color = "rgba(255,255,255,0.85)";
          activeLink.style.borderColor = `rgba(${r},${g},${b},0.15)`;
          activeLink.style.boxShadow = `0 3px 10px rgba(${r},${g},${b},0.18)`;
        }
      };

      applyActiveColor(active);

      categoriesContainer.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", e => {
          e.preventDefault();
          const cat = link.getAttribute("data-category");
          categoriesContainer.querySelectorAll("a").forEach(a => a.classList.remove("active"));
          link.classList.add("active");
          applyActiveColor(cat);
          const filtered = cat === "Tous" ? all : all.filter(a => a.category === cat);
          render(filtered);
        });
      });
    }

    buildCategories(all, "Tous");
    await render(all);

  } catch (err) {
    console.error(err);
    if (container) container.innerHTML = "<p>Erreur lors du chargement des articles.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadArticles);

// ==============================
// Bouton combiné (recherche + menu)
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
});
