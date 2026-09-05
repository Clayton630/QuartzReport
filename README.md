# QuartzReport

QuartzReport est un site éditorial statique hébergé sur Cloudflare Pages. Les articles et les images sont versionnés dans ce dépôt ; `/admin` permet de les publier via GitHub.

## Architecture

```text
Rédacteur → /admin → GitHub (articles + images) → Cloudflare Pages → visiteurs
                                      ↑
                    Worker Cloudflare (OAuth, flux d'articles, images)
```

## Déploiement sûr

1. Travailler sur une branche dédiée.
2. Vérifier la prévisualisation Cloudflare Pages.
3. Fusionner dans `main` seulement après validation : Pages déploie alors automatiquement.
4. Le Worker est dans `worker/`. Son déploiement est manuel et doit suivre la même validation.

## Worker : variables à garder dans Cloudflare

- `GITHUB_CLIENT_ID` (variable publique)
- `GITHUB_CLIENT_SECRET` (secret)
- `GITHUB_TOKEN` (secret, lecture GitHub)
- `OAUTH_STATE_SECRET` (nouveau secret, signature anti-CSRF OAuth)

Les valeurs de secrets ne doivent jamais être ajoutées au dépôt. La sauvegarde d'origine est dans `outputs/QuartzReport-backup-2026-09-05`.

## Rédacteurs

Il n'existe pas de comptes QuartzReport séparés : un rédacteur est une personne ayant l'accès en écriture au dépôt GitHub. La prochaine évolution produit consiste à décider si l'on garde ce modèle simple ou si l'on ajoute des rôles, brouillons et validation éditoriale.
