(() => {
  const API = "https://quartzreport-oauth.claytonelhorga.workers.dev";
  const REPOSITORY = "Clayton630/QuartzReport";
  const PREVIEW_BRANCHES = {
    "admin-redesign.quartzreport.pages.dev": "admin-redesign",
  };
  const BRANCH = PREVIEW_BRANCHES[window.location.host] || "main";
  const isPreview = BRANCH !== "main";
  const STORAGE_KEY = "decap-cms-user";
  const CATEGORIES = ["Apple", "Comparatif", "Review", "Analyse", "Autre"];
  const root = document.getElementById("quartz-admin");
  let token = null;
  let profile = null;
  let articles = [];
  let publicProfiles = {};
  let currentArticle = null;
  let pendingCover = null;
  let pendingPhoto = null;
  let editorDirty = false;

  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  const escapeYaml = (value = "") => JSON.stringify(String(value));
  const friendlyDate = (value) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const slugify = (value) => String(value || "article")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "article";

  function getStoredToken() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return typeof value?.token === "string" ? value.token : null;
    } catch {
      return null;
    }
  }

  function rememberToken(value) {
    token = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: value, provider: "github" }));
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem("decap-cms-auth");
    token = null;
    profile = null;
    renderLogin();
  }

  function setHistory(view, data = {}, replace = false) {
    const state = { quartzAdmin: true, view, ...data };
    history[replace ? "replaceState" : "pushState"](state, "", window.location.href);
  }

  function goBackToDashboard() {
    if (history.state?.quartzAdmin && history.state.view !== "dashboard") history.back();
    else renderDashboard();
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.error || "La demande a échoué.");
    return body;
  }

  async function profileRequest(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Impossible de charger votre profil.");
    return body;
  }

  function notice(message, type = "success") {
    const element = document.createElement("div");
    element.className = `qr-admin-notice qr-admin-notice--${type}`;
    element.textContent = message;
    document.body.append(element);
    window.setTimeout(() => element.remove(), 4200);
  }

  function renderLogin(error = "") {
    root.innerHTML = `
      <section class="qr-admin-login">
        <img src="/img/logo.svg" alt="Quartz Report" class="qr-admin-login__logo">
        <div>
          <p class="qr-admin-eyebrow">Administration</p>
          <h1>Rédigez et publiez.</h1>
          <p>Connectez-vous avec GitHub pour accéder à l’espace contributeur.</p>
          ${error ? `<p class="qr-admin-form-error">${escapeHtml(error)}</p>` : ""}
          <button class="qr-admin-primary" type="button" data-login>Se connecter avec GitHub</button>
        </div>
      </section>`;
    root.querySelector("[data-login]").addEventListener("click", beginLogin);
  }

  function beginLogin() {
    const loginUrl = new URL(`${API}/auth`);
    loginUrl.searchParams.set("site_id", window.location.host);
    const popup = window.open(loginUrl, "quartzreport-github", "width=600,height=720");
    if (!popup) notice("Autorisez l’ouverture de la fenêtre GitHub puis réessayez.", "error");
  }

  function parseMessage(data) {
    if (typeof data !== "string" || !data.startsWith("authorization:github:success:")) return null;
    try {
      return JSON.parse(data.slice("authorization:github:success:".length));
    } catch {
      return null;
    }
  }

  window.addEventListener("message", async (event) => {
    if (event.origin !== new URL(API).origin) return;
    const auth = parseMessage(event.data);
    if (!auth?.token) return;
    rememberToken(auth.token);
    await boot();
  });

  window.addEventListener("popstate", () => {
    if (!token || !profile) return;
    const state = history.state;
    if (!state?.quartzAdmin || state.view === "dashboard") { renderDashboard(); return; }
    if (state.view === "profile") { openProfile(Boolean(state.required), { push: false }); return; }
    if (state.view === "editor") openEditor(articles.find((article) => article.path === state.path) || null, { push: false });
  });

  function parseFrontMatter(source) {
    const match = String(source || "").match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (!match) return { meta: {}, body: String(source || "") };
    const meta = {};
    for (const line of match[1].split("\n")) {
      const entry = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
      if (!entry) continue;
      const [, key, raw] = entry;
      const value = raw.trim();
      try { meta[key] = value.startsWith('"') ? JSON.parse(value) : value.replace(/^'|'$/g, ""); }
      catch { meta[key] = value.replace(/^"|"$/g, ""); }
    }
    return { meta, body: match[2].trim() };
  }

  function inlineMarkdown(value) {
    const images = [];
    let result = String(value).replace(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+["']([^"']*)["'])?\)/g, (_, alt, src, title = "") => {
      const safeSrc = /^(https?:\/\/|\/img\/uploads\/)/.test(src) ? src : "";
      if (!safeSrc) return "";
      const token = `ZZIMAGEPLACEHOLDER${images.length}ZZ`;
      images.push({ token, html: `<img src="${escapeHtml(safeSrc)}" alt="${escapeHtml(alt)}" title="${escapeHtml(title)}">` });
      return token;
    });
    result = escapeHtml(result);
    result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
    result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    result = result.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
    result = result.replace(/(?<!_)_([^_]+)_(?!_)/g, "<em>$1</em>");
    for (const image of images) result = result.replace(image.token, image.html);
    return result;
  }

  function markdownToHtml(markdown) {
    const lines = String(markdown || "").replaceAll("\r", "").split("\n");
    const output = [];
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) { index += 1; continue; }
      if (line.startsWith("```")) {
        const code = []; index += 1;
        while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
        index += 1; output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`); continue;
      }
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) { const level = heading[1].length; output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); index += 1; continue; }
      if (/^---+$/.test(line.trim())) { output.push("<hr>"); index += 1; continue; }
      if (line.startsWith("> ")) { output.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`); index += 1; continue; }
      const unordered = line.match(/^[-*+]\s+(.+)$/);
      const ordered = line.match(/^\d+\.\s+(.+)$/);
      if (unordered || ordered) {
        const tag = ordered ? "ol" : "ul"; const items = [];
        while (index < lines.length) {
          const item = tag === "ol" ? lines[index].match(/^\d+\.\s+(.+)$/) : lines[index].match(/^[-*+]\s+(.+)$/);
          if (!item) break;
          items.push(`<li>${inlineMarkdown(item[1])}</li>`); index += 1;
        }
        output.push(`<${tag}>${items.join("")}</${tag}>`); continue;
      }
      if (/^!\[[^\]]*\]\(/.test(line.trim())) { output.push(`<p>${inlineMarkdown(line)}</p>`); index += 1; continue; }
      const paragraph = [line]; index += 1;
      while (index < lines.length && lines[index].trim() && !/^(#{1,3}\s|```|> |[-*+]\s+|\d+\.\s+|---+$)/.test(lines[index])) paragraph.push(lines[index++]);
      output.push(`<p>${paragraph.map(inlineMarkdown).join("<br>")}</p>`);
    }
    return output.join("");
  }

  function markdownFromNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/([\\`*_{}\[\]()#+.!|-])/g, "\\$1");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const content = [...node.childNodes].map(markdownFromNode).join("");
    switch (node.tagName.toLowerCase()) {
      case "strong": case "b": return `**${content}**`;
      case "em": case "i": return `*${content}*`;
      case "code": return node.parentElement?.tagName.toLowerCase() === "pre" ? content : `\`${node.textContent}\``;
      case "a": {
        const href = node.getAttribute("href") || "";
        return /^https?:\/\//.test(href) ? `[${content}](${href})` : content;
      }
      case "br": return "\n";
      case "h1": return `# ${content}\n\n`;
      case "h2": return `## ${content}\n\n`;
      case "h3": return `### ${content}\n\n`;
      case "p": case "div": return `${content}\n\n`;
      case "blockquote": return `> ${content.trim()}\n\n`;
      case "li": return content;
      case "ul": return [...node.children].map((item) => `- ${markdownFromNode(item).trim()}`).join("\n") + "\n\n";
      case "ol": return [...node.children].map((item, index) => `${index + 1}. ${markdownFromNode(item).trim()}`).join("\n") + "\n\n";
      case "pre": return `\`\`\`\n${node.textContent}\n\`\`\`\n\n`;
      case "hr": return "---\n\n";
      case "img": {
        const src = node.getAttribute("src") || "";
        const alt = node.getAttribute("alt") || "";
        const title = node.getAttribute("title") || "";
        return /^(https?:\/\/|\/img\/uploads\/)/.test(src) ? `![${alt}](${src}${title ? ` \"${title}\"` : ""})\n\n` : "";
      }
      default: return content;
    }
  }

  function editorMarkdown() {
    return [...root.querySelector("[data-editor-body]").childNodes].map(markdownFromNode).join("").replace(/\n{3,}/g, "\n\n").trim();
  }

  function command(commandName, value = null) {
    const editor = root.querySelector("[data-editor-body]");
    editor.focus();
    document.execCommand(commandName, false, value);
    updateEditorState();
  }

  function insertInlineImage(path) {
    const editor = root.querySelector("[data-editor-body]");
    const image = document.createElement("img");
    image.src = path;
    image.alt = "";
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(image);
      range.setStartAfter(image);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      const paragraph = document.createElement("p");
      paragraph.append(image);
      editor.append(paragraph);
    }
    editor.focus();
    updateEditorState();
  }

  async function openMediaLibrary() {
    const picker = document.createElement("section");
    picker.className = "qr-admin-media";
    picker.innerHTML = `<header class="qr-admin-media__bar"><button type="button" class="qr-admin-back" data-close-media>‹ Retour</button><strong>Insérer une image</strong><button type="button" class="qr-admin-secondary" data-upload-media>Importer</button></header><main class="qr-admin-media__content"><p>Choisissez une image déjà enregistrée, ou importez-en une nouvelle.</p><div class="qr-admin-media__grid" data-media-list><span>Chargement des images…</span></div></main>`;
    document.body.append(picker);
    picker.querySelector("[data-close-media]").addEventListener("click", () => picker.remove());
    picker.querySelector("[data-upload-media]").addEventListener("click", () => root.querySelector("[data-inline-image]").click());
    try {
      const listing = await request(`https://api.github.com/repos/${REPOSITORY}/contents/public/img/uploads?ref=${BRANCH}`);
      const images = listing.filter((entry) => entry.type === "file" && /\.(jpe?g|png|webp)$/i.test(entry.name));
      const list = picker.querySelector("[data-media-list]");
      list.innerHTML = images.length ? images.map((entry) => `<button type="button" data-media-path="/img/uploads/${encodeURIComponent(entry.name)}"><img src="/img/uploads/${encodeURIComponent(entry.name)}" alt=""><span>${escapeHtml(entry.name)}</span></button>`).join("") : "<span>Aucune image enregistrée.</span>";
      list.querySelectorAll("[data-media-path]").forEach((button) => button.addEventListener("click", () => {
        insertInlineImage(button.dataset.mediaPath);
        picker.remove();
      }));
    } catch (error) {
      picker.querySelector("[data-media-list]").textContent = error.message || "Impossible de charger les images.";
    }
  }

  function updateEditorState() {
    editorDirty = true;
    root.querySelector("[data-editor-status]").textContent = "Modifications non publiées";
    const publish = root.querySelector("[data-publish]");
    if (publish) publish.disabled = false;
  }

  async function loadArticles() {
    const listing = await request(`https://api.github.com/repos/${REPOSITORY}/contents/articles?ref=${BRANCH}`);
    const entries = await Promise.all(listing.filter((entry) => entry.type === "file" && entry.name.endsWith(".md")).map(async (entry) => {
      const file = await request(entry.url);
      const source = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ""))));
      const { meta, body } = parseFrontMatter(source);
      return {
        path: entry.path, sha: file.sha, source, body, meta,
        title: meta.title || "Sans titre", description: meta.description || "", category: meta.category || "Autre",
        thumbnail: meta.thumbnail || "", important: meta.important === true || meta.important === "true",
        date: meta.date || new Date(0).toISOString(), author: meta.author || "Inconnu", authorGithubId: meta.author_github_id || "",
      };
    }));
    const ids = [...new Set(entries.map((article) => article.authorGithubId).filter((id) => /^\d{1,20}$/.test(id)))];
    try {
      publicProfiles = ids.length ? (await profileRequest(`/api/profiles?ids=${encodeURIComponent(ids.join(","))}`)).profiles || {} : {};
    } catch {
      publicProfiles = {};
    }
    for (const article of entries) article.authorDisplayName = publicProfiles[article.authorGithubId]?.name || article.author;
    articles = entries.sort((left, right) => new Date(right.date) - new Date(left.date));
  }

  function profileAvatar() {
    return profile?.hasPhoto ? `${API}/api/profile/avatar/${encodeURIComponent(profile.githubId)}?v=${Date.now()}` : "";
  }

  function renderHeader() {
    const avatar = profileAvatar();
    return `<header class="qr-admin-header">
      <a class="qr-admin-brand" href="/admin/" aria-label="Accueil de l’administration"><img src="/img/logo.svg" alt="Quartz Report"></a>
      <button class="qr-admin-account" type="button" data-account aria-label="Options du compte">
        ${avatar ? `<img src="${avatar}" alt="">` : "<span aria-hidden=\"true\">◉</span>"}
      </button>
    </header>`;
  }

  function articleCard(article) {
    const image = article.thumbnail ? `<img src="${escapeHtml(article.thumbnail)}" alt="" loading="lazy">` : "<span class=\"qr-admin-card__placeholder\">Article</span>";
    return `<article class="qr-admin-card" data-edit="${escapeHtml(article.path)}">
      <div class="qr-admin-card__image">${image}</div>
      <div class="qr-admin-card__content">
        <p class="qr-admin-card__meta">${escapeHtml(article.category)} · ${escapeHtml(friendlyDate(article.date))}</p>
        <h2>${escapeHtml(article.title)}</h2>
        <p>${escapeHtml(article.description)}</p>
        <p class="qr-admin-card__author">Par ${escapeHtml(article.authorDisplayName || article.author)}</p>
      </div>
      <span class="qr-admin-card__action" aria-hidden="true">›</span>
    </article>`;
  }

  function renderDashboard() {
    root.innerHTML = `${renderHeader()}
      <section class="qr-admin-dashboard">
        ${isPreview ? '<p class="qr-admin-preview-banner">Version de test : les articles publiés ici restent dans la branche de test.</p>' : ""}
        <div class="qr-admin-dashboard__intro">
          <div><p class="qr-admin-eyebrow">Bonjour ${escapeHtml(profile.name)}</p><h1>Vos articles</h1></div>
          <button class="qr-admin-primary" type="button" data-new>Ajouter un article</button>
        </div>
        <label class="qr-admin-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Rechercher un article" data-search></label>
        <div class="qr-admin-article-list" data-list>${articles.map(articleCard).join("") || "<p class=\"qr-admin-empty\">Aucun article pour le moment.</p>"}</div>
      </section>`;
    root.querySelector("[data-new]").addEventListener("click", () => openEditor());
    root.querySelector("[data-account]").addEventListener("click", openAccountMenu);
    root.querySelector("[data-search]").addEventListener("input", (event) => {
      const needle = event.target.value.trim().toLocaleLowerCase();
      root.querySelector("[data-list]").innerHTML = articles.filter((article) => `${article.title} ${article.description} ${article.category}`.toLocaleLowerCase().includes(needle)).map(articleCard).join("") || "<p class=\"qr-admin-empty\">Aucun résultat.</p>";
      bindArticleCards();
    });
    bindArticleCards();
  }

  function bindArticleCards() {
    root.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openEditor(articles.find((article) => article.path === button.dataset.edit))));
  }

  function openAccountMenu() {
    const previous = root.querySelector(".qr-admin-account-menu");
    if (previous) { previous.remove(); return; }
    const menu = document.createElement("div");
    menu.className = "qr-admin-account-menu";
    menu.innerHTML = `<button type="button" data-profile>Mon profil</button><button type="button" data-logout>Se déconnecter</button>`;
    root.querySelector(".qr-admin-header").append(menu);
    menu.querySelector("[data-profile]").addEventListener("click", () => openProfile(false));
    menu.querySelector("[data-logout]").addEventListener("click", logout);
    window.setTimeout(() => document.addEventListener("click", function close(event) {
      if (!menu.contains(event.target) && !root.querySelector("[data-account]").contains(event.target)) { menu.remove(); document.removeEventListener("click", close); }
    }), 0);
  }

  function editorToolbar() {
    return `<div class="qr-admin-toolbar" aria-label="Outils de mise en forme">
      <button type="button" data-command="bold" title="Gras"><strong>G</strong></button>
      <button type="button" data-command="italic" title="Italique"><em>I</em></button>
      <button type="button" data-block="h2" title="Grand intertitre">H2</button>
      <button type="button" data-block="h3" title="Petit intertitre">H3</button>
      <button type="button" data-command="insertUnorderedList" title="Liste à puces">•≡</button>
      <button type="button" data-command="insertOrderedList" title="Liste numérotée">1≡</button>
      <button type="button" data-block="blockquote" title="Citation">❝</button>
      <button type="button" data-link title="Ajouter un lien">↗</button>
      <button type="button" data-command="formatBlock" data-value="pre" title="Bloc de code">&lt;/&gt;</button>
      <button type="button" data-divider title="Séparateur">—</button>
      <button type="button" data-image title="Insérer une image">▧</button>
    </div>`;
  }

  function editorTemplate(article) {
    const current = article || { title: "", description: "", category: "Autre", date: new Date().toISOString(), thumbnail: "", important: false, body: "" };
    const publishLabel = article ? "Publier les modifications" : "Publier l’article";
    return `${renderHeader()}
      <section class="qr-admin-editor">
        <div class="qr-admin-editor__topbar"><button class="qr-admin-back" type="button" data-back>‹ <span>Retour</span></button><div class="qr-admin-editor__actions"><button class="qr-admin-icon-button" type="button" data-preview aria-label="Prévisualiser l’article">◉</button><button class="qr-admin-primary" type="button" data-publish disabled>${publishLabel}</button></div></div>
        <div class="qr-admin-editor__heading"><p class="qr-admin-eyebrow">${article ? "Modifier l’article" : "Nouvel article"}</p><h1>${article ? escapeHtml(article.title) : "Rédiger un article"}</h1></div>
        <form class="qr-admin-form" data-article-form>
          <label>Titre <input name="title" maxlength="160" required value="${escapeHtml(current.title)}" placeholder="Le titre de votre article"></label>
          <label>Résumé <small>Il apparaît sur la page d’accueil et dans les aperçus partagés.</small><textarea name="description" maxlength="300" required placeholder="Expliquez brièvement le sujet de l’article.">${escapeHtml(current.description)}</textarea></label>
          <div class="qr-admin-field-row"><label>Catégorie <select name="category">${CATEGORIES.map((category) => `<option ${category === current.category ? "selected" : ""}>${category}</option>`).join("")}</select></label><label class="qr-admin-feature-toggle"><input name="important" type="checkbox" ${current.important ? "checked" : ""}><span><strong>Mettre en avant</strong><small>Affiche l’article dans la sélection principale de l’accueil.</small></span></label></div>
          <label>Image de couverture <small>Elle apparaît en tête de l’article, sur l’accueil et lors des partages.</small><input name="cover" type="file" accept="image/jpeg,image/png,image/webp"><span class="qr-admin-cover-preview" data-cover-preview>${current.thumbnail ? `<img src="${escapeHtml(current.thumbnail)}" alt="">` : "Aucune image sélectionnée"}</span></label>
          <label class="qr-admin-content-label">Contenu <small>Écrivez directement votre article tel qu’il sera lu.</small></label>
          ${editorToolbar()}
          <div class="qr-admin-rich-editor" contenteditable="true" role="textbox" aria-multiline="true" data-editor-body>${markdownToHtml(current.body)}</div>
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-inline-image>
          <p class="qr-admin-editor-status" data-editor-status>Prêt à publier</p>
        </form>
        ${article ? '<button class="qr-admin-delete" type="button" data-delete>Supprimer cet article</button>' : ""}
      </section>`;
  }

  function openEditor(article = null, { push = true } = {}) {
    if (push) setHistory("editor", { path: article?.path || null });
    currentArticle = article;
    pendingCover = null;
    editorDirty = false;
    root.innerHTML = editorTemplate(article);
    root.querySelector("[data-account]").addEventListener("click", openAccountMenu);
    root.querySelector("[data-back]").addEventListener("click", () => {
      if (root.querySelector("[data-editor-status]").textContent === "Modifications non publiées" && !window.confirm("Quitter sans publier vos modifications ?")) return;
      goBackToDashboard();
    });
    root.querySelector("[data-article-form]").addEventListener("input", updateEditorState);
    root.querySelector("[data-article-form]").addEventListener("change", updateEditorState);
    root.querySelectorAll("[data-command]").forEach((button) => button.addEventListener("click", () => command(button.dataset.command, button.dataset.value || null)));
    root.querySelectorAll("[data-block]").forEach((button) => button.addEventListener("click", () => command("formatBlock", button.dataset.block)));
    root.querySelector("[data-divider]").addEventListener("click", () => command("insertHorizontalRule"));
    root.querySelector("[data-link]").addEventListener("click", () => {
      const href = window.prompt("Adresse du lien (https://…)");
      if (href && /^https?:\/\//i.test(href)) command("createLink", href);
      else if (href) notice("Le lien doit commencer par https://", "error");
    });
    root.querySelector("[data-image]").addEventListener("click", openMediaLibrary);
    root.querySelector("[data-inline-image]").addEventListener("change", async (event) => {
      const file = event.target.files[0]; if (!file) return;
      try { insertInlineImage(await uploadImage(file)); document.querySelector(".qr-admin-media")?.remove(); }
      catch (error) { notice(error.message, "error"); }
      event.target.value = "";
    });
    root.querySelector("[name=cover]").addEventListener("change", (event) => {
      pendingCover = event.target.files[0] || null;
      const preview = root.querySelector("[data-cover-preview]");
      if (!pendingCover) return;
      preview.innerHTML = `<img src="${URL.createObjectURL(pendingCover)}" alt="Aperçu de l’image de couverture">`;
      updateEditorState();
    });
    root.querySelector("[data-preview]").addEventListener("click", openArticlePreview);
    root.querySelector("[data-publish]").addEventListener("click", publishArticle);
    root.querySelector("[data-delete]")?.addEventListener("click", deleteArticle);
  }

  function openArticlePreview() {
    const form = root.querySelector("[data-article-form]");
    const cover = pendingCover ? URL.createObjectURL(pendingCover) : currentArticle?.thumbnail;
    const modal = document.createElement("section");
    modal.className = "qr-admin-preview";
    const publicationDate = currentArticle?.date || new Date().toISOString();
    const displayAuthor = currentArticle?.authorDisplayName || currentArticle?.author || profile.name;
    modal.innerHTML = `<div class="qr-admin-preview__bar"><strong>Aperçu de l’article</strong><button type="button" data-close-preview>Fermer</button></div><main class="articles"><article class="article-full">${cover ? `<div class="article-cover"><img src="${escapeHtml(cover)}" alt=""></div>` : ""}<header class="article-header"><h1>${escapeHtml(form.elements.title.value || "Sans titre")}</h1><p class="article-meta">Par ${escapeHtml(displayAuthor)}, le ${escapeHtml(friendlyDate(publicationDate))}</p></header><section class="article-body">${root.querySelector("[data-editor-body]").innerHTML}</section></article></main>`;
    document.body.append(modal);
    modal.querySelector("[data-close-preview]").addEventListener("click", () => modal.remove());
  }

  async function uploadImage(file) {
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choisissez une image JPG, PNG ou WebP.");
    if (file.size > 12 * 1024 * 1024) throw new Error("Cette image dépasse 12 Mo.");
    const content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("Impossible de lire cette image.")); reader.readAsDataURL(file); });
    const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" })[file.type];
    const path = `public/img/uploads/${Date.now()}-${slugify(file.name.replace(/\.[^.]+$/, ""))}.${extension}`;
    await request(`https://api.github.com/repos/${REPOSITORY}/contents/${encodeURIComponent(path).replaceAll("%2F", "/")}`, { method: "PUT", body: JSON.stringify({ message: `Ajouter l’image ${file.name}`, content, branch: BRANCH }) });
    return `/${path.slice("public/".length)}`;
  }

  async function publishArticle() {
    const form = root.querySelector("[data-article-form]");
    if (!form.reportValidity()) return;
    const publish = root.querySelector("[data-publish]");
    const publishLabel = currentArticle ? "Publier les modifications" : "Publier l’article";
    if (!editorDirty) return;
    publish.disabled = true; publish.textContent = currentArticle ? "Publication des modifications…" : "Publication de l’article…";
    try {
      const title = form.elements.title.value.trim();
      const cover = pendingCover ? await uploadImage(pendingCover) : currentArticle?.thumbnail || "";
      const date = currentArticle?.date || new Date().toISOString();
      const author = currentArticle ? currentArticle.author : profile.name;
      const authorGithubId = currentArticle ? currentArticle.authorGithubId : profile.githubId;
      const markdown = editorMarkdown();
      const source = `---\ntitle: ${escapeYaml(title)}\ndate: ${date}\nauthor: ${escapeYaml(author)}\n${authorGithubId ? `author_github_id: ${escapeYaml(authorGithubId)}\n` : ""}description: ${escapeYaml(form.elements.description.value.trim())}\n${cover ? `thumbnail: ${escapeYaml(cover)}\n` : ""}important: ${form.elements.important.checked}\ncategory: ${escapeYaml(form.elements.category.value)}\n---\n${markdown}\n`;
      const path = currentArticle?.path || `articles/${slugify(title)}.md`;
      const body = { message: `${currentArticle ? "Mettre à jour" : "Créer"} l’article « ${title} »`, content: btoa(unescape(encodeURIComponent(source))), branch: BRANCH };
      if (currentArticle?.sha) body.sha = currentArticle.sha;
      await request(`https://api.github.com/repos/${REPOSITORY}/contents/${encodeURIComponent(path).replaceAll("%2F", "/")}`, { method: "PUT", body: JSON.stringify(body) });
      notice("Article publié. Il sera visible sur Quartz Report dans environ une minute.");
      await loadArticles(); setHistory("dashboard", {}, true); renderDashboard();
    } catch (error) {
      notice(error.message || "La publication a échoué.", "error");
      publish.disabled = false; publish.textContent = publishLabel;
    }
  }

  async function deleteArticle() {
    if (!currentArticle || !window.confirm(`Supprimer définitivement « ${currentArticle.title} » ?`)) return;
    const deletedArticle = currentArticle;
    const deletedIndex = articles.findIndex((article) => article.path === deletedArticle.path);
    articles = articles.filter((article) => article.path !== deletedArticle.path);
    currentArticle = null;
    renderDashboard();
    notice("Suppression en cours…");
    try {
      await request(`https://api.github.com/repos/${REPOSITORY}/contents/${encodeURIComponent(deletedArticle.path).replaceAll("%2F", "/")}`, { method: "DELETE", body: JSON.stringify({ message: `Supprimer l’article « ${deletedArticle.title} »`, sha: deletedArticle.sha, branch: BRANCH }) });
      notice("Article supprimé. La mise à jour sera visible dans environ une minute.");
    } catch (error) {
      articles.splice(Math.max(0, deletedIndex), 0, deletedArticle);
      articles.sort((left, right) => new Date(right.date) - new Date(left.date));
      renderDashboard();
      notice(error.message || "La suppression a échoué : l’article a été rétabli.", "error");
    }
  }

  async function loadProfilePhoto(file) {
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choisissez une image JPG, PNG ou WebP.");
    if (file.size > 8 * 1024 * 1024) throw new Error("La photo dépasse 8 Mo.");
    const source = URL.createObjectURL(file);
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("Impossible de lire cette image.")); image.src = source; });
    URL.revokeObjectURL(source);
    return { image, zoom: 1, x: 50, y: 50 };
  }

  function cropProfilePhoto(source) {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 512;
    const scale = Math.max(512 / source.image.naturalWidth, 512 / source.image.naturalHeight) * source.zoom;
    const width = source.image.naturalWidth * scale; const height = source.image.naturalHeight * scale;
    const left = (512 - width) * (source.x / 100); const top = (512 - height) * (source.y / 100);
    canvas.getContext("2d").drawImage(source.image, left, top, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
    return { type: "image/jpeg", base64: dataUrl.split(",")[1], preview: dataUrl };
  }

  function openProfile(required, { push = true } = {}) {
    if (push) setHistory("profile", { required: Boolean(required) });
    root.querySelector(".qr-admin-account-menu")?.remove();
    pendingPhoto = null;
    root.innerHTML = `${renderHeader()}<section class="qr-admin-profile-page"><h1>Mon profil</h1><p>${required ? "Votre nom public est nécessaire avant de rédiger un article." : "Seuls votre nom et votre photo sont visibles publiquement."}</p><form data-profile-form><label>Nom public <input name="name" maxlength="80" required value="${escapeHtml(profile?.name || "")}"></label><label>Photo de profil <input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="qr-admin-profile-crop" data-profile-crop hidden><img class="qr-admin-profile-preview" data-profile-preview alt="Aperçu recadré de la photo"><label>Zoom <input type="range" min="1" max="3" step="0.01" value="1" data-crop-zoom></label><label>Position horizontale <input type="range" min="0" max="100" value="50" data-crop-x></label><label>Position verticale <input type="range" min="0" max="100" value="50" data-crop-y></label></div><img class="qr-admin-profile-preview" data-current-profile-preview ${profile?.hasPhoto ? `src="${profileAvatar()}"` : "hidden"} alt="Photo de profil actuelle"><label>E-mail <input name="email" type="email" maxlength="254" value="${escapeHtml(profile?.email || "")}"></label><label>Téléphone <input name="phone" maxlength="40" value="${escapeHtml(profile?.phone || "")}"></label><div class="qr-admin-profile-links"><strong>Liens personnels ou réseaux</strong></div><p class="qr-admin-form-error" data-profile-error></p><div class="qr-admin-profile-actions">${required ? '<button type="button" class="qr-admin-secondary" data-profile-logout>Se déconnecter</button>' : '<button type="button" class="qr-admin-secondary" data-close-profile>Annuler</button>'}<button type="submit" class="qr-admin-primary">Enregistrer</button></div></form></section>`;
    root.querySelector("[data-account]").addEventListener("click", openAccountMenu);
    const form = root.querySelector("[data-profile-form]");
    const links = root.querySelector(".qr-admin-profile-links");
    for (let index = 0; index < 4; index += 1) links.insertAdjacentHTML("beforeend", `<input type="url" name="link-${index}" placeholder="https://…" value="${escapeHtml(profile?.links?.[index] || "")}">`);
    form.elements.photo.addEventListener("change", async (event) => {
      try {
        pendingPhoto = await loadProfilePhoto(event.target.files[0]);
        const crop = root.querySelector("[data-profile-crop]"); crop.hidden = false;
        root.querySelector("[data-current-profile-preview]").hidden = true;
        updateProfileCropPreview();
      } catch (error) { root.querySelector("[data-profile-error]").textContent = error.message; }
    });
    root.querySelectorAll("[data-crop-zoom], [data-crop-x], [data-crop-y]").forEach((input) => input.addEventListener("input", () => {
      pendingPhoto.zoom = Number(root.querySelector("[data-crop-zoom]").value);
      pendingPhoto.x = Number(root.querySelector("[data-crop-x]").value);
      pendingPhoto.y = Number(root.querySelector("[data-crop-y]").value);
      updateProfileCropPreview();
    }));
    root.querySelectorAll("[data-close-profile]").forEach((button) => button.addEventListener("click", goBackToDashboard));
    root.querySelector("[data-profile-logout]")?.addEventListener("click", logout);
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); const submit = form.querySelector("[type=submit]"); submit.disabled = true;
      try {
        const cropped = pendingPhoto ? cropProfilePhoto(pendingPhoto) : null;
        const result = await profileRequest("/api/profile/me", { method: "PUT", body: JSON.stringify({ name: form.elements.name.value, email: form.elements.email.value, phone: form.elements.phone.value, links: [...links.querySelectorAll("input")].map((input) => input.value), ...(cropped ? { photo: { type: cropped.type, base64: cropped.base64 } } : {}) }) });
        profile = result.profile; setHistory("dashboard", {}, true); renderDashboard();
      } catch (error) { root.querySelector("[data-profile-error]").textContent = error.message; submit.disabled = false; }
    });
  }

  function updateProfileCropPreview() {
    if (!pendingPhoto) return;
    const image = root.querySelector("[data-profile-preview]");
    image.src = cropProfilePhoto(pendingPhoto).preview;
  }

  async function boot() {
    token = getStoredToken();
    if (!token) { renderLogin(); return; }
    root.innerHTML = '<section class="qr-admin-loading"><img src="/img/logo.svg" alt="Quartz Report"><p>Connexion sécurisée…</p></section>';
    try {
      profile = (await profileRequest("/api/profile/me")).profile;
      if (!profile) {
        root.innerHTML = '<section class="qr-admin-loading"><img src="/img/logo.svg" alt="Quartz Report"><p>Création de votre profil contributeur…</p></section>';
        setHistory("profile", { required: true }, true);
        openProfile(true, { push: false });
        return;
      }
      await loadArticles();
      if (!history.state?.quartzAdmin) setHistory("dashboard", {}, true);
      const state = history.state;
      if (state.view === "profile") openProfile(Boolean(state.required), { push: false });
      else if (state.view === "editor") openEditor(articles.find((article) => article.path === state.path) || null, { push: false });
      else renderDashboard();
    } catch (error) {
      if (/Connexion GitHub requise|401/.test(error.message)) { logout(); return; }
      renderLogin(error.message);
    }
  }

  boot();
})();
