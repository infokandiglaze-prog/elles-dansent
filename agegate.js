// Vérification d'âge : le site est réservé aux 18 ans et plus.
(function () {
  var CLE = 'ellesdansent_18';
  var ok = false;
  try { ok = localStorage.getItem(CLE) === 'oui'; } catch (e) {}
  if (ok) return;

  var html = document.documentElement;
  html.classList.add('age-attente');
  var css = document.createElement('style');
  css.textContent =
    '.age-attente body{overflow:hidden}' +
    '.age-attente body>*:not(#porte-age){filter:blur(22px);pointer-events:none;user-select:none}' +
    '#porte-age{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(10,6,5,.86);font-family:Inter,system-ui,sans-serif}' +
    '#porte-age .boite{max-width:480px;width:100%;background:#0E0A12;border:1px solid #3A2A40;border-radius:28px;padding:36px;color:#FBF3F7;text-align:center;box-shadow:0 40px 80px -20px rgba(0,0,0,.8)}' +
    '#porte-age .badge{display:inline-flex;align-items:center;justify-content:center;width:72px;height:72px;border-radius:50%;background:#FF2E7E;color:#07050A;font:800 26px "Bricolage Grotesque",sans-serif;margin-bottom:18px}' +
    '#porte-age h2{font:800 30px/1.1 "Bricolage Grotesque",sans-serif;margin:0 0 12px;letter-spacing:-.02em}' +
    '#porte-age p{margin:0 0 26px;color:#D8C6D2;line-height:1.6}' +
    '#porte-age .actions{display:flex;flex-direction:column;gap:12px}' +
    '#porte-age button{min-height:52px;border-radius:999px;border:0;font:600 16px Inter,sans-serif;cursor:pointer}' +
    '#porte-age .oui{background:#FF2E7E;color:#07050A}' +
    '#porte-age .oui:hover{background:#FF7AB0}' +
    '#porte-age .non{background:transparent;color:#FBF3F7;border:1.5px solid #3A2A40}' +
    '#porte-age .non:hover{border-color:#FF2E7E}' +
    '#porte-age button:focus-visible{outline:3px solid #FF2E7E;outline-offset:3px}';
  document.head.appendChild(css);

  function afficher() {
    var porte = document.createElement('div');
    porte.id = 'porte-age';
    porte.setAttribute('role', 'dialog');
    porte.setAttribute('aria-modal', 'true');
    porte.setAttribute('aria-labelledby', 'porte-age-titre');
    porte.innerHTML =
      '<div class="boite">' +
        '<div class="badge" aria-hidden="true">18+</div>' +
        '<h2 id="porte-age-titre">Site réservé aux adultes</h2>' +
        '<p>Elles Dansent présente des vidéos de danse au contenu suggestif (twerk, wine, dancehall…). ' +
        'Tu dois avoir 18 ans ou plus pour entrer.</p>' +
        '<div class="actions">' +
          '<button type="button" class="oui">J\'ai 18 ans ou plus — Entrer</button>' +
          '<button type="button" class="non">J\'ai moins de 18 ans — Quitter</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(porte);
    porte.querySelector('.oui').addEventListener('click', function () {
      try { localStorage.setItem(CLE, 'oui'); } catch (e) {}
      porte.remove();
      html.classList.remove('age-attente');
    });
    porte.querySelector('.non').addEventListener('click', function () {
      location.href = 'https://www.google.com';
    });
    porte.querySelector('.oui').focus();
  }

  if (document.body) afficher();
  else document.addEventListener('DOMContentLoaded', afficher);
})();
