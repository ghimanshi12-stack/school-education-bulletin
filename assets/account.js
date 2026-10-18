// Saved articles and sign-in.
// Saved articles are kept in this browser until the reader signs in; after that they are stored
// in Firebase (users/{uid}/saved/{itemId}) and follow the reader to any device.
// Sign-in only appears once assets/firebase-config.js has a Firebase config.
(function () {
  'use strict';

  const LOCAL_KEY = 'sep.saved';
  const FIELDS = ['id', 'title', 'url', 'source', 'published', 'section', 'themes', 'type', 'blurb', 'added'];
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const cfg = window.FIREBASE_CONFIG;
  const enabled = !!(cfg && cfg.apiKey);

  const listeners = [];
  let saved = new Map();
  let user = null;
  let ready = !enabled;
  let fb = null;
  let unsub = null;

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const emit = () => { renderButton(); listeners.forEach(f => f()); };

  // ---------- Local (signed-out) storage ----------
  function readLocal() {
    try { const v = JSON.parse(localStorage.getItem(LOCAL_KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function writeLocal() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify([...saved.values()])); } catch (e) { /* storage blocked */ }
  }
  function clearLocal() {
    try { localStorage.removeItem(LOCAL_KEY); } catch (e) { /* storage blocked */ }
  }
  const useLocal = () => { saved = new Map(readLocal().map(s => [s.id, s])); };

  // A copy of the card is saved, so it stays available after it drops out of data/items.json.
  function snapshot(it) {
    const s = {};
    FIELDS.forEach(k => { if (it[k] != null) s[k] = it[k]; });
    s.savedAt = new Date().toISOString();
    return s;
  }

  // ---------- Firebase ----------
  async function init() {
    try {
      const [app, auth, fs] = await Promise.all([
        import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')
      ]);
      const a = app.initializeApp(cfg);
      fb = { A: auth, F: fs, auth: auth.getAuth(a), db: fs.getFirestore(a) };
      auth.onAuthStateChanged(fb.auth, onUser);
    } catch (e) {
      console.error('Sign-in could not be loaded', e);
      ready = true; emit();
    }
  }

  async function onUser(u) {
    if (unsub) { unsub(); unsub = null; }
    user = u; ready = true;
    if (!u) { useLocal(); emit(); return; }
    const { F, db } = fb;
    const col = F.collection(db, 'users', u.uid, 'saved');
    // Move anything saved while signed out into the account.
    const local = readLocal();
    if (local.length) {
      try {
        await Promise.all(local.map(s => F.setDoc(F.doc(col, s.id), s, { merge: true })));
        clearLocal();
      } catch (e) { console.error('Could not copy saved articles to account', e); }
    }
    unsub = F.onSnapshot(col, snap => {
      saved = new Map(snap.docs.map(d => [d.id, d.data()]));
      emit();
    }, e => console.error('Could not load saved articles', e));
    emit();
  }

  function toggle(it) {
    if (!it || !it.id) return;
    const removing = saved.has(it.id);
    const snap = removing ? null : snapshot(it);
    removing ? saved.delete(it.id) : saved.set(it.id, snap);
    if (user && fb) {
      const ref = fb.F.doc(fb.db, 'users', user.uid, 'saved', it.id);
      (removing ? fb.F.deleteDoc(ref) : fb.F.setDoc(ref, snap)).catch(e => console.error('Could not update saved articles', e));
    } else {
      writeLocal();
    }
    emit();
  }

  // ---------- Sign-in button ----------
  function renderButton() {
    const el = $('account');
    if (!el) return;
    if (!enabled || !ready || (!fb && !user)) { el.innerHTML = ''; return; }
    el.innerHTML = user
      ? `<span class="who" title="${esc(user.email)}">${icon('user')}<span>${esc(user.email || 'Signed in')}</span></span>
         <button type="button" class="acct-btn" id="sign-out">${icon('logout')}<span>Sign out</span></button>`
      : `<button type="button" class="acct-btn primary" id="sign-in">${icon('user')}<span>Sign in</span></button>`;
  }

  // ---------- Sign-in dialog ----------
  const ERRORS = {
    'auth/invalid-credential': "That email and password don't match. Please try again.",
    'auth/wrong-password': "That email and password don't match. Please try again.",
    'auth/user-not-found': 'No account uses this email yet. Create one below.',
    'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
    'auth/weak-password': 'Please choose a password of at least 6 characters.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/missing-password': 'Please enter your password.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/operation-not-allowed': "This sign-in method hasn't been turned on yet.",
    'auth/unauthorized-domain': "Sign-in isn't allowed on this website address yet.",
    'auth/network-request-failed': 'Could not reach the sign-in service. Check your connection and try again.'
  };
  const MODES = {
    signin: { title: 'Sign in', sub: 'Sign in with your email to save articles and read them later on any device.', submit: 'Sign in', switchTo: 'New here? Create an account', pw: true },
    signup: { title: 'Create an account', sub: 'Use any email address. Your saved articles will be kept in your account.', submit: 'Create account', switchTo: 'Already have an account? Sign in', pw: true },
    reset: { title: 'Reset password', sub: "Enter your email and we'll send you a link to choose a new password.", submit: 'Send reset link', switchTo: 'Back to sign in', pw: false }
  };
  let mode = 'signin';

  function setMode(m) {
    mode = m;
    const M = MODES[m];
    $('auth-title').textContent = M.title;
    $('auth-sub').textContent = M.sub;
    $('auth-submit').textContent = M.submit;
    $('auth-mode').textContent = M.switchTo;
    $('auth-pw-row').hidden = !M.pw;
    $('auth-forgot').hidden = m !== 'signin';
    $('auth-password').autocomplete = m === 'signup' ? 'new-password' : 'current-password';
    msg('');
  }
  function msg(text, ok) {
    $('auth-msg').textContent = text;
    $('auth-msg').classList.toggle('ok', !!ok);
  }
  function busy(on) {
    ['auth-submit', 'auth-google'].forEach(id => { $(id).disabled = on; });
  }
  function openDialog() { setMode('signin'); $('auth-form').reset(); $('auth-dialog').showModal(); $('auth-email').focus(); }
  function closeDialog() { $('auth-dialog').close(); }

  async function submit(e) {
    e.preventDefault();
    const { A, auth } = fb;
    const email = $('auth-email').value.trim();
    const pw = $('auth-password').value;
    if (!email) { msg(ERRORS['auth/invalid-email']); return; }
    busy(true); msg('');
    try {
      if (mode === 'reset') {
        await A.sendPasswordResetEmail(auth, email);
        msg('If an account uses this email, a reset link is on its way. Check your inbox.', true);
      } else {
        await (mode === 'signup' ? A.createUserWithEmailAndPassword : A.signInWithEmailAndPassword)(auth, email, pw);
        closeDialog();
      }
    } catch (err) {
      msg(ERRORS[err.code] || 'Something went wrong. Please try again.');
    } finally { busy(false); }
  }

  async function google() {
    const { A, auth } = fb;
    busy(true); msg('');
    try {
      await A.signInWithPopup(auth, new A.GoogleAuthProvider());
      closeDialog();
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') msg(ERRORS[err.code] || 'Something went wrong. Please try again.');
    } finally { busy(false); }
  }

  function wire() {
    $('account').addEventListener('click', e => {
      if (e.target.closest('#sign-in')) openDialog();
      if (e.target.closest('#sign-out') && fb) fb.A.signOut(fb.auth);
    });
    $('auth-form').addEventListener('submit', submit);
    $('auth-google').addEventListener('click', google);
    $('auth-close').addEventListener('click', closeDialog);
    $('auth-forgot').addEventListener('click', () => setMode('reset'));
    $('auth-mode').addEventListener('click', () => setMode(mode === 'signin' ? 'signup' : 'signin'));
    $('auth-dialog').addEventListener('click', e => { if (e.target === $('auth-dialog')) closeDialog(); });
  }

  // ---------- Public API ----------
  window.Account = {
    enabled,
    signedIn: () => !!user,
    list: () => [...saved.values()],
    get: id => saved.get(id),
    has: id => saved.has(id),
    toggle,
    onChange: f => listeners.push(f)
  };

  useLocal();
  if (enabled) { wire(); init(); }
})();
