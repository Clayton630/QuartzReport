async function loadArticles() {
  // Liste manuelle des fichiers, le plus récent en premier
  const files = [
    "articles/2025-10-01-article-test.md",
    // "articles/2025-09-28-un-autre-article.md"
  ];

  // Charger le premier article
  if (files[0]) {
    const article = await fetchAndParse(files[0]);
    if (article) {
      document.getElementById("last-article-title").textContent = article.title;
      document.getElementById("last-article-desc").textContent = article.description;
      document.getElementById("hottest-title").textContent = article.title;
    }
  }

  // Charger le second article si dispo
  if (files[1]) {
    const article = await fetchAndParse(files[1]);
    if (article) {
      document.getElementById("prev-article-title").textContent = article.title;
      document.getElementById("prev-article-desc").textContent = article.description;
    }
  }
}

async function fetchAndParse(file) {
  try {
    const resp = await fetch(file);
    if (!resp.ok) return null;
    const text = await resp.text();

    // Extraire front matter YAML
    const match = text.match(/^---([\s\S]*?)---([\s\S]*)$/);
    let meta = {};
    if (match) {
      const yaml = match[1].trim();
      yaml.split("\n").forEach(line => {
        const [k, ...rest] = line.split(":");
        meta[k.trim()] = rest.join(":").trim().replace(/^"|"$/g, "");
      });
    }
    return meta;
  } catch (err) {
    console.error("Erreur article", file, err);
    return null;
  }
}

document.addEventListener("DOMContentLoaded", loadArticles);
