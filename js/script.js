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
        <img src="${article.thumbnail}" alt="">
        <div class="card-content">
          <p class="card-meta">Par ${article.author}, ${dateDisplay}</p>
          <h3>${article.title}</h3>
        </div>`;
      hottestContainer.appendChild(link);
    });

    // ======================
    // CATÉGORIES (couleurs dynamiques + stroke)
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

      if (nav) requestAnimationFrame(() => (nav.scrollLeft = prevScroll));

      const applyActiveColor = (catName) => {
        categoriesContainer.querySelectorAll("a").forEach(a => {
          a.classList.remove("colored-active");
          a.style.removeProperty("--cat-color");
        });

        const activeLink = categoriesContainer.querySelector(`a[data-category="${catName}"]`);
        if (!activeLink) return;

        if (catName === "Tous") {
          activeLink.classList.remove("colored-active");
          activeLink.style.background =
            `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.5), rgba(255,255,255,0) 70%),
             radial-gradient(circle at 70% 70%, rgba(255,255,255,0.2), rgba(255,255,255,0) 80%),
             rgba(255,255,255,0.65)`;
          activeLink.style.color = "#111";
          return;
        }

        const baseColor = categoryColors[catName] || "#4B73FA";
        activeLink.classList.add("colored-active");
        activeLink.style.setProperty("--cat-color", baseColor);
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
          // tu peux appeler render(filtered) ici si tu veux filtrer
        });
      });
    }

    buildCategories(all, "Tous");
  } catch (err) {
    console.error(err);
    if (container) container.innerHTML = "<p>Erreur lors du chargement des articles.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadArticles);
