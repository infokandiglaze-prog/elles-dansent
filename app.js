// Elles Dansent — affiche les profs (data/profs.json) et leurs vidéos (data/videos.json).
// Aucune clé API ici : les vidéos sont récupérées par GitHub Actions.

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const thumbOf = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const PLAY = (taille, couleur) => `<svg aria-hidden="true" width="${taille}" height="${taille}" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="${couleur}"/></svg>`;
const quand = (d) => {
  if (!d) return '';
  const j = Math.floor((Date.now() - new Date(d)) / 864e5);
  if (isNaN(j)) return '';
  if (j < 1) return "aujourd'hui";
  if (j < 2) return 'hier';
  if (j < 30) return `il y a ${j} jours`;
  if (j < 365) return `il y a ${Math.floor(j / 30)} mois`;
  return `il y a ${Math.floor(j / 365)} an${j >= 730 ? 's' : ''}`;
};

let profs = [];
let filtre = 'Tous';
let texte = '';
let tri = 'recent';

async function charger() {
  const [p, v] = await Promise.all([
    fetch('data/profs.json').then((r) => r.json()),
    fetch('data/videos.json').then((r) => r.json()).catch(() => ({ profs: {} }))
  ]);
  profs = p.map((prof) => {
    const yt = v.profs?.[prof.id] || {};
    const videos = yt.videos?.length ? yt.videos
      : prof.video_exemple ? [{ id: prof.video_exemple, titre: 'Vidéo', miniature: thumbOf(prof.video_exemple) }] : [];
    const derniere = videos.reduce((m, x) => (x.date && x.date > m ? x.date : m), '');
    return {
      ...prof,
      nomAffiche: prof.nom || (yt.chaineNom || '').trim() || 'Prof de danse',
      avatar: yt.avatar || '',
      chaineUrl: yt.chaineUrl || (prof.video_exemple ? `https://youtu.be/${prof.video_exemple}` : '#'),
      videos,
      derniere
    };
  });
  if (v.maj) $('#maj').textContent = 'Vidéos mises à jour le ' + new Date(v.maj).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
  stats();
  vedette();
  rail();
  filtres();
  grille();
}

function compter(el, cible) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || cible < 2) { el.textContent = cible; return; }
  const t0 = performance.now();
  const pas = (t) => {
    const k = Math.min(1, (t - t0) / 1200);
    el.textContent = Math.round(cible * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(pas);
  };
  requestAnimationFrame(pas);
}

function stats() {
  compter($('#st-profs'), profs.length);
  compter($('#st-videos'), profs.reduce((n, p) => n + p.videos.length, 0));
  compter($('#st-styles'), new Set(profs.flatMap((p) => p.styles || [])).size);
}

function vedette() {
  const box = $('#vedette');
  if (!box) return;
  box.classList.add('hc-video-on');
  box.innerHTML = `
    <div class="hc-video">
      <video src="media/couverture_1.mp4" poster="media/couverture.jpg" autoplay muted loop playsinline preload="metadata"></video>
      <span class="hc-badge">En vedette</span>
      <button type="button" class="hc-son" aria-label="Activer le son">Son off</button>
    </div>`;
  const vid = box.querySelector('video');
  const son = box.querySelector('.hc-son');
  son.addEventListener('click', () => {
    vid.muted = !vid.muted;
    if (!vid.muted) vid.play();
    son.textContent = vid.muted ? 'Son off' : 'Son on';
    son.setAttribute('aria-label', vid.muted ? 'Activer le son' : 'Couper le son');
  });
  vid.addEventListener('error', () => { box.classList.remove('hc-video-on'); vedetteProf(); });
}

function vedetteProf() {
  const p = [...profs].sort((a, b) => (b.derniere || '').localeCompare(a.derniere || ''))[0];
  if (!p) return;
  const v = p.videos[0];
  $('#vedette').innerHTML = `
    <button type="button" data-id="${esc(p.id)}" aria-label="Voir la fiche de ${esc(p.nomAffiche)}">
      <span class="hc-media" style="background-image:url('${esc(v?.miniature || '')}')">
        <span class="hc-badge">Prof à l'honneur</span>
        <span class="hc-play">${PLAY(30, '#120C0A')}</span>
        <span class="hc-body">
          <span class="hc-nom">${esc(p.nomAffiche)}</span>
          <span class="hc-sub">${esc((p.styles || []).join(' · '))}${p.niveau ? ' — ' + esc(p.niveau) : ''}</span>
        </span>
      </span>
    </button>`;
  $('#vedette button').addEventListener('click', () => ouvrir(p.id));
}

function rail() {
  const toutes = profs.flatMap((p) => p.videos.map((v) => ({ ...v, prof: p })))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 16);
  $('#rail').innerHTML = toutes.map((v) => `
    <button type="button" class="vcard" data-id="${esc(v.prof.id)}" data-v="${esc(v.id)}">
      <span class="vthumb" style="background-image:url('${esc(v.miniature || thumbOf(v.id))}')"></span>
      <span class="vtitre">${esc(v.titre)}</span>
      <span class="vmeta">${esc(v.prof.nomAffiche)}${v.date ? ' · ' + quand(v.date) : ''}</span>
    </button>`).join('');
  $('#rail').querySelectorAll('.vcard').forEach((b) => b.addEventListener('click', () => ouvrir(b.dataset.id, b.dataset.v)));
  const defiler = (sens) => $('#rail').scrollBy({ left: sens * $('#rail').clientWidth * 0.9, behavior: 'smooth' });
  $('#prev').onclick = () => defiler(-1);
  $('#next').onclick = () => defiler(1);
}

