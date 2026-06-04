import { $, toast } from './ui.js';
import { signIn, signUp, signOut, resetPassword } from './supabase.js';

export function initAuth(onReady) {
  $('#login-tab').onclick = () => switchAuth('login');
  $('#signup-tab').onclick = () => switchAuth('signup');

  $('#login-form').onsubmit = async e => {
    e.preventDefault();
    try {
      await signIn($('#login-email').value.trim(), $('#login-password').value);
      toast('Connexion réussie');
      onReady();
    } catch (err) { toast(err.message, 'error'); }
  };

  $('#signup-form').onsubmit = async e => {
    e.preventDefault();
    try {
      await signUp($('#signup-email').value.trim(), $('#signup-password').value, $('#signup-name').value.trim(), $('#signup-role').value);
      toast('Compte créé. Vérifie ton email si confirmation activée.');
      onReady();
    } catch (err) { toast(err.message, 'error'); }
  };

  $('#forgot-password').onclick = async () => {
    const email = $('#login-email').value.trim();
    if (!email) return toast('Entre ton email avant.', 'error');
    try { await resetPassword(email); toast('Email de récupération envoyé'); }
    catch (err) { toast(err.message, 'error'); }
  };

  $('#logout-btn').onclick = async () => {
    await signOut();
    location.reload();
  };
}

function switchAuth(mode) {
  $('#login-tab').classList.toggle('active', mode === 'login');
  $('#signup-tab').classList.toggle('active', mode === 'signup');
  $('#login-form').classList.toggle('hidden', mode !== 'login');
  $('#signup-form').classList.toggle('hidden', mode !== 'signup');
}
