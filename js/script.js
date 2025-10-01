async function loadArticles() {
  const container = document.getElementById("articles");

  // ⚠️ Pour l’instant, on liste les fichiers à la main.
  // Plus tard, on pourra automatiser avec GitHub API ou un index JSON généré.
  const files = [
    "articles/2025-10-01-article-test.md"
  ];

  for (let file of files) {
    try {
      const resp = await fetch(file);
      if (!resp.ok) continue;
      const text = await resp.text();

      // Extraire front matter YAML (entre --- et ---)
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

      // Créer le bloc article
      const articleEl = document.createElement("article");
      articleEl.innerHTML = `
        <h3>${meta.title || "Sans titre"}</h3>
        <p><em>${meta.date || ""} – ${meta.author || ""}</em></p>
        <p>${meta.description || ""}</p>
        <a href="${file}">Lire l'article complet</a>
      `;
      container.appendChild(articleEl);
    } catch (err) {
      console.error("Erreur chargement article", file, err);
    }
  }
}

document.addEventListener("DOMContentLoaded", loadArticles);
