// Récupère les vidéos YouTube de chaque prof listée dans data/profs.json
// et écrit data/videos.json. Lancé chaque jour par GitHub Actions.
// Avec la clé API (secret YOUTUBE_API_KEY) : API YouTube officielle.
// Sans clé : flux RSS public de chaque chaîne (15 dernières vidéos, aucune clé nécessaire).

import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.YOUTUBE_API_KEY;
const MAX_VIDEOS = 12; // vidéos par prof
const API = 'https://www.googleapis.com/youtube/v3';
const ENTETES = { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'fr,en;q=0.8', Cookie: 'CONSENT=YES+1' };

// Seules les vidéos de danse sont gardées (pas de yoga, vlog, etc.)
const DANSE = /danc|danse|dansé|whin(e|ing)|\bwine\b|twerk|chor[ée]o|chor[ée]graph|dancehall|kompa|konpa|compas|amapiano|afrobeat|afro ?dance|soca|zouk|kizomba|ndombolo|azonto|coup[ée][ -]d[ée]cal[ée]|bachata|salsa|legwork|shaku|hip ?hop|bouyon|kuduro|mapouka|win(e|ing)\b|whine|booty|bubbl|gouyad|sensu|heels|waist|hips?\b.*(roll|shake|move)/i;
const ENFANTS = /\bkids?\b|ni[ñn][oa]s|\bchild|enfants?\b|\bteens?\b|\bjunior|foundation|infantil|\bbaby\b|\bmini\b|\bfamil(y|le)\b|daughter|\bma fille\b/i; // jamais de vidéos avec des enfants

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
  const list = await yt('playlistItems', { part: 'snippet,contentDetails', playlistId: uploads, maxResults: 50 });
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
  let xml = '';
  try { xml = await page(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`); }
  catch (e) { console.warn(`Flux RSS indisponible (${e.message}), lecture de la page de la chaîne.`); }
  if (xml.includes('<entry>')) {
    const entrees = xml.split('<entry>').slice(1).map((e) => e.split('</entry>')[0]);
    return {
      chaineId: id,
      chaineNom: tag(xml.split('<entry>')[0], 'title'),
      chaineUrl: `https://www.youtube.com/channel/${id}`,
      avatar: '',
      videos: entrees.map((e) => {
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
  return viaPageChaine(id);
}

// Plan C : liste des vidéos lue sur la page publique de la chaîne + titres via oEmbed
async function viaPageChaine(id, max = 40) {
  const html = await page(`https://www.youtube.com/channel/${id}/videos`);
  const ids = [...new Set([...html.matchAll(/"videoId":"([\w-]{11})"/g)].map((m) => m[1]))].slice(0, max);
  const avatar = (html.match(/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/) || [])[1] || '';
  let chaineNom = decode((html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || '');
  const videos = [];
  for (const vid of ids) {
    try {
      const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`, { headers: ENTETES });
      if (!r.ok) continue;
      const o = await r.json();
      chaineNom = chaineNom || o.author_name;
      videos.push({ id: vid, titre: o.title, date: '', miniature: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` });
    } catch {}
  }
  if (!videos.length) return null;
  return { chaineId: id, chaineNom, chaineUrl: `https://www.youtube.com/channel/${id}`, avatar, videos };
}

console.log(KEY ? 'Mode : API YouTube (clé trouvée)' : 'Mode : flux RSS (pas de clé API)');

const profs = JSON.parse(await readFile('data/profs.json', 'utf8'));
const out = { maj: new Date().toISOString(), profs: {} };
let ancien = { profs: {} };
try { ancien = JSON.parse(await readFile('data/videos.json', 'utf8')); } catch {}

for (const prof of profs) {
  try {
    const info = KEY ? await viaApi(prof) : await viaRss(prof);
    if (!info) {
      console.warn(`Chaîne introuvable : ${prof.id}`);
      if (ancien.profs?.[prof.id]) out.profs[prof.id] = ancien.profs[prof.id];
      continue;
    }
    const avant = info.videos.length;
    info.videos = info.videos.filter((v) => DANSE.test(v.titre || '') && !ENFANTS.test(v.titre || ''));
    if (info.videos.length < 4 && !KEY) {
      // Le flux RSS ne contient que les 15 dernières vidéos : on cherche plus loin sur la page de la chaîne
      try {
        const plus = await viaPageChaine(info.chaineId, 40);
        for (const v of plus?.videos || []) if (DANSE.test(v.titre) && !ENFANTS.test(v.titre) && !info.videos.some((x) => x.id === v.id)) info.videos.push(v);
      } catch (e) { console.warn(`Page de la chaîne illisible : ${e.message}`); }
    }
    if (prof.video_exemple && !info.videos.some((v) => v.id === prof.video_exemple)) {
      // La vidéo choisie à la main est toujours affichée en premier
      let titre = 'Vidéo';
      try { const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${prof.video_exemple}&format=json`, { headers: ENTETES }); if (r.ok) titre = (await r.json()).title; } catch {}
      info.videos.unshift({ id: prof.video_exemple, titre, date: '', miniature: `https://i.ytimg.com/vi/${prof.video_exemple}/hqdefault.jpg` });
    }
    info.videos = info.videos.slice(0, MAX_VIDEOS);
    console.log(`${prof.id} : ${avant} vidéos trouvées, ${info.videos.length} de danse gardées`);
    out.profs[prof.id] = info;
    console.log(`OK ${prof.id} → ${info.chaineNom} (${info.videos.length} vidéos)`);
  } catch (e) {
    console.error(`Erreur ${prof.id} : ${e.message}`);
    if (ancien.profs?.[prof.id]) out.profs[prof.id] = ancien.profs[prof.id]; // on garde les anciennes vidéos
  }
}

await writeFile('data/videos.json', JSON.stringify(out, null, 2) + '\n');
console.log('data/videos.json écrit.');
