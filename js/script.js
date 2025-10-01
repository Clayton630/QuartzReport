async function loadArticles() {
  const container = document.getElementById("articles");
  const hottestContainer = document.getElementById("hottest");
  const categoriesContainer = document.getElementById("categories");

  const repo = "Clayton630/QuartzReport";
  const branch = "main";

  try {
    const resp = await fetch(`https://api.github.com/repos/${repo}/contents/articles?ref=${branch}`);
    if (!resp.ok) {
      container.innerHTML = "<p>Impossible de charger les articles.</p>";
      return;
    }

    const files = await resp.json();
    const articles = [];

    for (let file of files) {
      if (!file.name.endsWith(".md")) continue;

      const raw = await fetch(file.download_url);
      const text = await raw.text();

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

      articles.push({
        title: meta.title || "Sans titre",
        date: meta.date || "",
        author: meta.author || "",
        description: meta.description || "",
        thumbnail: meta.thumbnail || "img/article-placeholder.jpg",
        category: meta.category || "Autre",
        important: meta.important === "true" || meta.important === true,
        file: file.download_url,
        body: body
      });
    }

    // Trier par date décroissante
    articles.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Générer catégories
    const uniqueCategories = [...new Set(articles.map(a => a.category))];
    categoriesContainer.innerHTML = uniqueCategories
      .map(cat => `<li><a href="#" data-category="${cat}">${cat}</a></li>`)
      .join("");

    // Générer Hottest
    hottestContainer.innerHTML = "";
    const hottestArticles = articles.filter(a => a.important).slice(0, 3);
    hottestArticles.forEach(article => {
      const link = document.createElement("a");
      link.href = article.file;
      link.target = "_blank";
      link.className = "card";
      link.innerHTML = `
        <img src="${article.thumbnail}" alt="">
        <div class="card-content">
          <h3>${article.title}</h3>
        </div>
      `;
      hottestContainer.appendChild(link);
    });

    // Fonction pour formater date + heure
    function formatDateTime(dateStr) {
      const d = new Date(dateStr);
      if (isNaN(d)) return dateStr;
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    }

    // Rendu des articles
    function renderArticles(list) {
      container.innerHTML = "";
      list.forEach(article => {
        const formattedDate = formatDateTime(article.date);

        const el = document.createElement("article");
        el.className = "article-block";
        el.innerHTML = `
          <div class="article-header">
            <h3>${article.title}</h3>
          </div>
          <div class="article-meta">
            <p><em>${formattedDate} par ${article.author}</em></p>
          </div>
          <div class="article-image">
            <img src="${article.thumbnail}" alt="">
          </div>
          <div class="article-body">
            <p>${article.body.replace(/\n/g, "<br>")}</p>
          </div>
        `;
        container.appendChild(el);
      });
    }

    renderArticles(articles);

    // Filtrage par catégorie
    categoriesContainer.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        const cat = link.getAttribute("data-category");
        if (cat === "Tous") {
          renderArticles(articles);
        } else {
          renderArticles(articles.filter(a => a.category === cat));
        }
      });
    });
  } catch (err) {
    console.error("Erreur lors du chargement des articles :", err);
    container.innerHTML = "<p>Erreur lors du chargement des articles.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadArticles);
