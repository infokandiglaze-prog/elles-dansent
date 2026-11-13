# Elles Dansent — répertoire des profs de danse afrodescendantes

Site statique hébergé sur **GitHub Pages**. Les vidéos YouTube de chaque prof sont récupérées
automatiquement chaque jour par **GitHub Actions** avec ta clé API. La clé reste cachée dans
les Secrets de GitHub : elle n'apparaît jamais dans le site.

## Mise en ligne (une seule fois)

1. **Ajouter ta clé API** : *Settings › Secrets and variables › Actions › New repository secret*
   - Name : `YOUTUBE_API_KEY`
   - Secret : ta clé YouTube Data API v3
2. **Activer le site** : *Settings › Pages* → Source : *Deploy from a branch* → Branch : `main` / `/ (root)` → *Save*.
3. **Lancer la 1re récupération** : onglet *Actions* → « Mettre à jour les vidéos YouTube » → *Run workflow*.

## Ajouter une prof

Modifie `data/profs.json` (bouton crayon sur GitHub) et ajoute un bloc :

```json
{
  "id": "nom-court-unique",
  "nom": "Nom affiché (laisser vide = nom de la chaîne)",
  "chaine": "@HandleYouTube",
  "video_exemple": "",
  "styles": ["Kompa", "Dancehall"],
  "niveau": "Débutante",
  "langue": "français",
  "pays": "Haïti",
  "bio": ""
}
```

- `chaine` accepte un `@handle`, un ID de chaîne `UC…` ou un lien `youtube.com/@…`.
- Si tu n'as qu'une vidéo, mets son ID dans `video_exemple` (la partie après `youtu.be/`) : le script trouve la chaîne tout seul.
- Dès que tu enregistres, l'Action se relance et ajoute ses 12 dernières vidéos.

Demande toujours l'accord de la prof avant de l'ajouter.

## Quota API

Chaque prof coûte environ 2 à 3 unités par jour (le quota gratuit est de 10 000 unités par jour).

## Formulaire d'inscription

Dans `index.html`, remplace `FORMULAIRE_URL` par le lien d'un Google Form (ou Tally) pour que les profs posent leur candidature.

## Sécurité de la clé

- Ne mets jamais la clé dans `index.html` ou `app.js`.
- Dans Google Cloud Console, limite la clé à **YouTube Data API v3** uniquement.