function filtres() {
  const compte = {};
  profs.forEach((p) => (p.styles || []).forEach((s) => { compte[s] = (compte[s] || 0) + 1; }));
  const styles = [['Tous', profs.length], ...Object.entries(compte).sort((a, b) => b[1] - a[1])];
  $('#filtres').innerHTML = styles.map(([s, n]) =>
    `<button type="button" class="scard" aria-pressed="${s === filtre}" data-s="${esc(s)}"><b>${esc(s)}</b><span>${n} prof${n > 1 ? 's' : ''}</span></button>`).join('');
  $('#filtres').querySelectorAll('.scard').forEach((b) => b.addEventListener('click', () => {
    filtre = b.dataset.s; filtres(); grille();
    $('#profs').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));
}

function grille() {
  const t = texte.toLowerCase().trim();
  const liste = profs.filter((p) =>
    (filtre === 'Tous' || (p.styles || []).includes(filtre)) &&
    (!t || [p.nomAffiche, p.niveau, p.langue, p.pays, ...(p.styles || []), ...p.videos.map((v) => v.titre)].join(' ').toLowerCase().includes(t)));
  liste.sort((a, b) => tri === 'nom' ? a.nomAffiche.localeCompare(b.nomAffiche, 'fr')
    : tri === 'videos' ? b.videos.length - a.videos.length
    : (b.derniere || '').localeCompare(a.derniere || ''));
  $('#compteur').textContent = `${liste.length} prof${liste.length > 1 ? 's' : ''}${filtre === 'Tous' ? ' au répertoire' : ' en ' + filtre}${t ? ` pour « ${texte.trim()} »` : ''}`;
  $('#grille').innerHTML = liste.length ? liste.map((p) => `
    <button type="button" class="card" data-id="${esc(p.id)}">
      <span class="thumb" style="background-image:url('${esc(p.videos[0]?.miniature || '')}')"><span class="play">${PLAY(22, '#120C0A')}</span></span>
      <span class="card-body">
        <span class="who">
          <span class="avatar" style="background-image:url('${esc(p.avatar || p.videos[0]?.miniature || '')}')"></span>
          <span><span class="nm">${esc(p.nomAffiche)}</span><br><span class="mt">${esc([p.pays, p.langue && 'cours en ' + p.langue].filter(Boolean).join(' · '))}</span></span>
        </span>
        <span class="tags">${(p.styles || []).map((s) => `<span class="tag">${esc(s)}</span>`).join('')}${p.niveau ? `<span class="tag o">${esc(p.niveau)}</span>` : ''}</span>
        <span class="mt">${p.videos.length} cours vidéo${p.derniere ? ' · dernier ' + quand(p.derniere) : ''}</span>
      </span>
    </button>`).join('') : '<p class="vide">Aucune prof pour ce choix… pour l\'instant !</p>';
  $('#grille').querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => ouvrir(c.dataset.id)));
}

function jouer(p, id) {
  const v = p.videos.find((x) => x.id === id) || p.videos[0];
  if (!v) return;
  $('#lecteur').innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}?rel=0&autoplay=1" title="${esc(v.titre)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  $('#fiche-titre').textContent = v.titre;
  document.querySelectorAll('.vid').forEach((b) => b.setAttribute('aria-current', b.dataset.v === v.id));
}

function ouvrir(id, videoId) {
  const p = profs.find((x) => x.id === id);
  if (!p) return;
  $('#fiche-nom').textContent = p.nomAffiche;
  $('#fiche-meta').textContent = [(p.styles || []).join(', '), p.niveau, p.pays, p.langue && 'cours en ' + p.langue].filter(Boolean).join(' · ');
  $('#fiche-avatar').src = p.avatar || p.videos[0]?.miniature || '';
  $('#fiche-chaine').href = p.chaineUrl;
  $('#fiche-videos').innerHTML = p.videos.map((v) =>
    `<button type="button" class="vid" data-v="${esc(v.id)}"><img src="${esc(v.miniature || thumbOf(v.id))}" alt="" loading="lazy"><span>${esc(v.titre)}</span></button>`).join('');
  $('#fiche-videos').querySelectorAll('.vid').forEach((b) => b.addEventListener('click', () => jouer(p, b.dataset.v)));
  jouer(p, videoId);
  $('#fiche').showModal();
}

// Interface générale
$('#fermer').addEventListener('click', () => $('#fiche').close());
$('#fiche').addEventListener('click', (e) => { if (e.target === $('#fiche')) $('#fiche').close(); });
$('#fiche').addEventListener('close', () => { $('#lecteur').innerHTML = ''; });
$('#recherche').addEventListener('input', (e) => { texte = e.target.value; grille(); });
$('#recherche').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#profs').scrollIntoView({ behavior: 'smooth' }); });
$('#tri').addEventListener('change', (e) => { tri = e.target.value; grille(); });
$('#annee').textContent = new Date().getFullYear();

const burger = $('#burger');
burger.addEventListener('click', () => {
  const ouvert = $('#menu').classList.toggle('ouvert');
  burger.setAttribute('aria-expanded', ouvert);
});
$('#menu').querySelectorAll('a').forEach((a) => a.addEventListener('click', () => { $('#menu').classList.remove('ouvert'); burger.setAttribute('aria-expanded', false); }));

addEventListener('scroll', () => $('#nav').classList.toggle('scrolled', scrollY > 10), { passive: true });

const obs = new IntersectionObserver((entrees) => entrees.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add('vu'); obs.unobserve(e.target); }
}), { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el) => obs.observe(el));

charger();
