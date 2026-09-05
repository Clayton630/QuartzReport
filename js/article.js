// ========= Décodage GitHub =========
function base64ToUtf8(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function optimizedImageUrl(url, width = 1600) {
  if (!url) return "";
  const source = url.startsWith("/") ? `https://quartzreport.pages.dev${url}` : url;
  if (!/^https?:\/\//i.test(source)) return "";
  return `https://quartzreport-oauth.claytonelhorga.workers.dev/img?src=${encodeURIComponent(source)}&w=${width}&q=85`;
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
    const apiResp = await fetch(`${workerBase}/articles?ref=${branch}`);
    if (!apiResp.ok) throw new Error("Erreur chargement contenu article");

    const { articles = [] } = await apiResp.json();
    const apiData = articles.find((article) => article.name === file);
    if (!apiData) throw new Error("Article introuvable");
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

    // ✅ Construction de l'article avec image de couverture plein écran
    const safeTitle = escapeHtml(meta.title || "Sans titre");
    const safeAuthor = escapeHtml(meta.author || "Inconnu");
    const cover = optimizedImageUrl(meta.thumbnail);
    const renderedBody = window.DOMPurify
      ? window.DOMPurify.sanitize(marked.parse(body))
      : escapeHtml(body);

    container.innerHTML = `
      <article class="article-full">
        ${
          cover
            ? `<div class="article-cover">
                 <img src="${cover}" alt="Illustration de l'article" loading="eager" decoding="async">
               </div>`
            : ""
        }
        <header class="article-header">
          <h1>${safeTitle}</h1>
          <p class="article-meta">Par ${safeAuthor}, le ${dateDisplay}</p>
        </header>
        <section class="article-body">
          ${renderedBody}
        </section>
      </article>
    `;
  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>Erreur lors du chargement de l'article.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadSingleArticle);
