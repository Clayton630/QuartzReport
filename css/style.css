/* =========================================================
   QuartzReport — CSS complet (consolidé)
   ========================================================= */

/* =========================
   Variables globales
   ========================= */
:root {
  /* marge horizontale de page (utilisée partout) */
  --page-x: 20px;
  --page-x-mobile: 20px;
  --bg-grad-a: #f3f6fb;
  --bg-grad-b: #f7f7f7;
}

/* Ajuste l’offset avec les zones sûres (iOS) et petites largeurs */
@supports(padding:max(0px)) {
  :root {
    --page-x-mobile: max(16px, env(safe-area-inset-left));
  }
}

/* =========================
   Reset & bases
   ========================= */
html {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow-x: hidden;
  background: linear-gradient(135deg, var(--bg-grad-a), var(--bg-grad-b));
}

body {
  margin: 0;
  padding: 0;
  width: 100%;
  max-width: 100%;
  min-height: 100vh;
  overflow-x: hidden;
  overflow-y: visible;
  font-family: 'Inter', Arial, sans-serif;
  color: #111;
  padding-top: env(safe-area-inset-top);
  position: relative;
  isolation: isolate;
  background: linear-gradient(135deg, var(--bg-grad-a), var(--bg-grad-b));
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

html, body {
  background-color: #f6f6f7;
}

/* =========================
   🌈 Reflet iridescent animé (haut de page)
   ========================= */
@keyframes iridescentFlow {
  0% { background-position: 0% 50%; filter: brightness(1.05) saturate(1.25); }
  50% { background-position: 100% 50%; filter: brightness(1.15) saturate(1.35); }
  100% { background-position: 0% 50%; filter: brightness(1.05) saturate(1.25); }
}

body::before {
  content: "";
  position: absolute;
  top: -10vh;
  left: 0;
  width: 100%;
  height: 68vh;
  z-index: -1;
  pointer-events: none;
  background-image:
    linear-gradient(65deg,
      rgba(135,175,255,0.75) 0%,
      rgba(120,250,235,0.7) 14%,
      rgba(185,255,205,0.7) 30%,
      rgba(220,190,255,0.75) 45%,
      rgba(255,190,250,0.75) 60%,
      rgba(255,215,225,0.65) 75%,
      rgba(255,240,200,0.55) 90%,
      rgba(255,255,255,0.45) 100%
    );
  background-size: 400% 400%;
  background-position: 0% 50%;
  filter: blur(26px) brightness(1.1) saturate(1.4);
  animation: iridescentFlow 15s ease-in-out infinite;
  mask-image: linear-gradient(to bottom,
    rgba(0,0,0,1) 0%,
    rgba(0,0,0,0.95) 65%,
    rgba(0,0,0,0.55) 80%,
    rgba(0,0,0,0) 100%
  );
  -webkit-mask-image: linear-gradient(to bottom,
    rgba(0,0,0,1) 0%,
    rgba(0,0,0,0.95) 65%,
    rgba(0,0,0,0.55) 80%,
    rgba(0,0,0,0) 100%
  );
}


/* 🔵 Supprime le highlight bleu iOS/Android sur les liens */
.main-nav a {
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
}

/* =========================
   Police globale QuartzSans (rendu SF Pro universel)
   ========================= */
@font-face {
  font-family: "QuartzSans";
  src: local("SF Pro Text Regular"),
       local("SF Pro Display Regular"),
       local("Inter Variable"),
       local("Inter"),
       url("https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLT9R6fdtO.ttf") format("truetype");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

/* ✅ Application globale sans modifier les graisses/tailles existantes */
body, button, input, textarea, select {
  font-family: "QuartzSans", -apple-system, BlinkMacSystemFont, "Segoe UI",
               Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", sans-serif !important;
  font-variation-settings: "wght" inherit;
}

/* =========================
   Header
   ========================= */
.site-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: calc(12px + env(safe-area-inset-top)) var(--page-x) 12px var(--page-x);
  background: none;
  border: none;
  box-shadow: none;
  position: sticky;
  top: 0;
  z-index: 10;
  box-sizing: border-box;
  overflow: visible;
  isolation: isolate;
}

.site-header::after {
  content: "";
  position: absolute;
  top: -20px;
  left: 0;
  right: 0;
  height: 20px;
  box-shadow: 0 0 20px rgba(0,0,0,0.1);
  pointer-events: none;
  z-index: -1;
}

/* ✅ Logo QuartzReport */
.logo {
  display: flex;
  align-items: center;
  justify-content: center;
}
.logo-img {
  height: 28px;
  width: auto;
  display: block;
  filter: brightness(0);
  transition: transform 0.2s ease;
}
.logo-img:hover { transform: scale(1.05); }
@media (min-width: 768px) { .logo-img { height: 26px; } }

/* =========================
   💧 Bouton combiné (recherche + menu)
   ========================= */
.icons {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  overflow: visible;
}

.dual-icon-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 86px;
  height: 42px;
  border-radius: 50px;
  background:
    radial-gradient(circle at 30% 30%, rgba(255,255,255,0.5), rgba(255,255,255,0) 70%),
    radial-gradient(circle at 70% 70%, rgba(255,255,255,0.2), rgba(255,255,255,0) 80%),
    rgba(255,255,255,0.65);
  border: 0.5px solid rgba(255,255,255,0.35);
  backdrop-filter: blur(14px) saturate(200%);
  -webkit-backdrop-filter: blur(14px) saturate(200%);
  box-shadow:
    inset 0.8px 0.8px 0 rgba(255,255,255,0.85),
    inset -0.8px -0.8px 0 rgba(255,255,255,0.75),
    0 2px 20px rgba(0,0,0,0.1);
  cursor: pointer;
  transition: all 0.25s ease;
  padding: 0 12px;
}

