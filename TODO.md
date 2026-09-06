# QuartzReport — liste de suivi

Cette liste rassemble les améliorations volontairement reportées. Elles ne sont pas des actions en cours.

## Administratif

- [ ] Demander à OVHcloud la régularisation de la facture initiale de `quartzreport.fr` (coordonnées et TVA si nécessaire).

## Base technique

- [ ] Mettre à jour le README pour décrire l’architecture Astro actuelle.
- [ ] Créer un sitemap XML réel des pages et articles, puis le déclarer dans Google Search Console pour lancer le référencement de `quartzreport.fr`.
- [ ] Retirer la règle de cache obsolète pour `/css/*`.
- [ ] Fusionner les règles CSS redondantes, sans modifier le rendu visuel.
- [ ] Rendre cohérents la police distante et la politique de sécurité du site.
- [ ] Vérifier les images non reliées à un article avant toute suppression.
- [ ] Ajouter une vérification automatique du code Astro avant publication.

## À traiter plus tard, avec précaution

- [ ] Fiabiliser la lecture des métadonnées des articles.
- [ ] Étudier puis retirer les anciennes routes publiques du Worker Cloudflare.
- [ ] Améliorer la chaîne d’images en conservant les originaux.
