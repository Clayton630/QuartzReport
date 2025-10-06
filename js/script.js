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
    const articles = [];

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
      let cover = meta.thumbnail || "img/article-placeholder.jpg";
      const firstImg = body.match(/!\[.*?\]\((.*?)\)/);
      if (!meta.thumbnail && firstImg) cover = firstImg[1];

      articles.push({
        slug,
        title: meta.title || "Sans titre",
        date: meta.date || "",
        author: meta.author || "Inconnu",
        description: meta.description || "",
        thumbnail: cover,
        category: meta.category || "Autre",
        important: meta.important === "true" || meta.important === true,
        body
      });
    }

    // ✅ tri
    articles.sort((a, b) => new Date(b.date) - new Date(a.date));

    // ✅ catégories (réintégré)
    const uniqueCategories = [...new Set(articles.map(a => a.category))];
    categoriesContainer.innerHTML = uniqueCategories
      .map(cat => `<li><a href="#" data-category="${cat}">${cat}</a></li>`)
      .join("");

    // ✅ hottest
    hottestContainer.innerHTML = "";
    const hottestArticles = articles.filter(a => a.important).slice(0, 3);
    hottestArticles.forEach(article => {
      const link = document.createElement("a");
      link.href = `article.html?slug=${encodeURIComponent(article.slug)}`;
      link.className = "card";

      const date = new Date(article.date).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short"
      });

      link.innerHTML = `
        <img src="${article.thumbnail}" alt="">
        <div class="card-content">
          <p class="card-meta">Par ${article.author}, le ${date}.</p>
          <h3>${article.title}</h3>
        </div>
      `;
      hottestContainer.appendChild(link);
    });

    // ✅ regroupement par jour
    container.innerHTML = "";
    const grouped = {};

    articles.forEach(article => {
      const d = new Date(article.date);
      const key = d.toISOString().split("T")[0];
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(article);
    });

    Object.keys(grouped)
      .sort((a, b) => new Date(b) - new Date(a))
      .forEach(dateKey => {
        const dayBlock = document.createElement("div");
        dayBlock.className = "day-block";

        const dateObj = new Date(dateKey);
        const formattedDate = dateObj.toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "short"
        });

        dayBlock.innerHTML = `<h3 class="day-title">${formattedDate}</h3>`;

        grouped[dateKey].forEach((article, index) => {
          const el = document.createElement("div");
          el.className = "day-article";
          el.innerHTML = `
            <a href="article.html?slug=${encodeURIComponent(article.slug)}" class="day-article-link">
              <img src="${article.thumbnail}" alt="${article.title}">
              <div class="day-article-info">
                <p class="day-meta">Par ${article.author}, le ${formattedDate}.</p>
                <h4>${article.title}</h4>
              </div>
            </a>
          `;
          dayBlock.appendChild(el);

          if (index < grouped[dateKey].length - 1) {
            const sep = document.createElement("div");
            sep.className = "day-separator";
            dayBlock.appendChild(sep);
          }
        });

        container.appendChild(dayBlock);
      });

    // ✅ filtrage catégories
    categoriesContainer.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        const cat = link.getAttribute("data-category");
        const filtered = cat === "Tous" ? articles : articles.filter(a => a.category === cat);
        renderArticles(filtered);
      });
    });
  } catch (err) {
    console.error("Erreur lors du chargement :", err);
    container.innerHTML = "<p>Erreur lors du chargement des articles.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadArticles);
