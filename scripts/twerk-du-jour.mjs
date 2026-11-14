// Twerk du jour : chaque jour, cherche les nouvelles vidéos twerk sur YouTube.
// - Vidéos des chaînes approuvées (profs du répertoire + data/twerk-chaines.json) : ajoutées automatiquement au site.
// - Vidéos des autres chaînes : listées dans rapport-twerk.md pour validation (protection contre les vidéos inappropriées).
// Seules les vidéos intégrables et SANS restriction d'âge sont gardées.

import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.YOUTUBE_API_KEY;
const API = 'https://www.googleapis.com/youtube/v3';
const MAX_FIL = 600; // nombre maximum de vidéos gardées sur la page
const REQUETES = ['twerk', 'twerk tutorial', 'twerk choreography', 'twerk class', 'twerkshop', 'twerk dance', 'twerk fitness', 'twerk heels', 'sensual twerk', 'booty dance', 'perreo dance', 'dancehall whine'];
const TWERK = /twerk|booty|jiggle|bounce|shake/i;
const DANSE = /twerk|booty|jiggle|shake|choreo|chor[ée]|class|clase|cours|tutorial|tuto|workshop|heels|whine|wining|perreo|danc|danse|bail|dancehall|isolation|glute|freestyle/i;
const EXCLURE = /vlog|podcast|interview|episode|rezy|pop ?up|unboxing|get ready|grwm|aprende|food|market|vacation|makeup|coming soon|detr[aá]s de c[aá]maras|behind the scenes|\bbts\b|teaser|lookbook|shein|haul|reaction|storytime|audio oficial|sizzle|surgery|bachelorette/i; // vidéos hors danse à exclure

const lireJson = async (f, defaut) => { try { return JSON.parse(await readFile(f, 'utf8')); } catch { return defaut; } };

if (!KEY) {
  console.log('Pas de clé API : Twerk du jour ignoré.');
  await writeFile('rapport-twerk.md', '');
  process.exit(0);
}

async function yt(endpoint, params) {
  const url = new URL(`${API}/${endpoint}`);
  for (const [k, v] of Object.entries({ ...params, key: KEY })) url.searchParams.set(k, v);
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(`${endpoint}: ${json.error?.message || res.status}`);
  return json;
}

const profs = await lireJson('data/profs.json', []);
const videosProfs = await lireJson('data/videos.json', { profs: {} });
const extra = await lireJson('data/twerk-chaines.json', []);
const fil = await lireJson('data/twerk.json', { maj: null, videos: [] });

const approuvees = new Set([
  ...Object.values(videosProfs.profs || {}).map((p) => p.chaineId),
  ...profs.map((p) => p.chaine).filter((c) => c && c.startsWith('UC')),
  ...extra.map((c) => (typeof c === 'string' ? c : c.id))
]);
const deja = new Set(fil.videos.map((v) => v.id));
const idsExtra = new Set(extra.map((c) => (typeof c === 'string' ? c : c.id)));
// Chaînes 100 % danse (cours, chorégraphies) : toutes leurs vidéos sont gardées, sauf les exclusions
const tout = new Set(extra.filter((c) => c && c.toutDanse).map((c) => c.id));
const garderTitre = (titre, ch) => !EXCLURE.test(titre) && (tout.has(ch) || (idsExtra.has(ch) ? DANSE : TWERK).test(titre));

// 1. Recherche des vidéos publiées ces 3 derniers jours
const depuis = new Date(Date.now() - 3 * 864e5).toISOString();
const trouves = new Map();
for (const q of REQUETES) {
  try {
    const r = await yt('search', { part: 'snippet', q, type: 'video', order: 'viewCount', publishedAfter: depuis, videoEmbeddable: 'true', maxResults: 50 });
    for (const it of r.items || []) trouves.set(it.id.videoId, it.snippet.channelId);
  } catch (e) { console.error(`Recherche « ${q} » : ${e.message}`); }
}
// + les dernières vidéos twerk des profs du répertoire
for (const p of Object.values(videosProfs.profs || {})) {
  for (const v of p.videos || []) if (TWERK.test(v.titre || '')) trouves.set(v.id, p.chaineId);
}

