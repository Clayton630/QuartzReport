(() => {
  const API = "https://quartzreport-oauth.claytonelhorga.workers.dev";
  const elements = [...document.querySelectorAll("[data-contributor-id]")];
  const ids = [...new Set(elements.map((element) => element.dataset.contributorId).filter((id) => /^\d{1,20}$/.test(id)))];
  if (ids.length === 0) return;

  fetch(`${API}/api/profiles?ids=${encodeURIComponent(ids.join(","))}`)
    .then((response) => response.ok ? response.json() : Promise.reject(new Error("Profiles unavailable")))
    .then(({ profiles }) => {
      for (const element of elements) {
        const profile = profiles[element.dataset.contributorId];
        if (!profile) continue;
        if (element.hasAttribute("data-contributor-name")) element.textContent = profile.name;
        if (element.hasAttribute("data-contributor-card")) {
          const name = element.querySelector("[data-contributor-name]");
          if (name) name.textContent = profile.name;
          const avatar = element.querySelector("[data-contributor-avatar]");
          if (avatar && profile.avatarUrl) {
            avatar.src = `${API}${profile.avatarUrl}`;
            avatar.alt = "Photo de profil de " + profile.name;
            avatar.hidden = false;
          }
        }
      }
    })
    .catch(() => {
      // The original byline remains visible if the profile service is unavailable.
    });
})();
