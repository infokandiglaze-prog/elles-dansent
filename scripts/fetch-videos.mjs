// Récupère les vidéos YouTube de chaque prof listée dans data/profs.json
// et écrit data/videos.json. Lancé par GitHub Actions (clé dans les Secrets).
// Usage local : YOUTUBE_API_KEY=xxx node scripts/fetch-videos.mjs

import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.YOUTUBE_API_KEY;
const MAX_VIDEOS = 12; // vidéos par prof
const API = 'https://www.googleapis.com/youtube/v3';

if (!KEY) {
  console.error('YOUTUBE_API_KEY manquante.');
  process.exit(1);
}

async function yt(endpoint, params) {
  const url = new URL(`${API}/${endpoint}`);
  for (const [k, v] of Object.entries({ ...params, key: KEY })) url.searchParams.set(k, v);
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(`${endpoint}: ${json.error?.message || res.status}`);
  return json;
}

// Trouve la chaîne : @handle, ID UC…, ou à partir d'une vidéo exemple (1 unité de quota chacun)
async function resolveChannel(prof) {
  const c = (prof.chaine || '').trim();
  if (c.startsWith('UC')) return (await yt('channels', { part: 'snippet,contentDetails', id: c })).items?.[0];
  if (c) {
    const handle = c.replace(/^https?:\/\/(www\.)?youtube\.com\//, '').replace(/^@?/, '@');
    return (await yt('channels', { part: 'snippet,contentDetails', forHandle: handle })).items?.[0];
  }
  if (prof.video_exemple) {
    const v = (await yt('videos', { part: 'snippet', id: prof.video_exemple })).items?.[0];
    if (!v) return undefined;
    return (await yt('channels', { part: 'snippet,contentDetails', id: v.snippet.channelId })).items?.[0];
  }
}

const profs = JSON.parse(await readFile('data/profs.json', 'utf8'));
const out = { maj: new Date().toISOString(), profs: {} };

for (const prof of profs) {
  try {
    const ch = await resolveChannel(prof);
    if (!ch) { console.warn(`Chaîne introuvable : ${prof.id}`); continue; }
    const uploads = ch.contentDetails.relatedPlaylists.uploads;
    const list = await yt('playlistItems', { part: 'snippet,contentDetails', playlistId: uploads, maxResults: MAX_VIDEOS });
    out.profs[prof.id] = {
      chaineId: ch.id,
      chaineNom: ch.snippet.title,
      chaineUrl: ch.snippet.customUrl ? `https://www.youtube.com/${ch.snippet.customUrl}` : `https://www.youtube.com/channel/${ch.id}`,
      avatar: ch.snippet.thumbnails?.medium?.url || ch.snippet.thumbnails?.default?.url || '',
      videos: (list.items || [])
        .filter((it) => it.snippet.title !== 'Private video' && it.snippet.title !== 'Deleted video')
        .map((it) => ({
          id: it.contentDetails.videoId,
          titre: it.snippet.title,
          date: it.contentDetails.videoPublishedAt || it.snippet.publishedAt,
          miniature: it.snippet.thumbnails?.high?.url || it.snippet.thumbnails?.medium?.url || ''
        }))
    };
    console.log(`OK ${prof.id} → ${ch.snippet.title} (${out.profs[prof.id].videos.length} vidéos)`);
  } catch (e) {
    console.error(`Erreur ${prof.id} : ${e.message}`);
  }
}

await writeFile('data/videos.json', JSON.stringify(out, null, 2) + '\n');
console.log('data/videos.json écrit.');
