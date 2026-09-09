import { Editor, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { Markdown } from "@tiptap/markdown";

(() => {
  const API = "https://quartzreport-oauth.claytonelhorga.workers.dev";
  const REPOSITORY = "Clayton630/QuartzReport";
  const PREVIEW_BRANCHES = {
    "admin-redesign.quartzreport.pages.dev": "admin-redesign",
  };
  const BRANCH = PREVIEW_BRANCHES[window.location.host] || "main";
  const isLocalLab = window.location.hostname === "localhost" || /^192\.168\./.test(window.location.hostname);
  const LOCAL_HOST = window.location.hostname;
  const DRAFT_API = isLocalLab ? `http://${LOCAL_HOST}:8787` : API;
  const DRAFT_MEDIA_API = isLocalLab ? `http://${LOCAL_HOST}:8788` : "";
  const DRAFT_MEDIA_BRANCH = "draft-media";
  const isPreview = BRANCH !== "main";
  const STORAGE_KEY = "decap-cms-user";
  const MEDIA_CATALOG_PATH = "data/media-catalog.json";
  const MAX_SOURCE_IMAGE_BYTES = 50 * 1024 * 1024;
  const MAX_PUBLISHED_IMAGE_BYTES = 24 * 1024 * 1024;
  const CATEGORIES = ["Apple", "Comparatif", "Review", "Analyse", "Autre"];
  const QuartzImage = Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        previewSrc: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-qr-preview-src"),
        },
      };
    },
    renderHTML({ HTMLAttributes }) {
      const { previewSrc, src, ...attributes } = HTMLAttributes;
      return ["img", mergeAttributes(attributes, {
        src: previewSrc || src,
        ...(previewSrc && src ? { "data-qr-published-src": src } : {}),
      })];
    },
  });
  const root = document.getElementById("quartz-admin");
  let token = null;
  let profile = null;
  let articles = [];
  let drafts = [];
  let publicProfiles = {};
  let currentArticle = null;
  let pendingCover = null;
  let stagedImages = new Map();
  const transientImagePreviews = new Map();
  let savedInlineRange = null;
  let coverSelection = 0;
  let pendingPhoto = null;
  let editorDirty = false;
  let richEditor = null;

  const isDraft = (article) => Boolean(article?.isDraft);
  const newDraftId = () => `draft_${crypto.randomUUID().replaceAll("-", "")}`;

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
  const adminImageUrl = (value = "", revision = "", width = 0, retry = "") => {
    try {
      const original = new URL(String(value), window.location.origin);
      if (window.location.hostname === "localhost" || /^192\.168\./.test(window.location.hostname)) {
        original.searchParams.set("v", revision || "admin");
        return original.href;
      }
      const url = width ? new URL(`/cdn-cgi/image/width=${width},quality=80,format=webp${original.pathname}`, window.location.origin) : original;
      url.searchParams.set("v", revision || "admin");
      if (retry) url.searchParams.set("retry", retry);
      return url.href;
    }
    catch { return ""; }
  };
  const adminGithubImageUrl = (value = "", revision = "") => {
    try {
      const path = new URL(String(value), window.location.origin).pathname;
      const url = new URL(`https://raw.githubusercontent.com/${REPOSITORY}/${BRANCH}/public${path}`);
      url.searchParams.set("v", revision || "admin");
      return url.href;
    } catch { return ""; }
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
    exitEditorFullscreen();
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem("decap-cms-auth");
    token = null;
    profile = null;
    renderLogin();
  }

  function setHistory(view, data = {}, replace = false) {
    const currentDepth = Number.isInteger(history.state?.quartzAdminDepth) ? history.state.quartzAdminDepth : 0;
    const state = { quartzAdmin: true, quartzAdminDepth: replace ? currentDepth : currentDepth + 1, view, ...data };
    history[replace ? "replaceState" : "pushState"](state, "", window.location.href);
  }

  function goBackToDashboard() {
    exitEditorFullscreen();
    history.replaceState({ quartzAdmin: true, quartzAdminDepth: 0, view: "dashboard" }, "", window.location.href);
    renderDashboard();
  }

  function exitEditorFullscreen() {
    const composer = root.querySelector("[data-composer].is-fullscreen");
    composer?.classList.remove("is-fullscreen");
    document.body.classList.remove("qr-admin-composer-fullscreen");
    const button = root.querySelector("[data-fullscreen]");
    if (!button) return;
    button.textContent = "⛶";
    button.title = "Plein écran";
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-pressed", "false");
  }

  async function request(url, options = {}) {
    if (isLocalLab && !["GET", "HEAD"].includes(options.method || "GET")) {
      throw new Error("L’environnement local est protégé : il ne peut pas modifier le vrai site.");
    }
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
    if (isLocalLab && !["GET", "HEAD"].includes(options.method || "GET")) {
      throw new Error("L’environnement local est protégé : il ne peut pas modifier le vrai profil.");
    }
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

  async function draftRequest(path, options = {}) {
    const response = await fetch(`${DRAFT_API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Impossible de gérer le brouillon.");
    return body;
  }

  async function loadDrafts() {
    const result = await draftRequest("/api/drafts");
    drafts = (result.drafts || []).map((draft) => ({ ...draft, isDraft: true, author: profile.name, authorDisplayName: profile.name, authorGithubId: profile.githubId, date: draft.createdAt || new Date().toISOString() }));
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
          <p>Connectez-vous avec GitHub pour accéder à votre espace rédacteur.</p>
          ${error ? `<p class="qr-admin-form-error">${escapeHtml(error)}</p>` : ""}
          <button class="qr-admin-primary qr-admin-login-button" type="button" data-login><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .6A11.4 11.4 0 0 0 8.4 22.8c.57.11.78-.25.78-.55v-2.15c-3.17.69-3.84-1.34-3.84-1.34-.52-1.33-1.27-1.68-1.27-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.33.96.1-.74.4-1.25.73-1.54-2.53-.29-5.2-1.27-5.2-5.65 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.45.11-3.03 0 0 .97-.31 3.14 1.17A10.9 10.9 0 0 1 12 6c.97 0 1.95.13 2.86.39 2.18-1.48 3.14-1.17 3.14-1.17.62 1.58.23 2.74.11 3.03.73.8 1.18 1.82 1.18 3.07 0 4.39-2.67 5.36-5.21 5.65.41.35.78 1.03.78 2.08v3.18c0 .3.21.66.79.55A11.4 11.4 0 0 0 12 .6Z"/></svg><span>Se connecter avec GitHub</span></button>
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
    // L'entrée supplémentaire ajoutée à l'ouverture du plein écran sert
    // uniquement à permettre au bouton Retour du navigateur de le fermer.
    if (document.querySelector("[data-composer].is-fullscreen")) {
      exitEditorFullscreen();
      return;
    }
    // Le retour natif iOS peut réafficher l'éditeur précédent : on efface
    // systématiquement l'état visuel plein écran avant de reconstruire la vue.
    exitEditorFullscreen();
    const state = history.state;
    if (!state?.quartzAdmin || state.view === "dashboard") { renderDashboard(); return; }
    if (state.view === "profile") { openProfile(Boolean(state.required), { push: false }); return; }
    if (state.view === "drafts") { renderDrafts(); return; }
    if (state.view === "editor") {
      const item = state.draftId ? drafts.find((draft) => draft.id === state.draftId) : articles.find((article) => article.path === state.path);
      openEditor(item || null, { push: false });
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") exitEditorFullscreen();
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

  function uploadPathsInSource(source) {
    const paths = new Set();
    for (const match of String(source || "").matchAll(/\/img\/uploads\/[^\s"'<>)]*/g)) {
      const raw = match[0].split(/[?#]/, 1)[0].replace(/[.,;:!?]+$/g, "");
      try {
        const path = decodeURIComponent(raw);
        if (path.startsWith("/img/uploads/") && !path.includes("..")) paths.add(path);
      } catch { /* Une URL mal encodée ne doit jamais déclencher une suppression. */ }
    }
    return paths;
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
    result = result.replace(/~~([^~]+)~~/g, "<s>$1</s>");
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
      const tableDivider = (value) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(value.trim());
      if (line.includes("|") && index + 1 < lines.length && tableDivider(lines[index + 1])) {
        const cells = (value) => value.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
        const headers = cells(line);
        index += 2;
        const rows = [];
        while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(cells(lines[index++]));
        output.push(`<div class="qr-admin-table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, cellIndex) => `<td>${inlineMarkdown(row[cellIndex] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
        continue;
      }
      const task = line.match(/^-\s+\[([ xX])\]\s+(.+)$/);
      if (task) {
        const items = [];
        while (index < lines.length) {
          const item = lines[index].match(/^-\s+\[([ xX])\]\s+(.+)$/);
          if (!item) break;
          items.push(`<li><label><input type="checkbox" contenteditable="false" ${item[1].toLowerCase() === "x" ? "checked" : ""}><span>${inlineMarkdown(item[2])}</span></label></li>`);
          index += 1;
        }
        output.push(`<ul class="qr-admin-task-list">${items.join("")}</ul>`); continue;
      }
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
      case "s": case "strike": case "del": return `~~${content}~~`;
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
      case "ul": {
        if (node.classList.contains("qr-admin-task-list")) {
          return [...node.children].map((item) => {
            const checkbox = item.querySelector(':scope input[type="checkbox"]');
            const text = [...item.querySelectorAll(":scope > label > span")].map(markdownFromNode).join("").trim();
            return `- [${checkbox?.checked ? "x" : " "}] ${text}`;
          }).join("\n") + "\n\n";
        }
        return [...node.children].map((item) => `- ${markdownFromNode(item).trim()}`).join("\n") + "\n\n";
      }
      case "ol": return [...node.children].map((item, index) => `${index + 1}. ${markdownFromNode(item).trim()}`).join("\n") + "\n\n";
      case "pre": return `\`\`\`\n${node.textContent}\n\`\`\`\n\n`;
      case "hr": return "---\n\n";
      case "table": {
        const rows = [...node.querySelectorAll("tr")].map((row) => [...row.children].map((cell) => markdownFromNode(cell).replaceAll("|", "\\|").trim()));
        if (!rows.length) return "";
        return `| ${rows[0].join(" | ")} |\n| ${rows[0].map(() => "---").join(" | ")} |${rows.slice(1).map((row) => `\n| ${row.join(" | ")} |`).join("")}\n\n`;
      }
      case "th": case "td": return content;
      case "img": {
        const src = node.dataset.qrPublishedSrc || node.getAttribute("src") || "";
        const alt = node.getAttribute("alt") || "";
        const title = node.getAttribute("title") || "";
        return /^(https?:\/\/|\/img\/uploads\/)/.test(src) ? `![${alt}](${src}${title ? ` \"${title}\"` : ""})\n\n` : "";
      }
      default: return content;
    }
  }

  function editorMarkdown() {
    return richEditor?.getMarkdown().replace(/\n{3,}/g, "\n\n").trim() || "";
  }

  function command(commandName, value = null) {
    if (!richEditor) return;
    const chain = richEditor.chain().focus();
    if (commandName === "bold") chain.toggleBold().run();
    else if (commandName === "italic") chain.toggleItalic().run();
    else if (commandName === "strikeThrough") chain.toggleStrike().run();
    else if (commandName === "insertUnorderedList") chain.toggleBulletList().run();
    else if (commandName === "insertOrderedList") chain.toggleOrderedList().run();
    else if (commandName === "insertHorizontalRule") chain.setHorizontalRule().run();
    else if (commandName === "undo") chain.undo().run();
    else if (commandName === "redo") chain.redo().run();
    else if (commandName === "formatBlock" && value === "pre") chain.toggleCodeBlock().run();
    else if (commandName === "formatBlock" && value === "p") chain.setParagraph().run();
  }

  function insertChecklist() {
    richEditor?.chain().focus().toggleTaskList().run();
  }

  function insertTable() {
    richEditor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  function insertInlineImage(staged) {
    richEditor?.chain().focus().setImage({ src: staged.path, previewSrc: staged.previewUrl, alt: "" }).run();
  }

  function openMediaLibrary() {
    root.querySelector("[data-inline-image]").click();
  }

  function createRichEditor(markdown) {
    richEditor?.destroy();
    richEditor = new Editor({
      element: root.querySelector("[data-editor-body]"),
      content: markdown || "",
      contentType: "markdown",
      extensions: [
        StarterKit.configure({ heading: { levels: [2, 3] } }),
        Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
        QuartzImage,
        TaskList,
        TaskItem.configure({ nested: true }),
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
      Markdown,
      ],
      editorProps: {
        // Le contenu éditable est la seule partie qui reprend exactement les
        // styles de lecture publics. Le conteneur qui l'accueille reste neutre,
        // sinon les marges d'un article se retrouvent imbriquées deux fois.
        attributes: { class: "article-body qr-admin-editor-content" },
      },
      onUpdate: () => { updateEditorState(); updateToolbarState(); },
      onSelectionUpdate: updateToolbarState,
    });
  }

  function base64FromBytes(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    return btoa(binary);
  }

  async function inspectImage(file) {
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choisissez une image JPG, PNG ou WebP.");
    if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("Cette image dépasse la limite de 50 Mo.");
    const sourceBytes = new Uint8Array(await file.arrayBuffer());
    const sourceDigest = await crypto.subtle.digest("SHA-256", sourceBytes);
    const sourceSha256 = [...new Uint8Array(sourceDigest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const sourceUrl = URL.createObjectURL(file);
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("Impossible de lire cette image.")); image.src = sourceUrl; });
    const render = async (width, height, type, quality) => {
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(image, 0, 0, width, height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
      if (!blob) throw new Error("Impossible de préparer cette image.");
      return blob;
    };
    let outputType = file.type;
    let width = image.naturalWidth;
    let height = image.naturalHeight;
    let normalized = await render(width, height, outputType, outputType === "image/png" ? undefined : 0.96);
    let compressed = normalized.size < file.size;
    if (normalized.size > MAX_PUBLISHED_IMAGE_BYTES) {
      const scaleSteps = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.32, 0.25];
      const qualitySteps = outputType === "image/png" ? [undefined] : [0.96, 0.92, 0.88, 0.84, 0.8, 0.76];
      let done = false;
      for (const scale of scaleSteps) {
        const nextWidth = Math.max(1, Math.round(image.naturalWidth * scale));
        const nextHeight = Math.max(1, Math.round(image.naturalHeight * scale));
        for (const quality of qualitySteps) {
          const candidate = await render(nextWidth, nextHeight, outputType, quality);
          if (candidate.size <= MAX_PUBLISHED_IMAGE_BYTES) {
            normalized = candidate; width = nextWidth; height = nextHeight; compressed = true; done = true; break;
          }
        }
        if (done) break;
      }
      if (!done && outputType === "image/png") {
        outputType = "image/webp";
        for (const scale of scaleSteps) {
          const nextWidth = Math.max(1, Math.round(image.naturalWidth * scale));
          const nextHeight = Math.max(1, Math.round(image.naturalHeight * scale));
          for (const quality of [0.96, 0.92, 0.88, 0.84, 0.8, 0.76]) {
            const candidate = await render(nextWidth, nextHeight, outputType, quality);
            if (candidate.size <= MAX_PUBLISHED_IMAGE_BYTES) {
              normalized = candidate; width = nextWidth; height = nextHeight; compressed = true; done = true; break;
            }
          }
          if (done) break;
        }
      }
      if (!done) { URL.revokeObjectURL(sourceUrl); throw new Error("Impossible de réduire cette image sous 24 Mo."); }
    }
    URL.revokeObjectURL(sourceUrl);
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
    return { bytes, previewUrl, mimeType: outputType, compressed, meta: { sha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""), sourceSha256, width, height, bytes: normalized.size, dhash: hash } };
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

  async function loadMediaCatalogAtRef(ref = BRANCH) {
    const file = await request(`https://api.github.com/repos/${REPOSITORY}/contents/${MEDIA_CATALOG_PATH}?ref=${encodeURIComponent(ref)}`);
    const source = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ""))));
    const catalog = JSON.parse(source);
    if (!Array.isArray(catalog.images)) throw new Error("Le catalogue d’images est invalide.");
    return { ...catalog, sha: file.sha };
  }

  const loadMediaCatalog = () => loadMediaCatalogAtRef(BRANCH);

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
      dialog.innerHTML = `<div class="qr-admin-image-match__panel" role="dialog" aria-modal="true" aria-labelledby="qr-image-match-title"><p class="qr-admin-eyebrow">Image déjà disponible</p><h2 id="qr-image-match-title">Une image très proche existe déjà.</h2><div class="qr-admin-image-match__images"><figure><img src="${escapeHtml(adminImageUrl(existing.path, existing.sha256, 600))}" alt="Version déjà enregistrée"><figcaption>Déjà enregistrée<br>${existing.width} × ${existing.height}</figcaption></figure><figure><img src="${escapeHtml(staged.previewUrl)}" alt="Nouvelle image"><figcaption>Nouvelle image<br>${staged.meta.width} × ${staged.meta.height}</figcaption></figure></div><p>${newIsBetter ? "La nouvelle version est plus définie. Elle peut remplacer celle déjà enregistrée." : "La version déjà enregistrée est au moins aussi définie. Sa réutilisation évite un doublon."}</p><div class="qr-admin-image-match__actions"><button type="button" class="qr-admin-secondary" data-use-existing>Utiliser l’existante</button><button type="button" class="qr-admin-primary" data-use-new>${newIsBetter ? "Remplacer par la nouvelle" : "Conserver quand même la nouvelle"}</button></div></div>`;
      document.body.append(dialog);
      dialog.querySelector("[data-use-existing]").addEventListener("click", () => { dialog.remove(); resolve("existing"); });
      dialog.querySelector("[data-use-new]").addEventListener("click", () => { dialog.remove(); resolve("new"); });
    });
  }

  async function stageLocalDraftImage(file, staged) {
    const inspected = await inspectImage(file);
    const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" })[inspected.mimeType];
    const mediaId = `${crypto.randomUUID()}.${extension}`;
    const response = await fetch(`${DRAFT_MEDIA_API}/images/${mediaId}`, {
      method: "PUT", headers: { "Content-Type": inspected.mimeType }, body: inspected.bytes,
    });
    if (!response.ok) throw new Error("Impossible d’envoyer l’image du brouillon local.");
    staged.previewUrl = `${DRAFT_MEDIA_API}/images/${mediaId}`;
    staged.path = staged.previewUrl;
    staged.meta = inspected.meta;
    staged.isNew = false;
    staged.status = "ready";
    if (inspected.compressed) notice("Image compressée automatiquement pour rester sous 24 Mo.");
    return staged;
  }

  async function stageImage(file) {
    const staged = { id: `image-${Date.now()}-${Math.random().toString(36).slice(2)}`, fileName: file?.name || "", status: "uploading", isNew: true, replaceExisting: false };
    stagedImages.set(staged.id, staged); updatePublishState();
    try {
      if (isLocalLab) return await stageLocalDraftImage(file, staged);
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
      if (inspected.compressed) notice("Image compressée automatiquement pour rester sous 24 Mo.");
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
    const saveDraft = root.querySelector("[data-save-draft]");
    const status = root.querySelector("[data-editor-status]");
    if (!publish || !status) return;
    if (isLocalLab) {
      publish.disabled = true;
      const pending = pendingImageCount();
      if (saveDraft) saveDraft.disabled = pending > 0 || (!editorDirty && Boolean(currentArticle));
      status.textContent = pending ? "Image en cours d’envoi…" : (editorDirty ? "Modifications non enregistrées" : (currentArticle ? "Brouillon enregistré" : "Prêt à enregistrer"));
      return;
    }
    const pending = pendingImageCount();
    if (saveDraft) saveDraft.disabled = pending > 0 || (!editorDirty && Boolean(currentArticle));
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

  function updateToolbarState() {
    if (!richEditor) return;
    const states = [
      ['[data-command="bold"]', richEditor.isActive("bold")],
      ['[data-command="italic"]', richEditor.isActive("italic")],
      ['[data-command="strikeThrough"]', richEditor.isActive("strike")],
      ['[data-command="insertUnorderedList"]', richEditor.isActive("bulletList")],
      ['[data-command="insertOrderedList"]', richEditor.isActive("orderedList")],
      ['[data-checklist]', richEditor.isActive("taskList")],
      ['[data-block="blockquote"]', richEditor.isActive("blockquote")],
      ['[data-block="h2"]', richEditor.isActive("heading", { level: 2 })],
      ['[data-block="h3"]', richEditor.isActive("heading", { level: 3 })],
      ['[data-block="p"]', richEditor.isActive("paragraph")],
      ['[data-command="formatBlock"][data-value="pre"]', richEditor.isActive("codeBlock")],
    ];
    for (const [selector, active] of states) root.querySelector(selector)?.classList.toggle("is-active", active);
    root.querySelector('[data-command="undo"]')?.toggleAttribute("disabled", !richEditor.can().undo());
    root.querySelector('[data-command="redo"]')?.toggleAttribute("disabled", !richEditor.can().redo());
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
          const revision = image.dataset.adminRevision || "article";
          image.src = adminGithubImageUrl(image.dataset.adminImage, `${revision}-${attempts}`);
        }, 3000);
      });
    });
  }

  function articleCard(article) {
    const preview = transientImagePreviews.get(article.thumbnail);
    const image = article.thumbnail ? `<img src="${escapeHtml(preview || adminImageUrl(article.thumbnail, article.sha, 320))}"${preview ? "" : ` data-admin-image="${escapeHtml(article.thumbnail)}" data-admin-image-revision="${escapeHtml(article.sha)}" data-admin-image-width="320"`} alt="" loading="lazy">` : "<span class=\"qr-admin-card__placeholder\">Article</span>";
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

  function draftCard(draft) {
    const image = draft.thumbnail ? `<img src="${escapeHtml(draft.thumbnail)}" alt="" loading="lazy">` : "<span class=\"qr-admin-card__placeholder\">Brouillon</span>";
    return `<article class="qr-admin-card" data-edit-draft="${escapeHtml(draft.id)}"><div class="qr-admin-card__image">${image}</div><div class="qr-admin-card__content"><p class="qr-admin-card__meta">Brouillon · ${escapeHtml(friendlyDate(draft.updatedAt || draft.createdAt))}</p><h2>${escapeHtml(draft.title || "Sans titre")}</h2><p>${escapeHtml(draft.description || "Aucun résumé pour le moment.")}</p><p class="qr-admin-card__author">${escapeHtml(draft.category || "Autre")}</p></div><span class="qr-admin-card__action" aria-hidden="true">›</span></article>`;
  }

  function renderDashboard() {
    exitEditorFullscreen();
    root.innerHTML = `${renderHeader()}
      <section class="qr-admin-dashboard">
        ${isPreview ? '<p class="qr-admin-preview-banner">Version de test : les articles publiés ici restent dans la branche de test.</p>' : ""}
        <div class="qr-admin-dashboard__intro">
          <h1>Bienvenue, ${escapeHtml(profile.name)}</h1>
          <div class="qr-admin-dashboard__actions"><button class="qr-admin-secondary" type="button" data-drafts>Mes brouillons</button><button class="qr-admin-primary" type="button" data-new>Ajouter un article</button></div>
        </div>
        <label class="qr-admin-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Rechercher un article" data-search></label>
        <div class="qr-admin-article-list" data-list>${articles.map(articleCard).join("") || "<p class=\"qr-admin-empty\">Aucun article pour le moment.</p>"}</div>
      </section>`;
    root.querySelector("[data-new]").addEventListener("click", () => openEditor());
    root.querySelector("[data-drafts]").addEventListener("click", renderDrafts);
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

  function renderDrafts() {
    exitEditorFullscreen();
    setHistory("drafts");
    root.innerHTML = `${renderHeader()}<section class="qr-admin-dashboard"><div class="qr-admin-dashboard__intro"><h1>Mes brouillons</h1><button class="qr-admin-primary" type="button" data-new>Ajouter un article</button></div><p class="qr-admin-empty">Ces brouillons sont privés et ne sont pas publiés sur Quartz Report.</p><div class="qr-admin-article-list">${drafts.map(draftCard).join("") || "<p class=\"qr-admin-empty\">Aucun brouillon pour le moment.</p>"}</div></section>`;
    root.querySelector("[data-new]").addEventListener("click", () => openEditor());
    root.querySelectorAll("[data-edit-draft]").forEach((element) => element.addEventListener("click", () => openEditor(drafts.find((draft) => draft.id === element.dataset.editDraft))));
    bindAdminHeader();
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
    return `<div class="qr-admin-toolbar" role="toolbar" aria-label="Outils de mise en forme">
      <button type="button" data-command="undo" title="Annuler" aria-label="Annuler la dernière action"><span aria-hidden="true">↶</span><span class="qr-admin-toolbar__label">Annuler</span></button>
      <button type="button" data-command="redo" title="Rétablir" aria-label="Rétablir la dernière action"><span aria-hidden="true">↷</span><span class="qr-admin-toolbar__label">Rétablir</span></button>
      <button type="button" data-block="p" title="Texte normal" aria-label="Revenir au texte normal"><span aria-hidden="true">T</span><span class="qr-admin-toolbar__label">Normal</span></button>
      <span class="qr-admin-toolbar__separator" aria-hidden="true"></span>
      <button type="button" data-command="bold" title="Gras" aria-label="Mettre en gras"><b>B</b><span class="qr-admin-toolbar__label">Gras</span></button>
      <button type="button" data-command="italic" title="Italique" aria-label="Mettre en italique"><i>I</i><span class="qr-admin-toolbar__label">Italique</span></button>
      <button type="button" data-command="strikeThrough" title="Barré" aria-label="Barrer le texte"><s>S</s><span class="qr-admin-toolbar__label">Barré</span></button>
      <span class="qr-admin-toolbar__separator" aria-hidden="true"></span>
      <button type="button" data-block="h2" title="Intertitre" aria-label="Ajouter un intertitre"><strong>H</strong><span class="qr-admin-toolbar__label">Intertitre</span></button>
      <button type="button" data-block="h3" title="Sous-titre" aria-label="Ajouter un sous-titre"><strong>h</strong><span class="qr-admin-toolbar__label">Sous-titre</span></button>
      <span class="qr-admin-toolbar__separator" aria-hidden="true"></span>
      <button type="button" data-command="insertUnorderedList" title="Liste à puces" aria-label="Créer une liste à puces"><span aria-hidden="true">•≡</span><span class="qr-admin-toolbar__label">Liste</span></button>
      <button type="button" data-command="insertOrderedList" title="Liste numérotée" aria-label="Créer une liste numérotée"><span aria-hidden="true">1≡</span><span class="qr-admin-toolbar__label">Numéros</span></button>
      <button type="button" data-checklist title="Checklist" aria-label="Créer une checklist"><span aria-hidden="true">☑</span><span class="qr-admin-toolbar__label">Checklist</span></button>
      <span class="qr-admin-toolbar__separator" aria-hidden="true"></span>
      <button type="button" data-block="blockquote" title="Citation" aria-label="Ajouter une citation"><span aria-hidden="true">❝</span><span class="qr-admin-toolbar__label">Citation</span></button>
      <button type="button" data-link title="Lien" aria-label="Ajouter un lien"><span aria-hidden="true">↗</span><span class="qr-admin-toolbar__label">Lien</span></button>
      <button type="button" data-command="formatBlock" data-value="pre" title="Bloc de code" aria-label="Ajouter un bloc de code"><code>&lt;/&gt;</code><span class="qr-admin-toolbar__label">Code</span></button>
      <button type="button" data-table title="Tableau" aria-label="Ajouter un tableau"><span aria-hidden="true">▦</span><span class="qr-admin-toolbar__label">Tableau</span></button>
      <button type="button" data-divider title="Séparateur" aria-label="Ajouter un séparateur"><span aria-hidden="true">—</span><span class="qr-admin-toolbar__label">Séparateur</span></button>
      <button type="button" data-image title="Image" aria-label="Insérer une image"><span aria-hidden="true">▧</span><span class="qr-admin-toolbar__label">Image</span></button>
    </div>`;
  }

  function previewAuthorAvatar(article) {
    const githubId = article?.authorGithubId || profile?.githubId || "";
    if (githubId === profile?.githubId && profile?.hasPhoto) return profileAvatar();
    const avatarPath = publicProfiles[githubId]?.avatarUrl;
    return avatarPath ? `${API}${avatarPath}` : "";
  }

  async function loadPublicPreviewHeader() {
    const target = root.querySelector("[data-public-preview-header]");
    if (!target) return;
    try {
      // On reprend le vrai en-tête rendu par la page d'accueil : aucune copie
      // de son HTML ou de son CSS dans l'administration.
      const response = await fetch("/", { cache: "no-store" });
      if (!response.ok) throw new Error("Accueil indisponible");
      const page = new DOMParser().parseFromString(await response.text(), "text/html");
      const header = page.querySelector(".site-header");
      if (!header) throw new Error("En-tête introuvable");
      target.replaceChildren(header);
      target.querySelectorAll("a, button").forEach((element) => element.addEventListener("click", (event) => event.preventDefault()));
    } catch {
      target.hidden = true;
    }
  }

  function editorTemplate(article) {
    const current = article || { title: "", description: "", category: "Autre", date: new Date().toISOString(), thumbnail: "", important: false, body: "" };
    const publishedArticle = Boolean(article && !isDraft(article));
    const publishLabel = publishedArticle ? "Publier les modifications" : "Publier l’article";
    const displayAuthor = article?.authorDisplayName || article?.author || profile.name;
    const publicationDate = article?.date || new Date().toISOString();
    const authorGithubId = article?.authorGithubId || profile.githubId || "";
    const authorAvatar = previewAuthorAvatar(article);
    return `${renderHeader()}
      <section class="qr-admin-editor">
        <div class="qr-admin-editor__topbar"><button class="qr-admin-back" type="button" data-back>‹ <span>Retour</span></button><div class="qr-admin-editor__actions"><button class="qr-admin-secondary" type="button" data-save-draft disabled>Enregistrer dans mes brouillons</button><button class="qr-admin-primary" type="button" data-publish disabled>${publishLabel}</button></div></div>
        <form class="qr-admin-form" data-article-form>
          <section class="qr-admin-article-composer" data-composer>
            <button class="qr-admin-composer-toggle" type="button" data-fullscreen aria-label="Passer l’éditeur en plein écran" title="Plein écran">⛶</button>
            <div class="qr-admin-public-preview-header" data-public-preview-header></div>
            <main class="articles qr-admin-article-stage">
              <article class="article-full">
                <label class="qr-admin-composer-cover" title="Changer l’image de couverture">
                  <input name="cover" type="file" accept="image/jpeg,image/png,image/webp">
                  <span class="article-cover qr-admin-cover-preview" data-cover-preview>${current.thumbnail ? (() => { const preview = transientImagePreviews.get(current.thumbnail); return `<img src="${escapeHtml(preview || adminImageUrl(current.thumbnail, article?.sha, 1200))}"${preview ? "" : ` data-admin-image="${escapeHtml(current.thumbnail)}" data-admin-image-revision="${escapeHtml(article?.sha || "article")}" data-admin-image-width="1200"`} alt="">`; })() : '<span class="qr-admin-composer-cover__empty">Ajouter une image de couverture</span>'}</span>
                  <span class="qr-admin-composer-cover__hint">Changer la couverture</span>
                </label>
                <header class="article-header qr-admin-composer-header">
                  <input class="qr-admin-article-title" name="title" maxlength="160" required value="${escapeHtml(current.title)}" placeholder="Le titre de votre article" aria-label="Titre de l’article">
                  <p class="article-meta">Par ${escapeHtml(displayAuthor)}, le ${escapeHtml(new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(publicationDate)))}</p>
                </header>
                <section class="qr-admin-editor-surface" data-editor-body></section>
                <footer class="article-contributor" data-preview-contributor ${authorGithubId ? "" : "hidden"}>
                  <img ${authorAvatar ? `src="${escapeHtml(authorAvatar)}"` : "hidden"} alt="">
                  <p>Par <strong>${escapeHtml(displayAuthor)}</strong></p>
                </footer>
              </article>
            </main>
            ${editorToolbar()}
          </section>
          <details class="qr-admin-publishing-options">
            <summary>Réglages de publication</summary>
            <div class="qr-admin-publishing-options__fields">
              <label>Résumé <small>Il apparaît sur la page d’accueil et dans les aperçus partagés.</small><textarea name="description" maxlength="300" required placeholder="Expliquez brièvement le sujet de l’article.">${escapeHtml(current.description)}</textarea></label>
              <div class="qr-admin-field-row"><label>Catégorie <select name="category">${CATEGORIES.map((category) => `<option ${category === current.category ? "selected" : ""}>${category}</option>`).join("")}</select></label><label class="qr-admin-feature-toggle"><input name="important" type="checkbox" ${current.important ? "checked" : ""}><span><strong>Mettre en avant</strong><small>Affiche l’article dans la sélection principale de l’accueil.</small></span></label></div>
            </div>
          </details>
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-inline-image>
          <p class="qr-admin-editor-status" data-editor-status>Prêt à publier</p>
        </form>
        ${publishedArticle ? '<button class="qr-admin-delete" type="button" data-delete>Supprimer cet article</button>' : (isDraft(article) ? '<button class="qr-admin-delete" type="button" data-delete-draft>Supprimer ce brouillon</button>' : "")}
      </section>`;
  }

  function openEditor(article = null, { push = true } = {}) {
    exitEditorFullscreen();
    if (push) setHistory("editor", { path: article?.path || null, draftId: isDraft(article) ? article.id : null });
    richEditor?.destroy();
    richEditor = null;
    currentArticle = article;
    pendingCover = null;
    stagedImages = new Map();
    savedInlineRange = null;
    coverSelection = 0;
    editorDirty = false;
    root.innerHTML = editorTemplate(article);
    createRichEditor(article?.body || "");
    loadPublicPreviewHeader();
    bindAdminHeader();
    bindAdminImages();
    root.querySelector("[data-back]").addEventListener("click", () => {
      if (editorDirty && !window.confirm("Quitter sans enregistrer vos modifications ?")) return;
      goBackToDashboard();
    });
    root.querySelector("[data-article-form]").addEventListener("input", updateEditorState);
    root.querySelector("[data-article-form]").addEventListener("change", updateEditorState);
    root.querySelectorAll(".qr-admin-toolbar button").forEach((button) => button.addEventListener("mousedown", (event) => event.preventDefault()));
    root.querySelectorAll("[data-command]").forEach((button) => button.addEventListener("click", () => command(button.dataset.command, button.dataset.value || null)));
    root.querySelectorAll("[data-block]").forEach((button) => button.addEventListener("click", () => {
      const block = button.dataset.block;
      if (block === "p") command("formatBlock", "p");
      else if (block === "blockquote") richEditor?.chain().focus().toggleBlockquote().run();
      else richEditor?.chain().focus().toggleHeading({ level: Number(block.slice(1)) }).run();
    }));
    root.querySelector("[data-divider]").addEventListener("click", () => command("insertHorizontalRule"));
    root.querySelector("[data-checklist]").addEventListener("click", insertChecklist);
    root.querySelector("[data-table]").addEventListener("click", insertTable);
    root.querySelector("[data-link]").addEventListener("click", () => {
      const href = window.prompt("Adresse du lien (https://…)");
      if (href && /^https?:\/\//i.test(href)) richEditor?.chain().focus().setLink({ href }).run();
      else if (href) notice("Le lien doit commencer par https://", "error");
    });
    root.querySelector("[data-image]").addEventListener("click", openMediaLibrary);
    root.querySelector("[data-inline-image]").addEventListener("change", async (event) => {
      const file = event.target.files[0]; if (!file) return;
      try {
        const staged = await stageImage(file);
        insertInlineImage(staged);
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
    root.querySelector("[data-fullscreen]").addEventListener("click", () => {
      const composer = root.querySelector("[data-composer]");
      const isFullscreen = composer.classList.toggle("is-fullscreen");
      document.body.classList.toggle("qr-admin-composer-fullscreen", isFullscreen);
      if (isFullscreen) history.pushState({ ...(history.state || {}), quartzAdmin: true, fullscreen: true }, "", window.location.href);
      const button = root.querySelector("[data-fullscreen]");
      button.textContent = isFullscreen ? "×" : "⛶";
      button.title = isFullscreen ? "Quitter le plein écran" : "Plein écran";
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-pressed", String(isFullscreen));
    });
    root.querySelector("[data-publish]").addEventListener("click", publishArticle);
    root.querySelector("[data-save-draft]").addEventListener("click", saveDraft);
    root.querySelector("[data-delete]")?.addEventListener("click", deleteArticle);
    root.querySelector("[data-delete-draft]")?.addEventListener("click", deleteDraft);
    updateToolbarState();
  }

  function openArticlePreview() {
    const form = root.querySelector("[data-article-form]");
    const cover = pendingCover?.previewUrl || currentArticle?.thumbnail;
    const modal = document.createElement("section");
    modal.className = "qr-admin-preview";
    const publicationDate = currentArticle?.date || new Date().toISOString();
    const displayAuthor = currentArticle?.authorDisplayName || currentArticle?.author || profile.name;
    modal.innerHTML = `<div class="qr-admin-preview__bar"><strong>Aperçu de l’article</strong><button type="button" data-close-preview>Fermer</button></div><main class="articles"><article class="article-full">${cover ? `<div class="article-cover"><img src="${escapeHtml(cover)}" alt=""></div>` : ""}<header class="article-header"><h1>${escapeHtml(form.elements.title.value || "Sans titre")}</h1><p class="article-meta">Par ${escapeHtml(displayAuthor)}, le ${escapeHtml(friendlyDate(publicationDate))}</p></header><section class="article-body">${richEditor?.getHTML() || ""}</section></article></main>`;
    document.body.append(modal);
    modal.querySelector("[data-close-preview]").addEventListener("click", () => modal.remove());
  }

  function textToBase64(value) { return btoa(unescape(encodeURIComponent(value))); }

  async function createGitBlob(content) {
    const blob = await request(`https://api.github.com/repos/${REPOSITORY}/git/blobs`, { method: "POST", body: JSON.stringify({ content: textToBase64(content), encoding: "base64" }) });
    return blob.sha;
  }

  async function loadArticleSources(ref) {
    const listing = await request(`https://api.github.com/repos/${REPOSITORY}/contents/articles?ref=${encodeURIComponent(ref)}`);
    return Promise.all(listing
      .filter((entry) => entry.type === "file" && entry.name.endsWith(".md"))
      .map(async (entry) => {
        const file = await request(`https://api.github.com/repos/${REPOSITORY}/contents/${encodeURIComponent(entry.path).replaceAll("%2F", "/")}?ref=${encodeURIComponent(ref)}`);
        return { path: entry.path, source: decodeURIComponent(escape(atob(file.content.replace(/\n/g, "")))) };
      }));
  }

  async function commitArticleWithCleanup({ path, source = "", title, previousSource, deleting = false }) {
    const currentRef = await request(`https://api.github.com/repos/${REPOSITORY}/git/ref/heads/${encodeURIComponent(BRANCH)}`);
    const ref = currentRef.object.sha;
    const [parent, catalog, articleSources] = await Promise.all([
      request(`https://api.github.com/repos/${REPOSITORY}/git/commits/${ref}`),
      loadMediaCatalogAtRef(ref),
      loadArticleSources(ref),
    ]);
    const nextSources = articleSources.filter((article) => article.path !== path).map((article) => article.source);
    if (!deleting) nextSources.push(source);
    const referenced = new Set(nextSources.flatMap((articleSource) => [...uploadPathsInSource(articleSource)]));
    const unusedPaths = [...uploadPathsInSource(previousSource)].filter((imagePath) => !referenced.has(imagePath));
    const stagedByPath = new Map([...stagedImages.values()]
      .filter((image) => !deleting && image.status === "ready" && image.isNew && image.blobSha && referenced.has(image.path))
      .map((image) => [image.path, image]));
    const nextImages = catalog.images.filter((image) => !unusedPaths.includes(image.path));
    for (const staged of stagedByPath.values()) {
      const entry = { path: staged.path, ...staged.meta };
      const existingIndex = nextImages.findIndex((image) => image.path === staged.path);
      if (existingIndex >= 0) nextImages.splice(existingIndex, 1, entry);
      else nextImages.push(entry);
    }
    const treeEntries = [];

    if (deleting) {
      treeEntries.push({ path, mode: "100644", type: "blob", sha: null });
    } else {
      treeEntries.push({ path, mode: "100644", type: "blob", sha: await createGitBlob(source) });
    }
    for (const staged of stagedByPath.values()) treeEntries.push({ path: `public${staged.path}`, mode: "100644", type: "blob", sha: staged.blobSha });
    for (const imagePath of unusedPaths) treeEntries.push({ path: `public${imagePath}`, mode: "100644", type: "blob", sha: null });
    if (nextImages.length !== catalog.images.length || stagedByPath.size) {
      treeEntries.push({ path: MEDIA_CATALOG_PATH, mode: "100644", type: "blob", sha: await createGitBlob(`${JSON.stringify({ version: 1, images: nextImages }, null, 2)}\n`) });
    }

    const tree = await request(`https://api.github.com/repos/${REPOSITORY}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: parent.tree.sha, tree: treeEntries }) });
    const message = deleting ? `Supprimer l’article « ${title} »` : `${currentArticle ? "Mettre à jour" : "Créer"} l’article « ${title} »`;
    const commit = await request(`https://api.github.com/repos/${REPOSITORY}/git/commits`, { method: "POST", body: JSON.stringify({ message, tree: tree.sha, parents: [ref] }) });
    await request(`https://api.github.com/repos/${REPOSITORY}/git/refs/heads/${encodeURIComponent(BRANCH)}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
    return unusedPaths.length;
  }

  function draftMediaUrls(draft) {
    const source = `${draft?.thumbnail || ""}\n${draft?.body || ""}`;
    const escaped = DRAFT_MEDIA_API.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return [...new Set((source.match(new RegExp(`${escaped}/images/[a-zA-Z0-9_-]+\\.(?:jpg|jpeg|png|webp)`, "g")) || []))];
  }

  async function deleteLocalDraftMedia(urls) {
    await Promise.all(urls.map((url) => fetch(url, { method: "DELETE" }).catch(() => null)));
  }

  async function ensureDraftMediaBranch() {
    try {
      return await request(`https://api.github.com/repos/${REPOSITORY}/git/ref/heads/${DRAFT_MEDIA_BRANCH}`);
    } catch (error) {
      if (!/404/.test(error.message)) throw error;
      const main = await request(`https://api.github.com/repos/${REPOSITORY}/git/ref/heads/main`);
      await request(`https://api.github.com/repos/${REPOSITORY}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${DRAFT_MEDIA_BRANCH}`, sha: main.object.sha }) });
      return request(`https://api.github.com/repos/${REPOSITORY}/git/ref/heads/${DRAFT_MEDIA_BRANCH}`);
    }
  }

  async function uploadDraftImages(draftId) {
    if (isLocalLab) return new Map();
    const fresh = [...stagedImages.values()].filter((image) => image.status === "ready" && image.isNew && image.blobSha);
    if (!fresh.length) return new Map();
    const draftRef = await ensureDraftMediaBranch();
    const parent = await request(`https://api.github.com/repos/${REPOSITORY}/git/commits/${draftRef.object.sha}`);
    const entries = fresh.map((image, index) => {
      const extension = image.path.split(".").pop() || "jpg";
      const file = `${Date.now()}-${index}-${slugify(image.fileName.replace(/\.[^.]+$/, ""))}.${extension}`;
      image.draftPath = `drafts/${profile.githubId}/${draftId}/${file}`;
      return { path: image.draftPath, mode: "100644", type: "blob", sha: image.blobSha };
    });
    const tree = await request(`https://api.github.com/repos/${REPOSITORY}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: parent.tree.sha, tree: entries }) });
    const commit = await request(`https://api.github.com/repos/${REPOSITORY}/git/commits`, { method: "POST", body: JSON.stringify({ message: `Enregistrer les images du brouillon`, tree: tree.sha, parents: [draftRef.object.sha] }) });
    await request(`https://api.github.com/repos/${REPOSITORY}/git/refs/heads/${DRAFT_MEDIA_BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
    const replacements = new Map();
    for (const image of fresh) {
      const previous = image.path;
      const next = `https://raw.githubusercontent.com/${REPOSITORY}/${DRAFT_MEDIA_BRANCH}/${image.draftPath}`;
      image.path = next; image.previewUrl = next; image.isNew = false;
      replacements.set(previous, next);
    }
    return replacements;
  }

  async function saveDraft() {
    if (pendingImageCount()) return;
    const form = root.querySelector("[data-article-form]");
    const button = root.querySelector("[data-save-draft]");
    const id = isDraft(currentArticle) ? currentArticle.id : newDraftId();
    button.disabled = true; button.textContent = "Enregistrement…";
    try {
      const replacements = await uploadDraftImages(id);
      let body = editorMarkdown();
      for (const [previous, nextPath] of replacements) body = body.replaceAll(previous, nextPath);
      const next = {
        id,
        title: form.elements.title.value.trim(),
        description: form.elements.description.value.trim(),
        category: form.elements.category.value,
        important: form.elements.important.checked,
        body,
        thumbnail: pendingCover?.path || currentArticle?.thumbnail || "",
      };
      const result = await draftRequest(`/api/drafts/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(next) });
      const saved = { ...result.draft, isDraft: true, author: profile.name, authorDisplayName: profile.name, authorGithubId: profile.githubId, date: result.draft.createdAt || new Date().toISOString() };
      const index = drafts.findIndex((draft) => draft.id === id);
      if (index >= 0) drafts[index] = saved; else drafts.unshift(saved);
      currentArticle = saved;
      pendingCover = null;
      editorDirty = false;
      setHistory("editor", { draftId: id }, true);
      notice("Brouillon enregistré. Il est disponible sur vos autres appareils locaux.");
    } catch (error) {
      notice(error.message || "Impossible d’enregistrer le brouillon.", "error");
    } finally {
      button.textContent = "Enregistrer dans mes brouillons";
      updatePublishState();
    }
  }

  async function deleteDraft() {
    if (!isDraft(currentArticle) || !window.confirm("Supprimer définitivement ce brouillon ?")) return;
    const draft = currentArticle;
    try {
      await draftRequest(`/api/drafts/${encodeURIComponent(draft.id)}`, { method: "DELETE" });
      await deleteLocalDraftMedia(draftMediaUrls(draft));
      drafts = drafts.filter((item) => item.id !== draft.id);
      currentArticle = null;
      renderDrafts();
      notice("Brouillon supprimé.");
    } catch (error) {
      notice(error.message || "Impossible de supprimer le brouillon.", "error");
    }
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
      for (const image of stagedImages.values()) {
        if (image.status === "ready" && image.isNew && image.previewUrl) transientImagePreviews.set(image.path, image.previewUrl);
      }
      const removedImageCount = await commitArticleWithCleanup({ path, source, title, previousSource: currentArticle?.source || "" });
      notice(`Article publié${removedImageCount ? ` ; ${removedImageCount} image${removedImageCount > 1 ? "s" : ""} inutilisée${removedImageCount > 1 ? "s" : ""} supprimée${removedImageCount > 1 ? "s" : ""}.` : "."} Il sera visible sur Quartz Report dans environ une minute.`);
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
      const removedImageCount = await commitArticleWithCleanup({ path: deletedArticle.path, title: deletedArticle.title, previousSource: deletedArticle.source, deleting: true });
      notice(`Article supprimé${removedImageCount ? ` ; ${removedImageCount} image${removedImageCount > 1 ? "s" : ""} inutilisée${removedImageCount > 1 ? "s" : ""} supprimée${removedImageCount > 1 ? "s" : ""}.` : "."} La mise à jour sera visible dans environ une minute.`);
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
    exitEditorFullscreen();
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
      await Promise.all([loadArticles(), loadDrafts()]);
      if (!history.state?.quartzAdmin) setHistory("dashboard", {}, true);
      const state = history.state;
      if (state.view === "profile") openProfile(Boolean(state.required), { push: false });
      else if (state.view === "drafts") renderDrafts();
      else if (state.view === "editor") openEditor(state.draftId ? drafts.find((draft) => draft.id === state.draftId) || null : articles.find((article) => article.path === state.path) || null, { push: false });
      else renderDashboard();
    } catch (error) {
      if (/Connexion GitHub requise|401/.test(error.message)) { logout(); return; }
      renderLogin(error.message);
    }
  }

  boot();
})();
