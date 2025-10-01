async function loadArticles() {
  const container = document.getElementById("articles");

  // Ton repo
  const repo = "Clayton630/QuartzReport";
  const branch = "main";

  // 1. Lister les fichiers via l’API GitHub
  const resp = await fetch(`https://api.github.com/repos/${repo}/contents/articles?ref=${branch}`);
  if (!resp.ok) {
    container.innerHTML = "<p>Impossible de charger les articles.</p>";
    return;
  }

  const files = await resp.json();

  // 2. Charger chaque fichier .md et parser
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
      body: body,
      file: file.download_url
    });
  }

  // 3. Trier les articles par date décroissante
  articles.sort((a, b) => new Date(b.date) - new Date(a.date));

  // 4. Générer le HTML
  for (let article of articles) {
    const el = document.createElement("article");
    el.className = "article-block";
    el.innerHTML = `
      <div class="content">
        <h3>${article.title}</h3>
        <p><em>${article.date} – ${article.author}</em></p>
        <p>${article.description}</p>
        <a href="${article.file}" target="_blank">Lire l’article complet</a>
      </div>
    `;
    container.appendChild(el);
  }
}

document.addEventListener("DOMContentLoaded", loadArticles);
