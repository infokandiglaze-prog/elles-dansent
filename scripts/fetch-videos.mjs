// Récupère les vidéos YouTube de chaque prof listée dans data/profs.json
// et écrit data/videos.json. Lancé chaque jour par GitHub Actions.
// Avec la clé API (secret YOUTUBE_API_KEY) : API YouTube officielle.
// Sans clé : flux RSS public de chaque chaîne (15 dernières vidéos, aucune clé nécessaire).

import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.YOUTUBE_API_KEY;
const MAX_VIDEOS = 12; // vidéos par prof
const API = 'https://www.googleapis.com/youtube/v3';
const ENTETES = { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'fr,en;q=0.8', Cookie: 'CONSENT=YES+1' };

async function yt(endpoint, params) {
  const url = new URL(`${API}/${endpoint}`);
  for (const [k, v] of Object.entries({ ...params, key: KEY })) url.searchParams.set(k, v);
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(`${endpoint}: ${json.error?.message || res.status}`);
  return json;
}

// ---------- Mode avec clé API ----------
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

async function viaApi(prof) {
  const ch = await resolveChannel(prof);
  if (!ch) return null;
  const uploads = ch.contentDetails.relatedPlaylists.uploads;
  const list = await yt('playlistItems', { part: 'snippet,contentDetails', playlistId: uploads, maxResults: MAX_VIDEOS });
  return {
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
}

// ---------- Mode sans clé (flux RSS) ----------
const page = async (url) => { const r = await fetch(url, { headers: ENTETES }); if (!r.ok) throw new Error(`${url} : ${r.status}`); return r.text(); };
const decode = (t) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const tag = (xml, nom) => { const m = xml.match(new RegExp(`<${nom}[^>]*>([\\s\\S]*?)</${nom}>`)); return m ? decode(m[1].trim()) : ''; };

async function trouverChaineId(prof) {
  const c = (prof.chaine || '').trim();
  if (/^UC[\w-]{22}$/.test(c)) return c;
  if (c) {
    const handle = c.replace(/^https?:\/\/(www\.)?youtube\.com\//, '').replace(/^@?/, '@');
    const html = await page(`https://www.youtube.com/${handle}`);
    return (html.match(/"externalId":"(UC[\w-]{22})"/) || html.match(/channel\/(UC[\w-]{22})/) || [])[1];
  }
  if (prof.video_exemple) {
    const html = await page(`https://www.youtube.com/watch?v=${prof.video_exemple}`);
    return (html.match(/"channelId":"(UC[\w-]{22})"/) || html.match(/"externalChannelId":"(UC[\w-]{22})"/) || [])[1];
  }
}

async function viaRss(prof) {
  const id = await trouverChaineId(prof);
  if (!id) return null;
  const xml = await page(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
  const entrees = xml.split('<entry>').slice(1).map((e) => e.split('</entry>')[0]);
  return {
    chaineId: id,
    chaineNom: tag(xml.split('<entry>')[0], 'title'),
    chaineUrl: `https://www.youtube.com/channel/${id}`,
    avatar: '',
    videos: entrees.slice(0, MAX_VIDEOS).map((e) => {
      const vid = tag(e, 'yt:videoId');
      return {
        id: vid,
        titre: tag(e, 'title'),
        date: tag(e, 'published'),
        miniature: (e.match(/<media:thumbnail url="([^"]+)"/) || [])[1] || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
      };
    })
  };
}

console.log(KEY ? 'Mode : API YouTube (clé trouvée)' : 'Mode : flux RSS (pas de clé API)');

const profs = JSON.parse(await readFile('data/profs.json', 'utf8'));
const out = { maj: new Date().toISOString(), profs: {} };

for (const prof of profs) {
  try {
    const info = KEY ? await viaApi(prof) : await viaRss(prof);
    if (!info) { console.warn(`Chaîne introuvable : ${prof.id}`); continue; }
    out.profs[prof.id] = info;
    console.log(`OK ${prof.id} → ${info.chaineNom} (${info.videos.length} vidéos)`);
  } catch (e) {
    console.error(`Erreur ${prof.id} : ${e.message}`);
  }
}

await writeFile('data/videos.json', JSON.stringify(out, null, 2) + '\n');
console.log('data/videos.json écrit.');