.dual-icon-btn:hover {
  background: rgba(255,255,255,1);
  transform: scale(1.03);
}

.dual-icon-btn i {
  font-size: 1.3rem;
  color: #111;
  line-height: 0;
  transition: transform 0.2s ease;
}
.dual-icon-btn i:hover { transform: scale(1.15); }

/* Mobile bouton combiné */
@media (max-width: 768px) {
  .dual-icon-btn {
    height: 44px;
    width: 94px;
    padding: 0 10px;
    justify-content: space-between;
  }
  .dual-icon-btn i { font-size: 1.55rem; }
}

@media (max-width: 768px) {
  .main-nav a.lock-transform {
    transform: scale(1) !important;
    transition: transform 120ms ease-out !important;
  }
}

/* =========================
   Navigation (catégories dynamiques)
   ========================= */
/* Conteneur scrollable sans snap, parfaitement aligné avec le reste */
.main-nav {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  white-space: nowrap;
  scroll-snap-type: none; /* ✅ pas de snap */
  margin: 8px 0 0 0;
  padding: 0; /* on gère les marges via l’UL */
}

.main-nav::-webkit-scrollbar { display: none; }

/* Rangée de catégories : alignement identique aux autres sections */
.main-nav ul {
  display: flex;
  gap: 12px;
  list-style: none;
  margin: 0;
  padding: 0 var(--page-x);   /* ✅ mêmes marges que hottest/articles */
  min-width: max-content;     /* ✅ garantit l’étalement et le scroll jusqu’au bout */
  align-items: center;
}

/* Spacer logique à droite pour que la dernière catégorie ne soit pas mangée */
.main-nav ul::after {
  content: "";
  flex: 0 0 var(--page-x);
}

/* Items */
.main-nav li { flex: 0 0 auto; }

