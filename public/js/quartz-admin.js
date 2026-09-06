(() => {
  const API = "https://quartzreport-oauth.claytonelhorga.workers.dev";
  const REPOSITORY = "Clayton630/QuartzReport";
  const PREVIEW_BRANCHES = {
    "admin-redesign.quartzreport.pages.dev": "admin-redesign",
  };
  const BRANCH = PREVIEW_BRANCHES[window.location.host] || "main";
  const isPreview = BRANCH !== "main";
  const STORAGE_KEY = "decap-cms-user";
  const MEDIA_CATALOG_PATH = "data/media-catalog.json";
  const CATEGORIES = ["Apple", "Comparatif", "Review", "Analyse", "Autre"];
  const root = document.getElementById("quartz-admin");
  let token = null;
  let profile = null;
  let articles = [];
  let publicProfiles = {};
  let currentArticle = null;
  let pendingCover = null;
  let stagedImages = new Map();
  let savedInlineRange = null;
  let coverSelection = 0;
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
  const adminImageUrl = (value = "", revision = "") => {
    try {
      const url = new URL(String(value), window.location.origin);
      url.searchParams.set("v", revision || "admin");
      url.searchParams.set("admin", String(Date.now()));
      return url.href;
    }
    catch { return ""; }
  };

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
      cache: "no-store",
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

  function insertPendingInlineImage(staged) {
    const editor = root.querySelector("[data-editor-body]");
    const wrapper = document.createElement("span");
    wrapper.className = "qr-admin-pending-image";
    wrapper.contentEditable = "false";
    wrapper.dataset.stagedImage = staged.id;
    wrapper.innerHTML = `<img src="${escapeHtml(staged.previewUrl)}" alt="Image en cours d’envoi"><span><i aria-hidden="true"></i>Envoi de l’image…</span>`;
    const range = savedInlineRange;
    if (range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(wrapper);
      range.setStartAfter(wrapper); range.collapse(true);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    } else {
      const paragraph = document.createElement("p"); paragraph.append(wrapper); editor.append(paragraph);
    }
    savedInlineRange = null;
    return wrapper;
  }

  function resolvePendingInlineImage(staged, wrapper) {
    const image = document.createElement("img");
    image.src = staged.path; image.alt = "";
    wrapper.replaceWith(image);
    URL.revokeObjectURL(staged.previewUrl);
    updateEditorState();
  }

  function openMediaLibrary() {
    const editor = root.querySelector("[data-editor-body]");
    const selection = window.getSelection();
    savedInlineRange = selection?.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer) ? selection.getRangeAt(0).cloneRange() : null;
    root.querySelector("[data-inline-image]").click();
  }

  function base64FromBytes(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    return btoa(binary);
  }

  async function inspectImage(file) {
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choisissez une image JPG, PNG ou WebP.");
    if (file.size > 12 * 1024 * 1024) throw new Error("Cette image dépasse 12 Mo.");
    const sourceBytes = new Uint8Array(await file.arrayBuffer());
    const sourceDigest = await crypto.subtle.digest("SHA-256", sourceBytes);
    const sourceSha256 = [...new Uint8Array(sourceDigest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const sourceUrl = URL.createObjectURL(file);
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("Impossible de lire cette image.")); image.src = sourceUrl; });
    const outputType = file.type === "image/png" ? "image/png" : file.type;
    const normalizedCanvas = document.createElement("canvas"); normalizedCanvas.width = image.naturalWidth; normalizedCanvas.height = image.naturalHeight;
    normalizedCanvas.getContext("2d").drawImage(image, 0, 0);
    const normalized = await new Promise((resolve) => normalizedCanvas.toBlob(resolve, outputType, outputType === "image/png" ? undefined : 0.96));
    URL.revokeObjectURL(sourceUrl);
    if (!normalized) throw new Error("Impossible de préparer cette image.");
    const bytes = new Uint8Array(await normalized.arrayBuffer());
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const previewUrl = URL.createObjectURL(normalized);
    const canvas = document.createElement("canvas"); canvas.width = 9; canvas.height = 8;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, 9, 8);
    const pixels = context.getImageData(0, 0, 9, 8).data;
    let hash = "";
    for (let y = 0; y < 8; y += 1) {
      let value = 0;
      for (let x = 0; x < 8; x += 1) {
        const left = pixels[(y * 9 + x) * 4] * 0.299 + pixels[(y * 9 + x) * 4 + 1] * 0.587 + pixels[(y * 9 + x) * 4 + 2] * 0.114;
        const right = pixels[(y * 9 + x + 1) * 4] * 0.299 + pixels[(y * 9 + x + 1) * 4 + 1] * 0.587 + pixels[(y * 9 + x + 1) * 4 + 2] * 0.114;
        value = (value << 1) | Number(left > right);
      }
      hash += value.toString(16).padStart(2, "0");
    }
    return { bytes, previewUrl, mimeType: outputType, meta: { sha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""), sourceSha256, width: image.naturalWidth, height: image.naturalHeight, bytes: normalized.size, dhash: hash } };
  }

  function hammingDistance(left, right) {
    let distance = 0;
    for (let index = 0; index < left.length; index += 1) {
      let value = parseInt(left[index], 16) ^ parseInt(right[index], 16);
      while (value) { distance += value & 1; value >>>= 1; }
    }
    return distance;
  }

  function imageQuality(image) { return Number(image.width) * Number(image.height); }

  async function loadMediaCatalog() {
    const file = await request(`https://api.github.com/repos/${REPOSITORY}/contents/${MEDIA_CATALOG_PATH}?ref=${encodeURIComponent(BRANCH)}`);
    const source = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ""))));
    const catalog = JSON.parse(source);
    if (!Array.isArray(catalog.images)) throw new Error("Le catalogue d’images est invalide.");
    return { ...catalog, sha: file.sha };
  }

  function findSimilarImage(meta, catalog) {
    const exact = catalog.images.filter((image) => image.sha256 === meta.sha256 || image.sha256 === meta.sourceSha256 || image.sourceSha256 === meta.sourceSha256);
    if (exact.length) return { image: exact.sort((left, right) => Number(left.transformable === false) - Number(right.transformable === false) || imageQuality(right) - imageQuality(left))[0], exact: true };
    const similar = catalog.images
      .filter((image) => Math.abs((image.width / image.height) - (meta.width / meta.height)) < 0.08 && hammingDistance(image.dhash, meta.dhash) <= 6)
      .sort((left, right) => hammingDistance(left.dhash, meta.dhash) - hammingDistance(right.dhash, meta.dhash) || imageQuality(right) - imageQuality(left))[0];
    return similar ? { image: similar, exact: false } : null;
  }

  function askAboutSimilarImage(staged, existing) {
    return new Promise((resolve) => {
      const incomingQuality = imageQuality(staged.meta);
      const existingQuality = imageQuality(existing);
      const newIsBetter = incomingQuality > existingQuality;
      const dialog = document.createElement("section");
      dialog.className = "qr-admin-image-match";
      dialog.innerHTML = `<div class="qr-admin-image-match__panel" role="dialog" aria-modal="true" aria-labelledby="qr-image-match-title"><p class="qr-admin-eyebrow">Image déjà disponible</p><h2 id="qr-image-match-title">Une image très proche existe déjà.</h2><div class="qr-admin-image-match__images"><figure><img src="${escapeHtml(adminImageUrl(existing.path, existing.sha256))}" alt="Version déjà enregistrée"><figcaption>Déjà enregistrée<br>${existing.width} × ${existing.height}</figcaption></figure><figure><img src="${escapeHtml(staged.previewUrl)}" alt="Nouvelle image"><figcaption>Nouvelle image<br>${staged.meta.width} × ${staged.meta.height}</figcaption></figure></div><p>${newIsBetter ? "La nouvelle version est plus définie. Elle peut remplacer celle déjà enregistrée." : "La version déjà enregistrée est au moins aussi définie. Sa réutilisation évite un doublon."}</p><div class="qr-admin-image-match__actions"><button type="button" class="qr-admin-secondary" data-use-existing>Utiliser l’existante</button><button type="button" class="qr-admin-primary" data-use-new>${newIsBetter ? "Remplacer par la nouvelle" : "Conserver quand même la nouvelle"}</button></div></div>`;
      document.body.append(dialog);
      dialog.querySelector("[data-use-existing]").addEventListener("click", () => { dialog.remove(); resolve("existing"); });
      dialog.querySelector("[data-use-new]").addEventListener("click", () => { dialog.remove(); resolve("new"); });
    });
  }

  async function stageImage(file) {
    const staged = { id: `image-${Date.now()}-${Math.random().toString(36).slice(2)}`, fileName: file?.name || "", status: "uploading", isNew: true, replaceExisting: false };
    stagedImages.set(staged.id, staged); updatePublishState();
    try {
      const inspected = await inspectImage(file);
      const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" })[inspected.mimeType];
      staged.previewUrl = inspected.previewUrl;
      staged.meta = inspected.meta;
      staged.path = `/img/uploads/${Date.now()}-${slugify(file.name.replace(/\.[^.]+$/, ""))}.${extension}`;
      const [blob, catalog] = await Promise.all([
        request(`https://api.github.com/repos/${REPOSITORY}/git/blobs`, { method: "POST", body: JSON.stringify({ content: base64FromBytes(inspected.bytes), encoding: "base64" }) }),
        loadMediaCatalog(),
      ]);
      staged.blobSha = blob.sha;
      const match = findSimilarImage(staged.meta, catalog);
      if (match?.exact) {
        staged.path = match.image.path; staged.isNew = false;
        notice("Image déjà enregistrée : réutilisation automatique.");
      } else if (match) {
        staged.status = "choice"; updatePublishState();
        const choice = await askAboutSimilarImage(staged, match.image);
        if (choice === "existing") { staged.path = match.image.path; staged.isNew = false; }
        else if (imageQuality(staged.meta) > imageQuality(match.image)) { staged.path = match.image.path; staged.replaceExisting = true; }
      }
      staged.status = "ready";
      return staged;
    } catch (error) {
      stagedImages.delete(staged.id); if (staged.previewUrl) URL.revokeObjectURL(staged.previewUrl); updatePublishState();
      throw error;
    } finally {
      updatePublishState();
    }
  }

  function pendingImageCount() {
    return [...stagedImages.values()].filter((image) => image.status === "uploading" || image.status === "choice").length;
  }

  function updatePublishState() {
    const publish = root.querySelector("[data-publish]");
    const status = root.querySelector("[data-editor-status]");
    if (!publish || !status) return;
    const pending = pendingImageCount();
    if (pending) {
      publish.disabled = true;
      status.textContent = `${pending === 1 ? "Image en cours d’envoi…" : `${pending} images en cours d’envoi…`} Publication disponible dès la fin de l’envoi.`;
      return;
    }
    publish.disabled = !editorDirty;
    status.textContent = editorDirty ? "Modifications non publiées" : "Prêt à publier";
  }

  function updateEditorState() {
    editorDirty = true;
    updatePublishState();
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

  function bindAdminHeader() {
    root.querySelector("[data-account]")?.addEventListener("click", openAccountMenu);
    root.querySelector(".qr-admin-brand")?.addEventListener("click", (event) => {
      event.preventDefault();
      if (editorDirty && root.querySelector("[data-article-form]") && !window.confirm("Quitter sans publier vos modifications ?")) return;
      goBackToDashboard();
    });
  }

  function bindAdminImages() {
    root.querySelectorAll("img[data-admin-image]").forEach((image) => {
      let attempts = 0;
      image.addEventListener("error", () => {
        if (attempts >= 16) return;
        attempts += 1;
        window.setTimeout(() => {
          image.src = adminImageUrl(image.dataset.adminImage, `${image.dataset.adminRevision || "article"}-${attempts}`);
        }, 3000);
      });
    });
  }

  function articleCard(article) {
    const image = article.thumbnail ? `<img src="${escapeHtml(adminImageUrl(article.thumbnail, article.sha))}" data-admin-image="${escapeHtml(article.thumbnail)}" data-admin-image-revision="${escapeHtml(article.sha)}" alt="" loading="lazy">` : "<span class=\"qr-admin-card__placeholder\">Article</span>";
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
    bindAdminHeader();
    root.querySelector("[data-search]").addEventListener("input", (event) => {
      const needle = event.target.value.trim().toLocaleLowerCase();
      root.querySelector("[data-list]").innerHTML = articles.filter((article) => `${article.title} ${article.description} ${article.category}`.toLocaleLowerCase().includes(needle)).map(articleCard).join("") || "<p class=\"qr-admin-empty\">Aucun résultat.</p>";
      bindArticleCards();
      bindAdminImages();
    });
    bindArticleCards();
    bindAdminImages();
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
          <label>Image de couverture <small>Elle apparaît en tête de l’article, sur l’accueil et lors des partages.</small><input name="cover" type="file" accept="image/jpeg,image/png,image/webp"><span class="qr-admin-cover-preview" data-cover-preview>${current.thumbnail ? `<img src="${escapeHtml(adminImageUrl(current.thumbnail, article?.sha))}" data-admin-image="${escapeHtml(current.thumbnail)}" data-admin-image-revision="${escapeHtml(article?.sha || "article")}" alt="">` : "Aucune image sélectionnée"}</span></label>
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
    stagedImages = new Map();
    savedInlineRange = null;
    coverSelection = 0;
    editorDirty = false;
    root.innerHTML = editorTemplate(article);
    bindAdminHeader();
    bindAdminImages();
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
      let pending = null;
      try {
        pending = { id: `pending-${Date.now()}`, previewUrl: URL.createObjectURL(file), status: "uploading" };
        const placeholder = insertPendingInlineImage(pending);
        URL.revokeObjectURL(pending.previewUrl);
        const staged = await stageImage(file);
        resolvePendingInlineImage(staged, placeholder);
      }
      catch (error) { notice(error.message, "error"); }
      event.target.value = "";
    });
    root.querySelector("[name=cover]").addEventListener("change", async (event) => {
      const file = event.target.files[0] || null;
      const preview = root.querySelector("[data-cover-preview]");
      if (!file) return;
      const selection = ++coverSelection;
      const localPreview = URL.createObjectURL(file);
      preview.classList.add("is-uploading");
      preview.innerHTML = `<img src="${escapeHtml(localPreview)}" alt="Aperçu de l’image de couverture"><span><i aria-hidden="true"></i>Envoi de l’image…</span>`;
      try {
        const staged = await stageImage(file);
        if (selection !== coverSelection) return;
        pendingCover = staged;
        preview.classList.remove("is-uploading");
        preview.innerHTML = `<img src="${escapeHtml(pendingCover.previewUrl)}" alt="Aperçu de l’image de couverture">`;
        URL.revokeObjectURL(localPreview);
        updateEditorState();
      } catch (error) {
        URL.revokeObjectURL(localPreview); preview.classList.remove("is-uploading"); preview.textContent = "Aucune image sélectionnée";
        notice(error.message, "error");
      }
    });
    root.querySelector("[data-preview]").addEventListener("click", openArticlePreview);
    root.querySelector("[data-publish]").addEventListener("click", publishArticle);
    root.querySelector("[data-delete]")?.addEventListener("click", deleteArticle);
  }

  function openArticlePreview() {
    const form = root.querySelector("[data-article-form]");
    const cover = pendingCover?.previewUrl || currentArticle?.thumbnail;
    const modal = document.createElement("section");
    modal.className = "qr-admin-preview";
    const publicationDate = currentArticle?.date || new Date().toISOString();
    const displayAuthor = currentArticle?.authorDisplayName || currentArticle?.author || profile.name;
    modal.innerHTML = `<div class="qr-admin-preview__bar"><strong>Aperçu de l’article</strong><button type="button" data-close-preview>Fermer</button></div><main class="articles"><article class="article-full">${cover ? `<div class="article-cover"><img src="${escapeHtml(cover)}" alt=""></div>` : ""}<header class="article-header"><h1>${escapeHtml(form.elements.title.value || "Sans titre")}</h1><p class="article-meta">Par ${escapeHtml(displayAuthor)}, le ${escapeHtml(friendlyDate(publicationDate))}</p></header><section class="article-body">${root.querySelector("[data-editor-body]").innerHTML}</section></article></main>`;
    document.body.append(modal);
    modal.querySelector("[data-close-preview]").addEventListener("click", () => modal.remove());
  }

  function textToBase64(value) { return btoa(unescape(encodeURIComponent(value))); }

  async function createGitBlob(content) {
    const blob = await request(`https://api.github.com/repos/${REPOSITORY}/git/blobs`, { method: "POST", body: JSON.stringify({ content: textToBase64(content), encoding: "base64" }) });
    return blob.sha;
  }

  async function commitArticleAndImages({ path, source, title, usedImagePaths }) {
    const catalog = await loadMediaCatalog();
    const currentRef = await request(`https://api.github.com/repos/${REPOSITORY}/git/ref/heads/${encodeURIComponent(BRANCH)}`);
    const parent = await request(`https://api.github.com/repos/${REPOSITORY}/git/commits/${currentRef.object.sha}`);
    const nextCatalog = { version: 1, images: [...catalog.images] };
    const entries = [];
    for (const staged of stagedImages.values()) {
      if (!staged.isNew || !usedImagePaths.has(staged.path)) continue;
      const catalogEntry = { path: staged.path, ...staged.meta };
      const previousIndex = nextCatalog.images.findIndex((image) => image.path === staged.path);
      if (previousIndex >= 0) nextCatalog.images.splice(previousIndex, 1, catalogEntry);
      else nextCatalog.images.push(catalogEntry);
      entries.push({ path: `public${staged.path}`, mode: "100644", type: "blob", sha: staged.blobSha });
    }
    const [articleBlob, catalogBlob] = await Promise.all([createGitBlob(source), createGitBlob(`${JSON.stringify(nextCatalog, null, 2)}\n`)]);
    entries.push({ path, mode: "100644", type: "blob", sha: articleBlob }, { path: MEDIA_CATALOG_PATH, mode: "100644", type: "blob", sha: catalogBlob });
    const tree = await request(`https://api.github.com/repos/${REPOSITORY}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: parent.tree.sha, tree: entries }) });
    const commit = await request(`https://api.github.com/repos/${REPOSITORY}/git/commits`, { method: "POST", body: JSON.stringify({ message: `${currentArticle ? "Mettre à jour" : "Créer"} l’article « ${title} »`, tree: tree.sha, parents: [currentRef.object.sha] }) });
    await request(`https://api.github.com/repos/${REPOSITORY}/git/refs/heads/${encodeURIComponent(BRANCH)}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
  }

  async function publishArticle() {
    const form = root.querySelector("[data-article-form]");
    if (!form.reportValidity()) return;
    const publish = root.querySelector("[data-publish]");
    const publishLabel = currentArticle ? "Publier les modifications" : "Publier l’article";
    if (!editorDirty || pendingImageCount()) return;
    publish.disabled = true; publish.textContent = currentArticle ? "Publication des modifications…" : "Publication de l’article…";
    try {
      const title = form.elements.title.value.trim();
      const cover = pendingCover?.path || currentArticle?.thumbnail || "";
      const date = currentArticle?.date || new Date().toISOString();
      const author = currentArticle ? currentArticle.author : profile.name;
      const authorGithubId = currentArticle ? currentArticle.authorGithubId : profile.githubId;
      const markdown = editorMarkdown();
      const source = `---\ntitle: ${escapeYaml(title)}\ndate: ${date}\nauthor: ${escapeYaml(author)}\n${authorGithubId ? `author_github_id: ${escapeYaml(authorGithubId)}\n` : ""}description: ${escapeYaml(form.elements.description.value.trim())}\n${cover ? `thumbnail: ${escapeYaml(cover)}\n` : ""}important: ${form.elements.important.checked}\ncategory: ${escapeYaml(form.elements.category.value)}\n---\n${markdown}\n`;
      const path = currentArticle?.path || `articles/${slugify(title)}.md`;
      const usedImagePaths = new Set([...markdown.matchAll(/!\[[^\]]*\]\((\/img\/uploads\/[^\s)]+)/g)].map((match) => match[1]));
      if (cover) usedImagePaths.add(cover);
      await commitArticleAndImages({ path, source, title, usedImagePaths });
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
    bindAdminHeader();
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
