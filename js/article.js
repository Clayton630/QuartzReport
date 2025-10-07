// ========= Décodage GitHub =========
function base64ToUtf8(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

// ========= Chargement d’un article individuel =========
async function loadArticle() {
  const container = document.getElementById("article-full");
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug");
  if (!slug) {
    container.innerHTML = "<p>Aucun article spécifié.</p>";
    return;
  }

  const repo = "Clayton630/QuartzReport";
  const branch = "main";
  const workerBase = "https://quartzreport-oauth.claytonelhorga.workers.dev/api";

  try {
    // Récupération du fichier .md correspondant
    const resp = await fetch(`${workerBase}/repos/${repo}/contents/articles/${slug}.md?ref=${branch}`);
    if (!resp.ok) throw new Error("Article introuvable");
    const data = await resp.json();
    const text = base64ToUtf8(data.content);

    // Extraction du front matter YAML
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

    // Image de couverture
    let cover = meta.thumbnail || "img/article-placeholder.jpg";
    const firstImg = body.match(/!\[.*?\]\((.*?)\)/);
    if (!meta.thumbnail && firstImg) cover = firstImg[1];

    // Formatage date
    const dateObj = new Date(meta.date || Date.now());
    const dateStr = dateObj.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    // Rendu de l’article
    container.innerHTML = `
      <article class="article-block">
        <div class="article-header">
          <h3>${meta.title || "Sans titre"}</h3>
        </div>
        <div class="article-meta">
          <em>Publié le ${dateStr} par ${meta.author || "Inconnu"}</em>
        </div>
        <div class="article-image">
          <img src="${cover}" alt="">
        </div>
        <div class="article-body">
          ${marked.parse(body)}
        </div>
      </article>
    `;
  } catch (err) {
    console.error("Erreur lors du chargement de l’article :", err);
    container.innerHTML = "<p>Erreur lors du chargement de l’article.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadArticle);
