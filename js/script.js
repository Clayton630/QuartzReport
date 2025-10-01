async function loadArticles() {
  const container = document.getElementById("articles");
  const hottestContainer = document.getElementById("hottest");
  const categoriesContainer = document.getElementById("categories");

  const repo = "Clayton630/QuartzReport";
  const branch = "main";

  try {
    const resp = await fetch(`https://api.github.com/repos/${repo}/contents/articles?ref=${branch}`);
    if (!resp.ok) {
      container.innerHTML = "<p>Impossible de charger les articles.</p>";
      return;
    }

    const files = await resp.json();
    const articles = [];

    for (let file of files) {
      if (!file.name.endsWith(".md")) continue;

      const raw = await fetch(file.download_url);
      const text = await raw.text();

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

      articles.push({
        title: meta.title || "Sans titre",
        date: meta.date || "",
        author: meta.author || "",
        description: meta.description || "",
        thumbnail: meta.thumbnail || "img/article-placeholder.jpg",
        category: meta.category || "Autre",
        important: meta.important === "true" || meta.important === true,
        file: file.download_url,
        body: body
      });
    }

    // Trier par date décroissante
    articles.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Générer catégories (nav)
    const uniqueCategories = [...new Set(articles.map(a => a.category))];
    categoriesContainer.innerHTML = uniqueCategories
      .map(cat => `<li><a href="#" data-category="${cat}">${cat}</a></li>`)
      .join("");

    // Hottest
    hottestContainer.innerHTML = "";
    const hottestArticles = articles.filter(a => a.important).slice(0, 3);
    hottestArticles.forEach(article => {
      const link = document.createElement("a");
      link.href = article.file;
      link.target = "_blank";
      link.className = "card";
      link.innerHTML = `
        <img src="${article.thumbnail}" alt="">
        <div class="card-content">
          <h3>${article.title}</h3>
        </div>
      `;
      hottestContainer.appendChild(link);
    });

    // ✅ Format "Le JJ/MM/AAAA à HH:MM" (Europe/Paris)
    function formatDateTime(dateStr) {
      const d = new Date(dateStr);
      if (isNaN(d)) return dateStr;

      const dateOptions = { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" };
      const timeOptions = { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Paris" };

      const date = d.toLocaleDateString("fr-FR", dateOptions);
      const time = d.toLocaleTimeString("fr-FR", timeOptions);

      return `Le ${date} à ${time}`;
    }

    // Rendu des articles (feed complet)
    function renderArticles(list) {
      container.innerHTML = "";
      list.forEach(article => {
        const formattedDate = formatDateTime(article.date);
        const el = document.createElement("article");
        el.className = "article-block";
        el.innerHTML = `
          <div class="article-header">
            <h3>${article.title}</h3>
          </div>
          <div class="article-meta">
            <p><em>${formattedDate} par ${article.author}</em></p>
          </div>
          <div class="article-image">
            <img src="${article.thumbnail}" alt="">
          </div>
          <div class="article-body">
            <p>${article.body.replace(/\n/g, "<br>")}</p>
          </div>
        `;
        container.appendChild(el);
      });
    }

    renderArticles(articles);

    // Filtrage par catégorie
    categoriesContainer.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        const cat = link.getAttribute("data-category");
        if (cat === "Tous") {
          renderArticles(articles);
        } else {
          renderArticles(articles.filter(a => a.category === cat));
        }
      });
    });
  } catch (err) {
    console.error("Erreur lors du chargement des articles :", err);
    container.innerHTML = "<p>Erreur lors du chargement des articles.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadArticles);

/* =========================
   Ultra Liquid Glass interactions
   - Glow suiveur via CSS vars --mx/--my
   - Tilt 3D doux avec inertie
   ========================= */
(function () {
  const SELECTOR = ".hottest-grid .card, .main-nav a, .article-block";

  function setMouseVars(el, e) {
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    el.style.setProperty("--mx", `${x}%`);
    el.style.setProperty("--my", `${y}%`);
  }

  function tilt(el, e) {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;  // -0.5..0.5
    const py = (e.clientY - r.top) / r.height - 0.5;
    const maxTilt = 6; // degrés
    const rx = (+py * -maxTilt).toFixed(2);
    const ry = (+px *  maxTilt).toFixed(2);
    el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
  }

  function resetTilt(el) {
    el.style.transform = "perspective(900px) rotateX(0) rotateY(0) translateZ(0)";
  }

  function attach(el) {
    let raf;
    function onMove(e) {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setMouseVars(el, e);
        tilt(el, e);
      });
    }
    function onLeave() {
      cancelAnimationFrame(raf);
      el.style.transition = "transform .35s cubic-bezier(.2,.8,.2,1)";
      resetTilt(el);
      setTimeout(()=> el.style.transition = "", 380);
    }
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
  }

  document.querySelectorAll(SELECTOR).forEach(attach);

  // Si du contenu est chargé dynamiquement plus tard (ex: filtrage),
  // on peut rappeler attach() pour les nouveaux éléments :
  const mo = new MutationObserver(() => {
    document.querySelectorAll(SELECTOR).forEach(el => {
      if (!el.dataset._attached) {
        el.dataset._attached = "1";
        attach(el);
      }
    });
  });
  mo.observe(document.body, { childList: true, subtree: true });
})();