/* Lien/pill de catégorie (style unifié) */
.main-nav a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  border-radius: 50px;
  background:
    radial-gradient(circle at 30% 30%, rgba(255,255,255,0.5), rgba(255,255,255,0) 70%),
    radial-gradient(circle at 70% 70%, rgba(255,255,255,0.2), rgba(255,255,255,0) 80%),
    rgba(255,255,255,0.65);
  border: 0.5px solid rgba(255,255,255,0.35);
  backdrop-filter: blur(14px) saturate(200%);
  -webkit-backdrop-filter: blur(14px) saturate(200%);
  font-family: "QuartzSans", -apple-system, BlinkMacSystemFont, "Segoe UI",
               Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", sans-serif;
  font-weight: 440;
  font-variation-settings: "wght" 440;
  font-size: 1rem;
  color: #111;
  text-decoration: none;
  /* ⚡️ VITESSE COULEUR : 0.15s (Très rapide) */
  transition: all 0.15s ease-out;
  box-shadow:
    inset 0.8px 0.8px 0 rgba(255,255,255,0.85),
    inset -0.8px -0.8px 0 rgba(255,255,255,0.75),
    0 2px 20px rgba(0,0,0,0.1);
  line-height: 1;
}

@media (hover: hover) and (pointer: fine) {
  .main-nav a:not(.active):hover {
    background: rgba(255,255,255,1);
    transform: scale(1.12);
    box-shadow:
      inset 0.8px 0.8px 0 rgba(255,255,255,0.85),
      inset -0.8px -0.8px 0 rgba(255,255,255,0.75),
      0 2px 20px rgba(0,0,0,0.1);
  }
}

.main-nav a.active {
  background: rgba(255,255,255,1);
  border: 0.5px solid rgba(0,0,0,0.1);
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  font-weight: 500;
  transform: scale(1.12);
}

/* Mobile — hauteur réellement réduite (sans changer la taille police trop) */
@media (max-width: 480px) {
  .main-nav ul {
    padding-left: var(--page-x-mobile);
    padding-right: var(--page-x-mobile);
  }
  .main-nav a {
    padding: 8px 16px;
    font-size: 0.97rem;
    line-height: 1;
    border-radius: 34px;
  }
}

/* =========================
   Section Hottest (Structure Corrigée Shadow/Overflow)
   ========================= */
.hottest {
  padding: 20px 0;
  overflow: visible;
}

.hottest-wrapper {
  position: relative;
  z-index: 1;
  padding: 0;
  overflow: visible;
}

.hottest-grid {
  position: relative;
  z-index: 1;
  display: flex;
  gap: var(--page-x);
  scroll-snap-type: x mandatory;
  overflow-x: auto;
  
  /* ✅ IMPORTANT : Laisse dépasser l'ombre verticalement */
  overflow-y: visible;
  overscroll-behavior-x: contain;
  
  /* ✅ PADDING ASYMÉTRIQUE (Le secret pour l'ombre) :
     Haut : 40px
     Côtés : var(--page-x)
     Bas : 60px (Augmenté pour que l'ombre du hover ait la place d'exister)
  */
  padding: 40px var(--page-x) 60px var(--page-x); 
  
  margin-top: -10px; /* Compensation visuelle */
}

/* Empêche le snap sur le spacer */
.hottest-grid .hottest-spacer {
  scroll-snap-align: none !important;
}

.hottest-grid::-webkit-scrollbar { display: none; }

/* ✅ 1. LA CARTE (COQUILLE EXTERNE) */
.hottest-grid .card {
  flex: 0 0 80%;
  max-width: 320px;
  scroll-snap-align: start;
  scroll-margin-left: var(--page-x);
  
  /* Layout */
  display: flex;
  flex-direction: column;
  
  /* Reset styles */
  text-decoration: none;
  color: inherit;
  background: transparent; 
  border: none;
  
  /* Ombre de base */
  box-shadow: 0 12px 30px -5px rgba(0, 0, 0, 0.12);
  border-radius: 28px;
  
  /* ✅ FIX ANTI-CLIGNOTEMENT SAFARI :
     1. translate3d(0,0,0) : Active l'accélération matérielle au repos.
     2. backface-visibility : Empêche le clignotement des faces arrière.
     3. will-change : Prévient le navigateur des futures modifs.
  */
  
  will-change: transform, box-shadow;
  transition: transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), 
              box-shadow 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  
  overflow: visible !important; 
}

