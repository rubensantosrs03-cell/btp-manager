export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(message, type = 'ok') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast show ${type}`;
  setTimeout(() => el.className = 'toast', 3500);
}

export function money(v) {
  return new Intl.NumberFormat('fr-LU', { style: 'currency', currency: 'EUR' }).format(Number(v || 0));
}

export function dateFmt(v) {
  if (!v) return '—';
  return new Intl.DateTimeFormat('fr-LU', { dateStyle: 'medium' }).format(new Date(v));
}

export function escapeHtml(str = '') {
  return String(str).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

export function openModal(html) {
  const modal = $('#modal');
  $('#modal-body').innerHTML = html;
  modal.showModal();
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); }, { once: true });
}

export function closeModal() {
  $('#modal').close();
  $('#modal-body').innerHTML = '';
}

export function skeleton(text = 'Chargement...') {
  return `<div class="empty"><div class="loader"></div><p>${text}</p></div>`;
}

export function emptyState(icon, title, text) {
  return `<div class="empty"><i class="ti ${icon}"></i><h3>${title}</h3><p>${text}</p></div>`;
}
