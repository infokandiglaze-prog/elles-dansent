// Cherche automatiquement de nouvelles chaînes YouTube de cours de danse
// dans le même style que les profs déjà au répertoire.
// Ne publie rien : écrit une liste de candidates à valider (data/candidats.json + rapport.md).
// Usage : YOUTUBE_API_KEY=xxx node scripts/discover.mjs

import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.YOUTUBE_API_KEY;
const API = 'https://www.googleapis.com/youtube/v3';
const MAX_RECHERCHES = 10; // 100 unités de quota chacune → 1 000 / semaine
const MIN_ABONNES = 500;

if (!KEY) {
  // Sans clé, la recherche YouTube est impossible : on s'arrête proprement.
  console.log('Pas de clé API (secret YOUTUBE_API_KEY) : recherche de nouvelles profs ignorée.');
  let h = '{\n  "vus": [],\n  "candidates": []\n}\n';
  try { h = await readFile('data/candidats.json', 'utf8'); } catch {}
  await writeFile('data/candidats.json', h);
  await writeFile('rapport.md', '');
  process.exit(0);
}

// Requêtes de base : cours / tutoriels des styles afro et caribéens
const BASE = [
  'cours de danse afro débutante',
  'afro dance tutorial for beginners',
  'tuto danse afrobeat',
  'dancehall dance tutorial female',
  'kompa dance tutorial',
  'apprendre à danser le kompa',
  'amapiano dance tutorial',
  'coupé décalé tuto danse',
  'ndombolo tuto danse',
  'kizomba ladies styling tutorial',
  'azonto dance tutorial',
  'zouk dance tutorial',
  'soca dance tutorial',
  'afro fitness dance workout'
];

async function yt(endpoint, params) {
  const url = new URL(`${API}/${endpoint}`);
  for (const [k, v] of Object.entries({ ...params, key: KEY })) url.searchParams.set(k, v);
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(`${endpoint}: ${json.error?.message || res.status}`);
  return json;
}

const lireJson = async (f, defaut) => { try { return JSON.parse(await readFile(f, 'utf8')); } catch { return defaut; } };

const profs = await lireJson('data/profs.json', []);
const videos = await lireJson('data/videos.json', { profs: {} });
const historique = await lireJson('data/candidats.json', { vus: [], candidates: [] });

// Chaînes à ne pas reproposer : déjà au répertoire ou déjà proposées
const exclues = new Set([
  ...Object.values(videos.profs || {}).map((p) => p.chaineId),
  ...profs.map((p) => p.chaine).filter((c) => c && c.startsWith('UC')),
  ...historique.vus
]);

// « Même style » : mots-clés tirés des vidéos des profs déjà au répertoire
const idsExemples = [
  ...profs.map((p) => p.video_exemple).filter(Boolean),
  ...Object.values(videos.profs || {}).flatMap((p) => (p.videos || []).slice(0, 2).map((v) => v.id))
].slice(0, 50);
const requetesStyle = [];
if (idsExemples.length) {
  const det = await yt('videos', { part: 'snippet', id: idsExemples.join(',') });
  const compte = {};
  for (const v of det.items || []) for (const tag of v.snippet.tags || []) {
    const t = tag.toLowerCase().trim();
    if (t.length > 6 && /dans|danc|tuto|choreo|chor/.test(t)) compte[t] = (compte[t] || 0) + 1;
  }
  requetesStyle.push(...Object.entries(compte).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t));
}

// Rotation : chaque semaine, un groupe différent de requêtes de base
const semaine = Math.floor(Date.now() / (7 * 864e5));
const decale = (semaine * 6) % BASE.length;
const requetes = [...requetesStyle, ...BASE.slice(decale), ...BASE.slice(0, decale)].slice(0, MAX_RECHERCHES);

const trouvees = new Map(); // channelId → { requetes, videos }
for (const q of requetes) {
  try {
    const r = await yt('search', { part: 'snippet', q, type: 'video', maxResults: 25, relevanceLanguage: /[àéèç]|cours|tuto|apprendre/.test(q) ? 'fr' : 'en' });
    for (const it of r.items || []) {
      const id = it.snippet.channelId;
      if (exclues.has(id)) continue;
      const e = trouvees.get(id) || { requetes: new Set(), videos: [] };
      e.requetes.add(q);
      if (e.videos.length < 3) e.videos.push({ id: it.id.videoId, titre: it.snippet.title });
      trouvees.set(id, e);
    }
  } catch (e) { console.error(`Recherche « ${q} » : ${e.message}`); }
}

// Détails des chaînes (abonnés, description) — 1 unité par lot de 50
const ids = [...trouvees.keys()];
const nouvelles = [];
for (let i = 0; i < ids.length; i += 50) {
  const r = await yt('channels', { part: 'snippet,statistics', id: ids.slice(i, i + 50).join(',') });
  for (const ch of r.items || []) {
    const abonnes = Number(ch.statistics.subscriberCount || 0);
    if (!ch.statistics.hiddenSubscriberCount && abonnes < MIN_ABONNES) continue;
    const e = trouvees.get(ch.id);
    nouvelles.push({
      chaineId: ch.id,
      nom: ch.snippet.title,
      url: ch.snippet.customUrl ? `https://www.youtube.com/${ch.snippet.customUrl}` : `https://www.youtube.com/channel/${ch.id}`,
      pays: ch.snippet.country || '',
      abonnes,
      pertinence: e.requetes.size,
      trouveeVia: [...e.requetes],
      videos: e.videos,
      proposeeLe: new Date().toISOString().slice(0, 10)
    });
  }
}
nouvelles.sort((a, b) => b.pertinence - a.pertinence || b.abonnes - a.abonnes);
const retenues = nouvelles.slice(0, 20);

historique.vus = [...new Set([...historique.vus, ...retenues.map((c) => c.chaineId)])];
historique.candidates = [...retenues, ...historique.candidates].slice(0, 200);
await writeFile('data/candidats.json', JSON.stringify(historique, null, 2) + '\n');

// Rapport lisible (devient une « issue » GitHub à valider)
const lignes = retenues.map((c) => [
  `- [ ] **[${c.nom}](${c.url})** — ${c.abonnes.toLocaleString('fr-CA')} abonnés${c.pays ? ' · ' + c.pays : ''}`,
  `  - Trouvée via : ${c.trouveeVia.join(', ')}`,
  ...c.videos.map((v) => `  - ▶ [${v.titre}](https://youtu.be/${v.id})`),
  `  - Pour l'ajouter dans \`data/profs.json\` : \`"chaine": "${c.chaineId}"\``
].join('\n'));
await writeFile('rapport.md', retenues.length
  ? `${retenues.length} nouvelles chaînes trouvées cette semaine.\n\n` +
    `⚠️ **À vérifier avant d'ajouter** : l'API ne peut pas savoir si la chaîne est tenue par une femme afrodescendante, ni si la prof est d'accord. Regarde chaque chaîne, contacte la prof, puis ajoute-la dans \`data/profs.json\`.\n\n` +
    lignes.join('\n\n') + '\n'
  : '');
console.log(`${retenues.length} candidates (requêtes : ${requetes.join(' | ')})`);
