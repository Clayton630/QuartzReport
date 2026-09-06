# QuartzReport

QuartzReport est un site d’actualité statique, accessible sur `https://quartzreport.fr` et hébergé gratuitement sur Cloudflare Pages. Les articles et leurs images sont stockés dans ce dépôt ; Decap CMS permet de les rédiger depuis `/admin`.

## Architecture

```text
Visiteur
  └─ Cloudflare Pages (site statique)
       ├─ /admin → Decap CMS → GitHub OAuth
       └─ /api/articles → Worker Cloudflare → dépôt public GitHub

Worker Cloudflare
  ├─ OAuth GitHub pour Decap CMS
  ├─ flux public d’articles mis en cache deux minutes
  └─ aucune image : Cloudflare les transforme directement
```

Le Worker n’est **pas** un proxy GitHub général : seules les lectures publiques des articles sont autorisées. Aucun jeton GitHub serveur n’est nécessaire pour afficher le site.

## Écrire un article

1. Ouvrir `https://quartzreport.fr/admin/`.
2. Se connecter avec le compte GitHub autorisé.
3. Créer ou modifier un article, puis publier.
4. Cloudflare Pages déploie automatiquement la branche `main`.

Les articles sont des fichiers Markdown dans `articles/`. Les images originales restent dans `img/uploads/`; Cloudflare en sert automatiquement des versions adaptées à l’écran, sans modifier les fichiers originaux. Le site utilise un nombre limité de tailles pour rester dans le quota gratuit de transformations.

## Développement et vérification

Prérequis : Node.js 22+ et Wrangler 4.

```bash
npm test
wrangler deploy --dry-run --keep-vars --config worker/wrangler.jsonc
```

Avant chaque mise en ligne, exécuter ces vérifications. Les changements sont d’abord testés localement, puis validés sur une préproduction Cloudflare Pages avant fusion sur `main` lorsque le changement est conséquent.

## Déployer le Worker

Les secrets restent uniquement dans Cloudflare :

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `OAUTH_STATE_SECRET`

Ne jamais ajouter ces valeurs au dépôt, à un fichier `.dev.vars` commité, ou à une issue GitHub.

```bash
wrangler deploy --keep-vars --config worker/wrangler.jsonc
```

Après le déploiement : vérifier `/api/articles`, la page d’accueil et `/admin`. Les versions précédentes du Worker peuvent être restaurées depuis Cloudflare avec `wrangler rollback <version-id>`.

## Sécurité et contenu

- Le Markdown est nettoyé avant son affichage dans un article.
- Les métadonnées des articles acceptent les descriptions sur plusieurs lignes, les guillemets et un repli fiable de date si une date est invalide.
- Les images locales de `/img/uploads/` sont transformées par Cloudflare, sans dépendance à un service d’images externe.
- Les articles de test déjà publiés sont conservés pour l’instant : les retirer de la page d’accueil est une décision éditoriale, pas une suppression automatique.

## Sauvegarde du 5 septembre 2026

Une sauvegarde complète (miroirs Git, source Worker d’origine et notes de configuration) est conservée hors du dépôt dans `outputs/QuartzReport-backup-2026-09-05/`.