/* ✅ 2. L'INTÉRIEUR (CONTENU VISUEL)
   Gère : Fond, Image, Clipping, LISERÉ TITANE.
   Doit être en overflow: hidden pour couper proprement.
*/
.card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  
  /* Styles visuels */
  background: rgba(255,255,255,0.35);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  
  /* ⚡️ LE CLIPPING EST ICI */
  overflow: hidden;
  border-radius: 28px;
  
  /* Fix GPU pour Safari (bords nets) */
  transform: translate3d(0,0,0);
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

/* Adaptation images */
.card-inner > img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border: none;
}

/* Contenu texte */
.card-content {
  flex: 1;
  padding: 14px 16px 16px;
}
.card-content h3 {
  font-size: 1.05rem;
  margin: 6px 0 0;
  color: #111;
  text-align: left;
  font-weight: 600;
}
.card-content p {
  margin: 0;
  font-size: 13px;
  color: #0000008a;
  font-weight: 400;
  line-height: 1.3;
}
/* === Responsive Mobile Fixes === */
@media (max-width: 768px) {
  .hottest-grid .card {
    flex: 0 0 65%;
    max-width: 260px;
  }
  /* Ajustement padding container pour mobile */
  .hottest-grid {
    padding-top: 30px;
    padding-bottom: 40px; /* Plus d'espace pour l'ombre mobile */
  }
}

@media (min-width: 769px) {
  .hottest-grid .card:first-child {
    margin-left: 0 !important;
  }
}

/* =========================
   Articles du feed
   ========================= */
.articles {
  padding: 20px var(--page-x);
  overflow: visible;
}

.day-block {
  background: #fff;
  border-radius: 23px;
  padding: 14px 14px 8px 14px;
  margin-bottom: 26px;
  box-shadow: 0 3px 12px rgba(0,0,0,0.04);
  box-sizing: border-box;
}

.day-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #111;
  margin: 0 0 12px 4px;
  text-transform: capitalize;
}

.day-article {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
}

.day-article-link {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-decoration: none;
  color: inherit;
}

.thumb {
  width: 72px;
  height: 72px;
  border-radius: 12px;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  flex-shrink: 0;
}

.day-article-info { flex: 1; }

.day-meta {
  margin: 0;
  font-size: 0.85rem;
  color: #777;
}

.day-article-info h4 {
  margin: 4px 0 0;
  font-size: 1rem;
  font-weight: 600;
  color: #111;
  line-height: 1.3;
}

.day-separator {
  height: 1px;
  background: rgba(0,0,0,0.06);
  margin: 6px 0;
}

/* =========================
   Résumé (description)
   ========================= */