// + les dernières vidéos des chaînes twerk approuvées (data/twerk-chaines.json)
for (const c of extra) {
  const id = typeof c === 'string' ? c : c.id;
  try {
    const r = await yt('playlistItems', { part: 'contentDetails', playlistId: 'UU' + id.slice(2), maxResults: 25 });
    for (const it of r.items || []) trouves.set(it.contentDetails.videoId, id);
  } catch (e) { console.error(`Chaîne ${id} : ${e.message}`); }
}

// 2. Vérification : intégrable, pas de restriction d'âge, titre twerk
const ids = [...trouves.keys()].filter((id) => !deja.has(id));
const ajouts = [];
const aValider = new Map();
for (let i = 0; i < ids.length; i += 50) {
  const r = await yt('videos', { part: 'snippet,contentDetails,status,statistics', id: ids.slice(i, i + 50).join(',') });
  for (const v of r.items || []) {
    if (!v.status?.embeddable) continue;
    if (v.contentDetails?.contentRating?.ytRating === 'ytAgeRestricted') continue;
    if (v.snippet?.madeForKids) continue;
    // Seulement des vidéos de danse : les chaînes approuvées doivent avoir un titre de danse, les autres doivent parler de twerk
    if (EXCLURE.test(v.snippet.title)) continue;
    if (idsExtra.has(v.snippet.channelId)) { if (!garderTitre(v.snippet.title, v.snippet.channelId)) continue; }
    else if (!TWERK.test(`${v.snippet.title} ${(v.snippet.tags || []).join(' ')}`)) continue;
    const video = {
      id: v.id,
      titre: v.snippet.title,
      chaine: v.snippet.channelTitle,
      chaineId: v.snippet.channelId,
      date: v.snippet.publishedAt,
      vues: Number(v.statistics?.viewCount || 0),
      miniature: v.snippet.thumbnails?.high?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`
    };
    if (approuvees.has(v.snippet.channelId)) ajouts.push(video);
    else {
      const c = aValider.get(video.chaineId) || { nom: video.chaine, videos: [] };
      c.videos.push(video);
      aValider.set(video.chaineId, c);
    }
  }
}

fil.videos = [...ajouts, ...fil.videos.filter((v) => approuvees.has(v.chaineId) && garderTitre(v.titre || '', v.chaineId))]
  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  .slice(0, MAX_FIL);
fil.maj = new Date().toISOString();
await writeFile('data/twerk.json', JSON.stringify(fil, null, 2) + '\n');
console.log(`${ajouts.length} vidéos twerk ajoutées automatiquement, ${aValider.size} chaînes à valider.`);

// 3. Rapport des chaînes à valider
const lignes = [...aValider.entries()]
  .sort((a, b) => Math.max(...b[1].videos.map((v) => v.vues)) - Math.max(...a[1].videos.map((v) => v.vues)))
  .slice(0, 40)
  .map(([id, c]) => [
    `- [ ] **${c.nom}** — \`${id}\``,
    ...c.videos.slice(0, 3).map((v) => `  - ▶ [${v.titre}](https://youtu.be/${v.id}) — ${v.vues.toLocaleString('fr-CA')} vues`)
  ].join('\n'));
await writeFile('rapport-twerk.md', lignes.length
  ? `${ajouts.length} vidéos ajoutées automatiquement aujourd'hui (chaînes déjà approuvées).\n\n` +
    `**${lignes.length} nouvelles chaînes twerk à vérifier.** Pour approuver une chaîne, ajoute son identifiant (UC…) dans \`data/twerk-chaines.json\` : ses vidéos twerk apparaîtront ensuite automatiquement chaque jour.\n\n` +
    `⚠️ Vérifie que la chaîne ne montre que des adultes et du contenu de danse.\n\n` + lignes.join('\n\n') + '\n'
  : '');
