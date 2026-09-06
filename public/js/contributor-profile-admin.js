(() => {
  const API = "https://quartzreport-oauth.claytonelhorga.workers.dev";
  const USER_STORAGE_KEY = "decap-cms-user";
  let profile = null;
  let editor = null;
  let initialized = false;

  function getToken() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(USER_STORAGE_KEY) || "null");
      return typeof saved?.token === "string" ? saved.token : null;
    } catch {
      return null;
    }
  }

  function registerContributorIdWidget() {
    if (!window.CMS?.registerWidget || !window.createClass || !window.h) return;
    const ContributorId = window.createClass({
      componentDidMount() {
        if (this.props.value) return;
        api("/api/profile/me").then(({ profile: ownProfile }) => {
          if (ownProfile?.githubId) this.props.onChange(ownProfile.githubId);
        }).catch(() => {});
      },
      render() {
        return window.h("span", { style: { display: "none" }, "aria-hidden": "true" });
      },
    });
    const ContributorName = window.createClass({
      componentDidMount() {
        if (this.props.value) return;
        api("/api/profile/me").then(({ profile: ownProfile }) => {
          if (ownProfile?.name) this.props.onChange(ownProfile.name);
        }).catch(() => {});
      },
      render() {
        return window.h("span", { style: { display: "none" }, "aria-hidden": "true" });
      },
    });
    window.CMS.registerWidget("contributor-id", ContributorId);
    window.CMS.registerWidget("contributor-name", ContributorName);
  }

  async function api(path, options = {}) {
    const token = getToken();
    if (!token) throw new Error("Connexion GitHub introuvable. Recharge la page puis reconnecte-toi.");
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Impossible de charger le profil.");
    return data;
  }

  function addStyles() {
    if (document.getElementById("quartz-profile-styles")) return;
    const style = document.createElement("style");
    style.id = "quartz-profile-styles";
    style.textContent = `
      .qr-profile-backdrop{position:fixed;z-index:10000;inset:0;background:rgba(10,10,12,.68);display:grid;place-items:center;padding:20px;font-family:system-ui,sans-serif}
      .qr-profile-panel{width:min(560px,100%);max-height:calc(100vh - 40px);overflow:auto;background:#fff;color:#18181b;border-radius:18px;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.35)}
      .qr-profile-panel h1{font-size:24px;margin:0 0 8px}.qr-profile-panel p{line-height:1.5;color:#555}.qr-profile-grid{display:grid;gap:16px}.qr-profile-panel label{display:grid;gap:6px;font-weight:650}.qr-profile-panel input{box-sizing:border-box;width:100%;padding:10px 12px;border:1px solid #b8b8bf;border-radius:8px;font:inherit}.qr-profile-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:22px}.qr-profile-button{border:0;border-radius:8px;padding:10px 14px;font:inherit;font-weight:700;cursor:pointer;background:#18181b;color:#fff}.qr-profile-button--secondary{background:#eee;color:#18181b}.qr-profile-error{color:#b42318;font-weight:600;min-height:1.4em}.qr-profile-avatar-preview{width:72px;height:72px;border-radius:50%;object-fit:cover;background:#eee;border:1px solid #ddd}.qr-profile-links{display:grid;gap:8px}.qr-profile-menu{position:fixed;z-index:10001;min-width:180px;padding:6px;background:#fff;border:1px solid #ddd;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.2)}.qr-profile-menu button{display:block;width:100%;padding:10px;text-align:left;border:0;background:transparent;font:inherit;cursor:pointer}.qr-profile-menu button:hover{background:#f2f2f2}
    `;
    document.head.append(style);
  }

  function closeEditor() {
    editor?.remove();
    editor = null;
  }

  async function compressPhoto(file) {
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choisis une image JPG, PNG ou WebP.");
    if (file.size > 8 * 1024 * 1024) throw new Error("La photo est trop lourde (8 Mo maximum avant compression).");
    let source;
    let objectUrl;
    if ("createImageBitmap" in window) {
      source = await createImageBitmap(file);
    } else {
      objectUrl = URL.createObjectURL(file);
      source = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Impossible de lire cette photo."));
        image.src = objectUrl;
      });
    }
    const side = Math.min(256, source.width, source.height);
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext("2d");
    const scale = Math.max(side / source.width, side / source.height);
    const width = source.width * scale;
    const height = source.height * scale;
    context.drawImage(source, (side - width) / 2, (side - height) / 2, width, height);
    source.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    const [, base64] = dataUrl.split(",");
    return { type: "image/jpeg", base64, preview: dataUrl };
  }

  function openProfile(required) {
    addStyles();
    closeEditor();
    let pendingPhoto = null;
    let removePhoto = false;
    const backdrop = document.createElement("div");
    backdrop.className = "qr-profile-backdrop";
    const panel = document.createElement("section");
    panel.className = "qr-profile-panel";
    panel.innerHTML = `
      <h1>${required ? "Crée ton profil contributeur" : "Mon profil"}</h1>
      <p>${required ? "Ton nom public est nécessaire avant de pouvoir rédiger ou publier un article." : "Tes coordonnées restent privées. Seuls ton nom et ta photo éventuelle sont visibles sur le site."}</p>
      <form class="qr-profile-grid">
        <label>Nom public <input name="name" maxlength="80" required></label>
        <label>Photo de profil <input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>
        <img class="qr-profile-avatar-preview" alt="Aperçu de la photo de profil" hidden>
        <button class="qr-profile-button qr-profile-button--secondary" type="button" data-remove-photo hidden>Retirer la photo</button>
        <label>E-mail <input name="email" type="email" maxlength="254"></label>
        <label>Téléphone <input name="phone" maxlength="40"></label>
        <div><strong>Liens personnels ou réseaux</strong><div class="qr-profile-links"></div></div>
        <div class="qr-profile-error" role="alert"></div>
        <div class="qr-profile-actions">
          ${required ? '<button class="qr-profile-button qr-profile-button--secondary" type="button" data-logout>Se déconnecter</button>' : '<button class="qr-profile-button qr-profile-button--secondary" type="button" data-close>Annuler</button>'}
          <button class="qr-profile-button" type="submit">Enregistrer</button>
        </div>
      </form>`;
    backdrop.append(panel);
    document.body.append(backdrop);
    editor = backdrop;

    const form = panel.querySelector("form");
    const name = form.elements.name;
    const email = form.elements.email;
    const phone = form.elements.phone;
    const file = form.elements.photo;
    const preview = panel.querySelector(".qr-profile-avatar-preview");
    const removeButton = panel.querySelector("[data-remove-photo]");
    const links = panel.querySelector(".qr-profile-links");
    const error = panel.querySelector(".qr-profile-error");
    name.value = profile?.name || "";
    email.value = profile?.email || "";
    phone.value = profile?.phone || "";
    for (let index = 0; index < 4; index += 1) {
      const input = document.createElement("input");
      input.type = "url";
      input.name = `link-${index}`;
      input.placeholder = "https://…";
      input.maxLength = 2048;
      input.value = profile?.links?.[index] || "";
      links.append(input);
    }
    if (profile?.hasPhoto) {
      preview.src = `${API}/api/profile/avatar/${encodeURIComponent(profile.githubId)}?v=${Date.now()}`;
      preview.hidden = false;
      removeButton.hidden = false;
    }
    file.addEventListener("change", async () => {
      try {
        pendingPhoto = await compressPhoto(file.files[0]);
        removePhoto = false;
        preview.src = pendingPhoto.preview;
        preview.hidden = false;
        removeButton.hidden = false;
        error.textContent = "";
      } catch (cause) {
        file.value = "";
        error.textContent = cause.message;
      }
    });
    removeButton.addEventListener("click", () => {
      pendingPhoto = null;
      removePhoto = true;
      preview.hidden = true;
      removeButton.hidden = true;
      file.value = "";
    });
    panel.querySelector("[data-close]")?.addEventListener("click", closeEditor);
    panel.querySelector("[data-logout]")?.addEventListener("click", logout);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      const submit = form.querySelector("[type=submit]");
      submit.disabled = true;
      try {
        const data = await api("/api/profile/me", {
          method: "PUT",
          body: JSON.stringify({
            name: name.value,
            email: email.value,
            phone: phone.value,
            links: [...links.querySelectorAll("input")].map((input) => input.value),
            ...(pendingPhoto ? { photo: { type: pendingPhoto.type, base64: pendingPhoto.base64 } } : {}),
            removePhoto,
          }),
        });
        profile = data.profile;
        closeEditor();
        enhanceProfileButton();
      } catch (cause) {
        error.textContent = cause.message;
      } finally {
        submit.disabled = false;
      }
    });
  }

  function logout() {
    window.localStorage.removeItem("decap-cms-user");
    window.sessionStorage.removeItem("decap-cms-auth");
    window.location.reload();
  }

  function openMenu(button) {
    document.querySelector(".qr-profile-menu")?.remove();
    const menu = document.createElement("div");
    menu.className = "qr-profile-menu";
    const rect = button.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    const profileButton = document.createElement("button");
    profileButton.type = "button";
    profileButton.textContent = "Mon profil";
    profileButton.addEventListener("click", () => { menu.remove(); openProfile(false); });
    const logoutButton = document.createElement("button");
    logoutButton.type = "button";
    logoutButton.textContent = "Se déconnecter";
    logoutButton.addEventListener("click", logout);
    menu.append(profileButton, logoutButton);
    document.body.append(menu);
  }

  function enhanceProfileButton() {
    const candidates = [...document.querySelectorAll('button, [role="button"], [aria-label]')];
    const button = candidates.find((candidate) => /account options|options du compte|logout|log out|déconnexion|se déconnecter/i.test(`${candidate.getAttribute("aria-label") || ""} ${candidate.title || ""} ${candidate.textContent || ""}`));
    if (!button || button.dataset.quartzProfileButton === "ready") return;
    button.dataset.quartzProfileButton = "ready";
    button.title = "Mon profil";
    if (profile?.hasPhoto) {
      button.style.backgroundImage = `url("${API}/api/profile/avatar/${encodeURIComponent(profile.githubId)}?v=${Date.now()}")`;
      button.style.backgroundPosition = "center";
      button.style.backgroundSize = "cover";
      button.querySelector("svg")?.style.setProperty("display", "none");
    }
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMenu(button);
    });
  }

  async function initialize() {
    if (initialized) return;
    const token = getToken();
    if (!token) return;
    initialized = true;
    try {
      profile = (await api("/api/profile/me")).profile;
      if (!profile) openProfile(true);
      else enhanceProfileButton();
    } catch (error) {
      initialized = false;
      console.warn("QuartzReport profile unavailable", error);
    }
  }

  addStyles();
  registerContributorIdWidget();
  const observer = new MutationObserver(() => profile && enhanceProfileButton());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setInterval(initialize, 800);
})();
