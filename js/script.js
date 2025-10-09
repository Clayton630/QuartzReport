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

    // Tri par date décroissante
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
    // SECTION CATÉGORIES
    // ======================
    const categories = [...new Set(all.map(a => a.category))];
    categoriesContainer.innerHTML = categories
      .map(c => `<li><a href="#" data-category="${c}">${c}</a></li>`)
      .join("");

    // ======================
    // FEED ARTICLES — version progressive
    // ======================
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    container.innerHTML = "";

    const renderArticle = (article) => {
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
      return el;
    };

    async function renderProgressively(list) {
      container.innerHTML = "";
      for (let i = 0; i < list.length; i++) {
        const article = list[i];
        const el = renderArticle(article);
        container.appendChild(el);
        // 👇 injection progressive (1 par 1)
        await new Promise(res => setTimeout(res, 200)); 
      }
    }

    await renderProgressively(all);

  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>Erreur lors du chargement des articles.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadArticles);
