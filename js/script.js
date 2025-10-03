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

  // 👉 Ton Worker Cloudflare
  const workerBase = "https://quartzreport-oauth.claytonelhorga.workers.dev/api";

  try {
    // 1. Lister les fichiers dans /articles via le Worker
    const resp = await fetch(
      `${workerBase}/repos/${repo}/contents/articles?ref=${branch}&_=${Date.now()}`,
      { cache: "no-store" }
    );
    if (!resp.ok) {
      container.innerHTML = "<p>Impossible de charger les articles.</p>";
      return;
    }

    const files = await resp.json();
    const articles = [];

    for (let file of files) {
      if (!file.name.endsWith(".md")) continue;

      // ✅ Récupération via Worker (contenu base64)
      const apiResp = await fetch(
        `${workerBase}/repos/${repo}/contents/articles/${file.name}?ref=${branch}&_=${Date.now()}`,
        { cache: "no-store" }
      );
      const apiData = await apiResp.json();

      // ✅ Décodage UTF-8 du contenu
      const text = base64ToUtf8(apiData.content);

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
        file: `https://github.com/${repo}/blob/${branch}/articles/${file.name}`,
        body: body
      });
    }

    // 2. Trier par date décroissante
    articles.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 3. Générer navigation catégories
    const uniqueCategories = [...new Set(articles.map(a => a.category))];
    categoriesContainer.innerHTML = uniqueCategories
      .map(cat => `<li><a href="#" data-category="${cat}">${cat}</a></li>`)
      .join("");

    // 4. Articles importants (Hottest)
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

    // 5. Articles dans le feed
    function renderArticles(list) {
      container.innerHTML = "";
      list.forEach(article => {
        const el = document.createElement("article");
        el.className = "article-block";
        el.innerHTML = `
          <div class="article-header">
            <h3>${article.title}</h3>
          </div>
          <div class="article-meta">
            <p><em>Le ${new Date(article.date).toLocaleDateString("fr-FR")} à ${new Date(article.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} par ${article.author}</em></p>
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

    // 6. Filtrage par catégorie
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
