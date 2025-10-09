// ========= Fonctions utilitaires =========
function base64ToUtf8(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

// ========= Chargement d’un article unique =========
async function loadSingleArticle() {
  const params = new URLSearchParams(window.location.search);
  const file = params.get("file");

  const repo = "Clayton630/QuartzReport";
  const branch = "main";
  const workerBase = "https://quartzreport-oauth.claytonelhorga.workers.dev/api";

  const container = document.getElementById("article-full");

  if (!file) {
    container.innerHTML = "<p>Article introuvable.</p>";
    return;
  }

  try {
    const apiResp = await fetch(`${workerBase}/repos/${repo}/contents/articles/${file}?ref=${branch}`);
    if (!apiResp.ok) throw new Error("Erreur chargement contenu article");

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

    const date = new Date(meta.date || Date.now());
    const dateDisplay = date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    container.innerHTML = `
      <article class="article-full">
        <header class="article-header">
          <h1>${meta.title || "Sans titre"}</h1>
          <p class="article-meta">Par ${meta.author || "Inconnu"}, le ${dateDisplay}</p>
          ${
            meta.thumbnail
              ? `<div class="article-image"><img src="${meta.thumbnail}" alt=""></div>`
              : ""
          }
        </header>
        <section class="article-body">
          ${marked.parse(body)}
        </section>
      </article>
    `;
  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>Erreur lors du chargement de l'article.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadSingleArticle);
