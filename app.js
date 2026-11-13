// Elles Dansent — affiche les profs (data/profs.json) et leurs vidéos (data/videos.json).
// Aucune clé API ici : les vidéos sont récupérées par GitHub Actions.

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const thumbOf = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const PLAY = '<svg aria-hidden="true" width="60" height="42" viewBox="0 0 60 42"><rect width="60" height="42" rx="12" fill="#1A1210" fill-opacity=".75"/><path d="M24 13l14 8-14 8z" fill="#F6EDE3"/></svg>';

let profs = [];
let filtre = 'Tous';
let texte = '';

async function charger() {
  const [p, v] = await Promise.all([
    fetch('data/profs.json').then((r) => r.json()),
    fetch('data/videos.json').then((r) => r.json()).catch(() => ({ profs: {} }))
  ]);
  profs = p.map((prof) => {
    const yt = v.profs?.[prof.id] || {};
    const videos = yt.videos?.length ? yt.videos
      : prof.video_exemple ? [{ id: prof.video_exemple, titre: 'Vidéo', miniature: thumbOf(prof.video_exemple) }] : [];
    return {
      ...prof,
      nomAffiche: prof.nom || yt.chaineNom || 'Prof de danse',
      avatar: yt.avatar || '',
      chaineUrl: yt.chaineUrl || (prof.video_exemple ? `https://youtu.be/${prof.video_exemple}` : '#'),
      videos
    };
  });
  if (v.maj) $('#maj').textContent = 'Vidéos mises à jour le ' + new Date(v.maj).toLocaleDateString('fr-CA');
  filtres();
  grille();
}

function filtres() {
  const styles = ['Tous', ...new Set(profs.flatMap((p) => p.styles || []))];
  $('#filtres').innerHTML = styles.map((s) =>
    `<button type="button" class="pill" aria-pressed="${s === filtre}" data-s="${esc(s)}">${esc(s)}</button>`).join('');
  $('#filtres').querySelectorAll('.pill').forEach((b) => b.addEventListener('click', () => { filtre = b.dataset.s; filtres(); grille(); }));
}

function grille() {
  const t = texte.toLowerCase();
  const liste = profs.filter((p) =>
    (filtre === 'Tous' || (p.styles || []).includes(filtre)) &&
    (!t || [p.nomAffiche, p.niveau, p.langue, p.pays, ...(p.styles || [])].join(' ').toLowerCase().includes(t)));
  $('#compteur').textContent = `${liste.length} prof${liste.length > 1 ? 's' : ''}${filtre === 'Tous' ? ' au répertoire' : ' en ' + filtre}`;
  $('#grille').innerHTML = liste.length ? liste.map((p) => `
    <button type="button" class="card" data-id="${esc(p.id)}">
      <span class="thumb" style="background-image:url('${esc(p.videos[0]?.miniature || '')}')">${PLAY}</span>
      <span class="card-body">
        <span class="tags">${(p.styles || []).map((s) => `<span class="tag">${esc(s)}</span>`).join('')}<span class="tag o">${esc(p.niveau)}</span></span>
        <span class="nm">${esc(p.nomAffiche)}</span>
        <span class="mt">${esc([p.pays, p.langue && 'cours en ' + p.langue].filter(Boolean).join(' · '))}</span>
        <span class="mt">${p.videos.length} vidéo${p.videos.length > 1 ? 's' : ''} — voir la fiche →</span>
      </span>
    </button>`).join('') : '<p class="vide">Aucune prof pour ce choix… pour l\'instant !</p>';
  $('#grille').querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => ouvrir(c.dataset.id)));
}

function jouer(id) {
  $('#lecteur').innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0" title="Lecteur YouTube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  document.querySelectorAll('.vid').forEach((b) => b.setAttribute('aria-current', b.dataset.v === id));
}

function ouvrir(id) {
  const p = profs.find((x) => x.id === id);
  if (!p) return;
  $('#fiche-nom').textContent = p.nomAffiche;
  $('#fiche-meta').textContent = [(p.styles || []).join(', '), p.niveau, p.pays].filter(Boolean).join(' · ');
  $('#fiche-avatar').src = p.avatar || p.videos[0]?.miniature || '';
  $('#fiche-chaine').href = p.chaineUrl;
  $('#fiche-videos').innerHTML = p.videos.map((v) =>
    `<button type="button" class="vid" data-v="${esc(v.id)}"><img src="${esc(v.miniature || thumbOf(v.id))}" alt="" loading="lazy"><span>${esc(v.titre)}</span></button>`).join('');
  $('#fiche-videos').querySelectorAll('.vid').forEach((b) => b.addEventListener('click', () => jouer(b.dataset.v)));
  if (p.videos[0]) jouer(p.videos[0].id);
  $('#fiche').showModal();
}

$('#fermer').addEventListener('click', () => $('#fiche').close());
$('#fiche').addEventListener('close', () => { $('#lecteur').innerHTML = ''; });
$('#recherche').addEventListener('input', (e) => { texte = e.target.value; grille(); });
$('#annee').textContent = new Date().getFullYear();
charger();
