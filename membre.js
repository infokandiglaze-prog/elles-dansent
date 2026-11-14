// Comptes membres Babe Killa (Firebase Authentication).
// Les pages qui contiennent <meta name="babek-reserve" content="membres"> sont réservées aux membres connectés.
const config = window.BABEK_FIREBASE || (typeof firebaseConfig !== 'undefined' ? firebaseConfig : null);
const reserve = !!document.querySelector('meta[name="babek-reserve"][content="membres"]');

if (config) {
  const V = '10.12.2';
  const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const A = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
  const auth = A.getAuth(initializeApp(config));
  auth.languageCode = 'fr';

  const css = document.createElement('style');
  css.textContent = `
  .mb-voile{position:fixed;inset:0;z-index:150;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(7,5,10,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
  .mb-carte{width:100%;max-width:420px;background:#0E0A12;border:1px solid rgba(255,46,126,.35);border-radius:24px;padding:30px;box-shadow:0 30px 80px -30px rgba(255,46,126,.55);color:#FBF3F7;font:15px/1.5 Inter,system-ui,sans-serif;display:flex;flex-direction:column;gap:14px}
  .mb-carte img{width:64px;height:64px;border-radius:50%;margin:0 auto;box-shadow:0 0 18px rgba(255,46,126,.5)}
  .mb-carte h2{font:800 26px/1.1 'Bricolage Grotesque',sans-serif;text-align:center;margin:0}
  .mb-carte p{margin:0;color:#D8C6D2;text-align:center}
  .mb-btn{cursor:pointer;border:0;border-radius:999px;min-height:46px;padding:0 20px;font:600 15px Inter,sans-serif;width:100%}
  .mb-google{background:#fff;color:#1f1f1f}
  .mb-or{background:linear-gradient(135deg,#FF2E7E,#FF4D3D);color:#fff;box-shadow:0 10px 30px -8px rgba(255,46,126,.7)}
  .mb-carte input[type=email],.mb-carte input[type=password]{width:100%;box-sizing:border-box;min-height:46px;border-radius:14px;border:1px solid #3A2A40;background:#140E18;color:#FBF3F7;padding:0 14px;font:inherit}
  .mb-ligne{display:flex;align-items:center;gap:10px;color:#A8919F;font-size:13px}
  .mb-ligne::before,.mb-ligne::after{content:"";flex:1;height:1px;background:#241A2A}
  .mb-age{display:flex;gap:8px;align-items:flex-start;font-size:14px;color:#D8C6D2}
  .mb-lien{background:none;border:0;color:#FF7AB0;cursor:pointer;font:inherit;text-decoration:underline}
  .mb-err{color:#FF7AB0;font-size:14px;text-align:center;min-height:1em}
  .mb-compte{cursor:pointer}`;
  document.head.appendChild(css);

  const messages = {
    'auth/invalid-credential': 'Courriel ou mot de passe incorrect.',
    'auth/wrong-password': 'Mot de passe incorrect.',
    'auth/user-not-found': 'Aucun compte avec ce courriel.',
    'auth/email-already-in-use': 'Ce courriel a déjà un compte : connecte-toi.',
    'auth/weak-password': 'Le mot de passe doit avoir au moins 6 caractères.',
    'auth/invalid-email': 'Courriel invalide.',
    'auth/popup-closed-by-user': 'Connexion annulée.',
    'auth/unauthorized-domain': 'Ce site n’est pas encore autorisé dans Firebase.'
  };
  const msg = (e) => messages[e.code] || 'Une erreur est survenue. Réessaie.';

  let voile = null;
  function fermer() { if (voile) { voile.remove(); voile = null; } }
  function ouvrir() {
    if (voile) return;
    let creation = true;
    voile = document.createElement('div');
    voile.className = 'mb-voile';
    voile.setAttribute('role', 'dialog');
    voile.setAttribute('aria-modal', 'true');
    voile.setAttribute('aria-labelledby', 'mb-titre');
    voile.innerHTML = `
      <form class="mb-carte" novalidate>
        <img src="media/logo.svg" alt="">
        <h2 id="mb-titre">Section réservée aux membres</h2>
        <p>Crée ton compte gratuit pour voir tous les clips et le twerk du jour, mis à jour chaque jour.</p>
        <button type="button" class="mb-btn mb-google">Continuer avec Google</button>
        <div class="mb-ligne">ou avec ton courriel</div>
        <input type="email" name="courriel" placeholder="Courriel" autocomplete="email" required>
        <input type="password" name="mdp" placeholder="Mot de passe (6 caractères min.)" autocomplete="new-password" required>
        <label class="mb-age"><input type="checkbox" name="age"> J'ai 18 ans ou plus</label>
        <button type="submit" class="mb-btn mb-or">Créer mon compte gratuit</button>
        <p class="mb-err" aria-live="polite"></p>
        <p><button type="button" class="mb-lien mb-bascule">J'ai déjà un compte : me connecter</button></p>
        <p><a class="mb-lien" href="./">Retour à l'accueil</a></p>
      </form>`;
    document.body.appendChild(voile);
    const f = voile.querySelector('form');
    const err = voile.querySelector('.mb-err');
    const age = voile.querySelector('.mb-age');
    const bascule = () => {
      creation = !creation;
      voile.querySelector('.mb-or').textContent = creation ? 'Créer mon compte gratuit' : 'Me connecter';
      voile.querySelector('.mb-bascule').textContent = creation ? 'J’ai déjà un compte : me connecter' : 'Pas encore de compte ? En créer un';
      f.mdp.autocomplete = creation ? 'new-password' : 'current-password';
      age.style.display = creation ? '' : 'none';
      err.textContent = '';
    };
    voile.querySelector('.mb-bascule').addEventListener('click', bascule);
    voile.querySelector('.mb-google').addEventListener('click', async () => {
      err.textContent = '';
      try { await A.signInWithPopup(auth, new A.GoogleAuthProvider()); } catch (e) { err.textContent = msg(e); }
    });
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      err.textContent = '';
      if (creation && !f.age.checked) { err.textContent = 'Tu dois avoir 18 ans ou plus.'; return; }
      try {
        if (creation) await A.createUserWithEmailAndPassword(auth, f.courriel.value.trim(), f.mdp.value);
        else await A.signInWithEmailAndPassword(auth, f.courriel.value.trim(), f.mdp.value);
      } catch (e) { err.textContent = msg(e); }
    });
    f.courriel.focus();
  }

  // Bouton « Mon compte / Se connecter » dans le menu
  const menu = document.getElementById('menu');
  const lien = document.createElement('a');
  lien.href = '#';
  lien.className = 'mb-compte';
  if (menu) menu.insertBefore(lien, menu.querySelector('.btn'));
  lien.addEventListener('click', async (e) => {
    e.preventDefault();
    if (auth.currentUser) { await A.signOut(auth); } else { ouvrir(); }
  });

  A.onAuthStateChanged(auth, (u) => {
    lien.textContent = u ? 'Déconnexion' : 'Se connecter';
    if (u) fermer();
    else if (reserve) ouvrir();
  });
}
