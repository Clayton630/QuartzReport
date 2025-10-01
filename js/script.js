async function loadArticles() {
  const container = document.getElementById("articles");
  const hottestContainer = document.getElementById("hottest");
  const categoriesContainer = document.getElementById("categories");

  // Ton repo GitHub
  const repo = "Clayton630/QuartzReport";
  const branch = "main";

  try {
    // 1. Lister les fichiers dans /articles via API GitHub
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

      // Extraire front matter YAML
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
        file: file.download_url
      });
    }

    // 2. Trier les articles par date décroissante
    articles.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 3. Générer la navigation catégories
    const uniqueCategories = [...new Set(articles.map(a => a.category))];
    categoriesContainer.innerHTML = uniqueCategories
      .map(cat => `<li><a href="#" data-category="${cat}">${cat}</a></li>`)
      .join("");

    // 4. Générer les articles Hottest (important: true)
    hottestContainer.innerHTML = "";
    const hottestArticles = articles.filter(a => a.important).slice(0, 3);
    hottestArticles.forEach(article => {
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <img src="${article.thumbnail}" alt="">
        <h3>${article.title}</h3>
      `;
      hottestContainer.appendChild(card);
    });

    // 5. Fonction pour afficher la liste des articles
    function renderArticles(list) {
      container.innerHTML = "";
      list.forEach(article => {
        const el = document.createElement("article");
        el.className = "article-block";
        el.innerHTML = `
          <img src="${article.thumbnail}" alt="">
          <div class="content">
            <h3>${article.title}</h3>
            <p><em>${article.date} – ${article.author} – ${article.category}</em></p>
            <p>${article.description}</p>
            <a href="${article.file}" target="_blank">Lire l’article complet</a>
          </div>
        `;
        container.appendChild(el);
      });
    }

    // 6. Afficher tous les articles au départ
    renderArticles(articles);

    // 7. Filtrage par catégorie
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