.day-desc {
  margin: 4px 0 0;
  font-size: 0.9rem;
  color: rgba(0, 0, 0, 0.65);
  line-height: 1.45;
  font-weight: 400;
  text-overflow: ellipsis;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* =========================
   Responsive global
   ========================= */
@media (max-width: 480px) {
  .logo-img { height: 27px; }

  /* catégories : taille/padding plus compact */
  .main-nav a { font-size: 0.97rem; padding: 8px 16px; border-radius: 34px; }

  .hottest-grid .card { flex: 0 0 65%; max-width: 260px; }
  .card-content h3 { font-size: 1.05rem; }

  .article-header h3 { font-size: 1.3rem; }
  .article-body { font-size: 0.95rem; }
  .thumb { width: 64px; height: 64px; }
  .day-title { font-size: 1rem; margin-bottom: 8px; }
  .day-article-info h4 { font-size: 0.95rem; }

  /* ❗ Correction : NE PAS mettre de padding sur hottest-wrapper */
  .hottest-wrapper {
    padding: 0; /* essential */
  }

  /* ❗ Le padding doit aller sur hottest-grid */
  .hottest-grid {
    padding-left: var(--page-x-mobile);
    padding-right: var(--page-x-mobile);
  }

  /* articles */
  .articles { padding: 20px var(--page-x-mobile); }
}

/* =========================
   Feed regroupé par jour / semaine (desktop)
   ========================= */
@media (min-width: 769px) {
  .week-block { margin-bottom: 36px; }

  .week-title {
    font-size: 1.2rem;
    font-weight: 600;
    color: #111;
    margin: 0 0 16px 4px;
    text-transform: capitalize;
  }

  .week-carousel {
    --day-card-w: 320px;
    display: flex;
    gap: 18px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    padding: 0 4px;
    align-items: flex-start;
  }

  .week-carousel .day-block {
    flex: 0 0 var(--day-card-w);
    width: var(--day-card-w);
    max-width: var(--day-card-w);
    height: auto;
    scroll-snap-align: start;
  }
}

/* =========================
   Article — Page complète
   ========================= */
.article-cover {
  position: relative;
  width: 100vw;
  left: 50%;
  right: 50%;
  margin-left: -50vw;
  margin-right: -50vw;
  top: 0;
  overflow: hidden;
  max-height: 55vh;
  border-radius: 0;
}

.article-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.article-header {
  text-align: center;
  padding: 0 var(--page-x);
}

.article-header h1 {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 0.2rem 0 0.6rem;
  color: #111;
}

.article-meta {
  font-size: 0.9rem;
  color: #666;
  margin: 0 0 1.8rem;
}

.article-body {
  font-size: 1rem;
  color: #111;
  line-height: 1.6;
  padding: 0 var(--page-x) 2.5rem;
}

.article-body img {
  width: 100%;
  height: auto;
  border-radius: 14px;
  margin: 1.2rem 0;
  object-fit: contain;
}

/* =========================
   Titre "Tous les articles"
   ========================= */
.all-articles-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #111;
  margin: 32px var(--page-x) 14px var(--page-x);
  line-height: 1.3;
  text-align: left;
}

/* =========================
   Responsive — correction du 16/9 sur mobile
   ========================= */
@media (max-width: 768px) {
  .hottest-wrapper { margin-top: 10px; }

  .hottest-grid .card {
    flex: 0 0 65%;
    max-width: 260px;
  }

  .hottest-grid .card > img {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    display: block;
    height: auto;
  }

  .card-content {
    padding: 12px 14px 14px;
  }

  .card-content h3 {
    font-size: 1rem;
  }
}

/* ===== Nav: extended breathing space for shadows (desktop + mobile) ===== */
.main-nav {
  overflow-x: auto;
  overflow-y: visible;
  -webkit-overflow-scrolling: touch;

  /* espace généreux pour ombres supérieures/inférieures */
  padding-top: 32px;
  padding-bottom: 42px;

  /* neutralisation visuelle pour ne pas impacter la mise en page */
  margin-top: -32px;
  margin-bottom: -42px;

  position: relative;
  z-index: 2;
}

/* 📱 Variante mobile : ombres encore plus respirantes */
@media (max-width: 768px) {
  .main-nav {
    padding-top: 36px;
    padding-bottom: 52px;
    margin-top: -36px;
    margin-bottom: -52px;
  }
}

/* 📱 Catégories légèrement plus petites mais toujours confortables */
@media (max-width: 480px) {
  .main-nav a {
    padding: 9px 18px;
    font-size: 1.0rem;
    border-radius: 36px;
  }
/* 💫 Effet "press & release" fluide et élégant */
@keyframes bounceTap {
  0%   { transform: scale(1); }
  40%  { transform: scale(0.90); }
  100% { transform: scale(1); }
}

.main-nav a.tap-anim {
  animation: bounceTap 850ms cubic-bezier(0.25, 0.8, 0.4, 1);
  animation-fill-mode: none;
}
}
/* =========================
   ANIMATION TACTILE (V2 : Snappy & Smooth)
   ========================= */

