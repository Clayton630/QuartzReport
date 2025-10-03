function base64ToUtf8(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

async function loadArticle() {
  const container = document.getElementById("article-full");

  const repo = "Clayton630/QuartzReport";
  const branch = "main";
  const workerBase = "https://quartzreport-oauth.claytonelhorga.workers.dev/api";

  const params = new URLSearchParams(window.location.search);
  const file = params.get("file");
  if (!file) {
    container.innerHTML = "<p>Aucun article trouvé.</p>";
    return;
  }

  try {
    const apiResp = await fetch(
      `${workerBase}/repos/${repo}/contents/articles/${file}?ref=${branch}&_=${Date.now()}`,
      { cache: "no-store" }
    );
    if (!apiResp.ok) {
      container.innerHTML = "<p>Impossible de charger l’article.</p>";
      return;
    }

    const apiData = await apiResp.json();
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

    // Image de couverture
    let cover = meta.thumbnail || "img/article-placeholder.jpg";
    const firstImg = body.match(/!\[.*?\]\((.*?)\)/);
    if (!meta.thumbnail && firstImg) {
      cover = firstImg[1];
    }

    // Rendu markdown -> HTML
    const htmlBody = marked.parse(body);

    container.innerHTML = `
      <article class="article-block">
        <div class="article-header">
          <h3>${meta.title || "Sans titre"}</h3>
        </div>
        <div class="article-meta">
          <p><em>Le ${new Date(meta.date).toLocaleDateString("fr-FR")} à ${new Date(meta.date).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})} par ${meta.author || ""}</em></p>
        </div>
        <div class="article-image">
          <img src="${cover}" alt="">
        </div>
        <div class="article-body">
          ${htmlBody}
        </div>
      </article>
    `;
  } catch (err) {
    console.error("Erreur lors du chargement de l’article :", err);
    container.innerHTML = "<p>Erreur lors du chargement.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadArticle);