/* 1. Pression : EXPLOSIVE (200ms) */
/* 1. Pression : Grande Amplitude & Mouvement Posé */
.main-nav a.pressed {
  transform: scale(1.25); /* ✅ On grossit franchement (+25%) */
  
  background: #ffffff !important; 
  color: #111 !important;
  
  box-shadow:
    inset 0.8px 0.8px 0 rgba(255,255,255,0.85),
    inset -0.8px -0.8px 0 rgba(255,255,255,0.75),
    0 15px 35px rgba(0,0,0,0.15);

  /* ⏳ 400ms : C'est plus lent qu'avant (200ms), donc moins "électrique".
     La courbe reste fluide pour éviter l'effet linéaire robotique. */
  transition: all 400ms cubic-bezier(0.1, 0.9, 0.2, 1.0);
}

/* 2. Relâchement : Retour en douceur */
.main-nav a.pressed-release {
  transform: scale(1);
  
  /* On garde une durée longue pour l'atterrissage */
  transition: all 600ms cubic-bezier(0.25, 1, 0.5, 1);
}

/* === HOTTEST : Calage Mobile & Desktop === */

/* 1. On nettoie la marge sur le premier élément (Spacer ou Carte) */
.hottest-grid .card:first-child {
  margin-left: 0 !important; /* ✅ Fini les 20px en trop sur mobile */
}

/* 2. Sur Mobile : On cache le spacer */
/* Le padding du conteneur (20px) suffit à créer l'alignement parfait avec les catégories */
@media (max-width: 768px) {
  .hottest-spacer {
    display: none !important;
  }
}

/* 3. Sur Desktop : On garde la marge à 0 (le spacer JS fait le travail) */
@media (min-width: 769px) {
  .hottest-grid .card:first-child {
    margin-left: 0 !important;
  }
}
/* =========================
   💎 Liseré "TITANIUM LUMINOUS" (Appliqué sur .card-inner)
   ========================= */

@keyframes stealthFlow {
  0% { background-position: 0% 50%; opacity: 0; }
  15% { opacity: 1; }
  35% { opacity: 1; }
  50% { background-position: 100% 50%; opacity: 0; }
  65% { opacity: 1; }
  85% { opacity: 1; }
  100% { background-position: 0% 50%; opacity: 0; }
}

/* Attention : On cible maintenant .card-inner et plus .card */
.hottest-grid .card:not(.hottest-spacer) .card-inner::after {
  content: "";
  position: absolute;
  
  /* Calage sub-pixel parfait */
  inset: -0.5px;
  border-radius: 28.5px;
  padding: 2px;
  
  /* Gradient Titane Frost */
  background: linear-gradient(
    125deg,
    #a7b7cc 0%,
    #f1f5f9 15%,
    #ffffff 25%,
    #bae6fd 30%,
    #ffffff 35%,
    #a7b7cc 50%,
    #ffffff 65%,
    #e9d5ff 70%,
    #ffffff 75%,
    #f1f5f9 85%,
    #a7b7cc 100%
  );
  
  background-size: 300% 300%;
  will-change: background-position, opacity;
  animation: stealthFlow 8s ease-in-out infinite;
  
  -webkit-mask: 
     linear-gradient(#fff 0 0) content-box, 
     linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  
  pointer-events: none;
  z-index: 100;
}

/* =========================
   ✨ Restauration du Hover (Souris Uniquement & Sans Bug)
   ========================= */
@media (hover: hover) {
  .hottest-grid .card:not(.hottest-spacer):hover {
    /* Mouvement fluide */
    transform: translate3d(0, -4px, 0);
    /* Ombre renforcée */
    box-shadow: 0 18px 40px -5px rgba(0, 0, 0, 0.2);
  }
}
