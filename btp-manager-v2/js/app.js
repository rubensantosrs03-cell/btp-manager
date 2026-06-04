import { getSession, getProfile, listProjects, createProject, updateProject, deleteProject, tableList, tableInsert, tableUpdate, tableDelete, uploadPhoto, uploadDocument, publicUrl, db, subscribeToChat } from './supabase.js';
import { initAuth } from './auth.js';
import { $, $$, toast, openModal, closeModal, skeleton, emptyState, escapeHtml, dateFmt, money } from './ui.js';
import { STORAGE_BUCKETS, ROLES } from './config.js';

const state = {
  user: null,
  profile: null,
  projects: [],
  currentProject: null,
  view: 'dashboard',
  chatChannel: null
};

window.addEventListener('DOMContentLoaded', async () => {
  initAuth(bootstrap);
  registerServiceWorker();
  await bootstrap();
});

async function bootstrap() {
  try {
    const session = await getSession();
    if (!session) return showAuth();
    state.user = session.user;
    state.profile = await getProfile(session.user.id);
    $('#user-label').textContent = state.profile?.full_name || session.user.email;
    showApp();
    bindGlobalEvents();
    await loadProjects();
    setView('dashboard');
  } catch (err) {
    showAuth();
    toast(err.message, 'error');
  }
}

function showAuth() { $('#auth-screen').classList.remove('hidden'); $('#app').classList.add('hidden'); }
function showApp() { $('#auth-screen').classList.add('hidden'); $('#app').classList.remove('hidden'); }

function bindGlobalEvents() {
  $$('#main-nav button, #bottom-nav button').forEach(btn => btn.onclick = () => setView(btn.dataset.view));
  $('#new-project-btn').onclick = () => projectModal();
  $('#project-select').onchange = () => {
    state.currentProject = state.projects.find(p => p.id === $('#project-select').value) || null;
    updateContext();
    render();
  };
  $('#mobile-menu').onclick = () => $('.sidebar').classList.toggle('open');
}

async function loadProjects() {
  state.projects = await listProjects();
  state.currentProject = state.currentProject || state.projects[0] || null;
  renderProjectSelect();
  updateContext();
}

function renderProjectSelect() {
  $('#project-select').innerHTML = state.projects.length
    ? state.projects.map(p => `<option value="${p.id}" ${state.currentProject?.id === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')
    : '<option value="">Aucun projet</option>';
}

function updateContext() {
  $('#project-context').textContent = state.currentProject ? `${state.currentProject.name} · ${state.currentProject.status}` : 'Aucun projet sélectionné';
}

function setView(view) {
  state.view = view;
  $$('#main-nav button, #bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('#view-title').textContent = ({dashboard:'Dashboard',projects:'Projets',phases:'Phases',tasks:'Tâches',photos:'Photos',documents:'Documents',calendar:'Calendrier',chat:'Chat',reports:'Rapports',team:'Équipe'})[view] || view;
  render();
}

function needProject() {
  if (state.currentProject) return false;
  $('#content').innerHTML = emptyState('ti-building', 'Aucun chantier', 'Crée un projet pour commencer.');
  return true;
}

async function render() {
  try {
    if (state.view === 'dashboard') return renderDashboard();
    if (state.view === 'projects') return renderProjects();
    if (['phases','tasks','photos','documents','calendar','chat','reports','team'].includes(state.view) && needProject()) return;
    if (state.view === 'phases') return renderPhases();
    if (state.view === 'tasks') return renderTasks();
    if (state.view === 'photos') return renderPhotos();
    if (state.view === 'documents') return renderDocuments();
    if (state.view === 'calendar') return renderCalendar();
    if (state.view === 'chat') return renderChat();
    if (state.view === 'reports') return renderReports();
    if (state.view === 'team') return renderTeam();
  } catch (err) {
    $('#content').innerHTML = emptyState('ti-alert-triangle', 'Erreur', escapeHtml(err.message));
  }
}

async function renderDashboard() {
  $('#content').innerHTML = skeleton();
  const p = state.currentProject;
  let phases = [], photos = [], docs = [], events = [], tasks = [];
  if (p) {
    [phases, photos, docs, events] = await Promise.all([
      tableList('phases', p.id, 'sort_order'),
      tableList('photos', p.id),
      tableList('documents', p.id),
      tableList('events', p.id)
    ]);
    const allTasks = await Promise.all(phases.map(ph => tableList('phase_tasks', null).then(x => x.filter(t => t.phase_id === ph.id)).catch(() => [])));
    tasks = allTasks.flat();
  }
  const progress = p?.progress || Math.round((phases.reduce((a,b)=>a+(b.progress||0),0)/(phases.length||1)) || 0);
  $('#content').innerHTML = `
    <div class="kpi-grid">
      ${kpi('ti-building', 'Projets', state.projects.length)}
      ${kpi('ti-checkbox', 'Tâches', tasks.length)}
      ${kpi('ti-camera', 'Photos', photos.length)}
      ${kpi('ti-file-description', 'Documents', docs.length)}
      ${kpi('ti-trending-up', 'Avancement', `${progress}%`)}
      ${kpi('ti-calendar', 'Événements', events.length)}
    </div>
    <div class="grid two">
      <article class="card"><h3>Prochaines échéances</h3>${events.slice(0,5).map(e=>`<div class="row"><strong>${escapeHtml(e.title)}</strong><span>${dateFmt(e.event_date)}</span></div>`).join('') || '<p class="muted">Aucun événement</p>'}</article>
      <article class="card"><h3>Photos récentes</h3><div class="thumbs">${photos.slice(0,6).map(ph=>`<img src="${publicUrl(STORAGE_BUCKETS.photos, ph.storage_path)}" alt="${escapeHtml(ph.file_name)}">`).join('') || '<p class="muted">Aucune photo</p>'}</div></article>
    </div>`;
}

function kpi(icon, label, value) { return `<article class="kpi"><i class="ti ${icon}"></i><span>${label}</span><strong>${value}</strong></article>`; }

function renderProjects() {
  $('#content').innerHTML = `<div class="toolbar"><input id="project-search" placeholder="Rechercher un projet..."><button class="btn primary" id="add-project-inline"><i class="ti ti-plus"></i>Nouveau</button></div><div class="project-grid">${state.projects.map(projectCard).join('') || ''}</div>`;
  $('#add-project-inline').onclick = () => projectModal();
  $('#project-search').oninput = e => {
    const q = e.target.value.toLowerCase();
    $('.project-grid').innerHTML = state.projects.filter(p => `${p.name} ${p.address} ${p.client}`.toLowerCase().includes(q)).map(projectCard).join('');
    $$('.project-card').forEach(bindProjectCard);
  };
  $$('.project-card').forEach(bindProjectCard);
}

function projectCard(p) {
  return `<article class="project-card" data-id="${p.id}"><div class="project-banner"><span>${p.icon || '🏗️'}</span><b>${p.progress || 0}%</b></div><div class="project-body"><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.address || 'Adresse non renseignée')}</p><div class="progress"><span style="width:${p.progress||0}%"></span></div><small>${escapeHtml(p.status || 'planning')} · ${dateFmt(p.end_date)}</small></div></article>`;
}
function bindProjectCard(card) { card.onclick = () => { state.currentProject = state.projects.find(p => p.id === card.dataset.id); renderProjectSelect(); updateContext(); setView('dashboard'); }; }

function projectModal(project = null) {
  openModal(`<form id="project-form" class="modal-form"><h3>${project ? 'Modifier projet' : 'Nouveau projet'}</h3>
    <label>Nom<input name="name" required value="${escapeHtml(project?.name||'')}"></label>
    <label>Client<input name="client" value="${escapeHtml(project?.client||'')}"></label>
    <label>Adresse<input name="address" value="${escapeHtml(project?.address||'')}"></label>
    <div class="form-row"><label>Début<input name="start_date" type="date" value="${project?.start_date||''}"></label><label>Fin prévue<input name="end_date" type="date" value="${project?.end_date||''}"></label></div>
    <div class="form-row"><label>Surface m²<input name="surface_m2" type="number" value="${project?.surface_m2||''}"></label><label>Code accès<input name="access_code" value="${escapeHtml(project?.access_code||'chantier')}"></label></div>
    <label>Description<textarea name="description">${escapeHtml(project?.description||'')}</textarea></label>
    <div class="modal-actions"><button type="button" class="btn ghost" id="cancel-modal">Annuler</button><button class="btn primary">Enregistrer</button></div></form>`);
  $('#cancel-modal').onclick = closeModal;
  $('#project-form').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    if (payload.surface_m2 === '') delete payload.surface_m2;
    try {
      project ? await updateProject(project.id, payload) : await createProject(payload);
      closeModal(); await loadProjects(); render(); toast('Projet enregistré');
    } catch (err) { toast(err.message, 'error'); }
  };
}

async function renderPhases() {
  $('#content').innerHTML = skeleton();
  const phases = await tableList('phases', state.currentProject.id, 'sort_order');
  $('#content').innerHTML = `<div class="toolbar"><button class="btn primary" id="add-phase"><i class="ti ti-plus"></i>Phase</button></div><div class="list">${phases.map(phaseCard).join('') || emptyState('ti-list-check','Aucune phase','Ajoute les phases du chantier.')}</div>`;
  $('#add-phase').onclick = phaseModal;
  $$('.delete-phase').forEach(b => b.onclick = async e => { await tableDelete('phases', e.currentTarget.dataset.id); renderPhases(); });
}
function phaseCard(p) { return `<article class="card"><div class="row"><div><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.status)} · ${dateFmt(p.start_date)} → ${dateFmt(p.end_date)}</p></div><strong>${p.progress || 0}%</strong></div><div class="progress"><span style="width:${p.progress||0}%"></span></div><p>${escapeHtml(p.notes || '')}</p><button class="btn danger small delete-phase" data-id="${p.id}">Supprimer</button></article>`; }
function phaseModal() {
  openModal(`<form id="phase-form" class="modal-form"><h3>Nouvelle phase</h3><label>Nom<input name="name" required placeholder="Terrassement"></label><label>Status<select name="status"><option value="not-started">Planifié</option><option value="in-progress">En cours</option><option value="finished">Conclu</option><option value="delayed">Atrasado</option></select></label><div class="form-row"><label>Début<input name="start_date" type="date"></label><label>Fin<input name="end_date" type="date"></label></div><label>Notes<textarea name="notes"></textarea></label><div class="modal-actions"><button type="button" class="btn ghost" id="cancel-modal">Annuler</button><button class="btn primary">Créer</button></div></form>`);
  $('#cancel-modal').onclick = closeModal;
  $('#phase-form').onsubmit = async e => { e.preventDefault(); await tableInsert('phases', { ...Object.fromEntries(new FormData(e.target).entries()), project_id: state.currentProject.id }); closeModal(); renderPhases(); toast('Phase créée'); };
}

async function renderTasks() {
  $('#content').innerHTML = skeleton();
  const phases = await tableList('phases', state.currentProject.id, 'sort_order');
  if (!phases.length) return $('#content').innerHTML = emptyState('ti-list-check','Crée une phase avant','Les tâches sont liées aux phases.');
  const tasksByPhase = await Promise.all(phases.map(async ph => ({ ph, tasks: await tableList('phase_tasks', null).then(x => x.filter(t => t.phase_id === ph.id)).catch(()=>[]) })));
  $('#content').innerHTML = `<div class="toolbar"><button class="btn primary" id="add-task"><i class="ti ti-plus"></i>Tâche</button></div>${tasksByPhase.map(group => `<article class="card"><h3>${escapeHtml(group.ph.name)}</h3>${group.tasks.map(t=>`<label class="task"><input type="checkbox" data-id="${t.id}" ${t.done?'checked':''}> <span>${escapeHtml(t.description)}</span></label>`).join('') || '<p class="muted">Aucune tâche</p>'}</article>`).join('')}`;
  $('#add-task').onclick = () => taskModal(phases);
  $$('input[type="checkbox"][data-id]').forEach(c => c.onchange = async e => { await tableUpdate('phase_tasks', e.target.dataset.id, { done: e.target.checked, done_at: e.target.checked ? new Date().toISOString() : null }); toast('Tâche mise à jour'); });
}
function taskModal(phases) {
  openModal(`<form id="task-form" class="modal-form"><h3>Nouvelle tâche</h3><label>Phase<select name="phase_id">${phases.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select></label><label>Description<input name="description" required></label><div class="modal-actions"><button type="button" class="btn ghost" id="cancel-modal">Annuler</button><button class="btn primary">Créer</button></div></form>`);
  $('#cancel-modal').onclick = closeModal;
  $('#task-form').onsubmit = async e => { e.preventDefault(); await tableInsert('phase_tasks', Object.fromEntries(new FormData(e.target).entries())); closeModal(); renderTasks(); toast('Tâche créée'); };
}

async function renderPhotos() {
  $('#content').innerHTML = skeleton();
  const photos = await tableList('photos', state.currentProject.id);
  $('#content').innerHTML = `<div class="upload-zone"><input id="photo-files" type="file" accept="image/*" multiple capture="environment"><div><i class="ti ti-camera-plus"></i><h3>Ajouter photos</h3><p>Upload direct depuis caméra ou galerie</p></div></div><div class="gallery">${photos.map(ph => `<article class="photo"><img src="${publicUrl(STORAGE_BUCKETS.photos, ph.storage_path)}" alt="${escapeHtml(ph.description || ph.file_name)}"><div><strong>${escapeHtml(ph.description || ph.file_name)}</strong><small>${escapeHtml(ph.location_label || '')} · ${dateFmt(ph.created_at)}</small><a target="_blank" href="${publicUrl(STORAGE_BUCKETS.photos, ph.storage_path)}">Ouvrir</a></div></article>`).join('') || ''}</div>`;
  $('#photo-files').onchange = async e => {
    for (const file of e.target.files) await uploadPhoto(state.currentProject.id, file, { description: file.name });
    toast('Photos envoyées'); renderPhotos();
  };
}

async function renderDocuments() {
  $('#content').innerHTML = skeleton();
  const docs = await tableList('documents', state.currentProject.id);
  $('#content').innerHTML = `<div class="upload-zone"><input id="doc-files" type="file" multiple><div><i class="ti ti-file-upload"></i><h3>Ajouter documents</h3><p>PDF, DWG, DOCX, XLSX</p></div></div><div class="list">${docs.map(d => `<article class="card row"><div><h3>${escapeHtml(d.file_name)}</h3><p>${escapeHtml(d.doc_type || 'document')} · ${dateFmt(d.created_at)}</p></div><a class="btn" target="_blank" href="${publicUrl(STORAGE_BUCKETS.documents, d.storage_path)}">Ouvrir / Télécharger</a></article>`).join('') || emptyState('ti-file','Aucun document','Ajoute plans, PDFs ou DWG.')}</div>`;
  $('#doc-files').onchange = async e => { for (const file of e.target.files) await uploadDocument(state.currentProject.id, file, { doc_type: guessDocType(file.name) }); toast('Documents envoyés'); renderDocuments(); };
}
function guessDocType(name) { const n = name.toLowerCase(); if (n.endsWith('.pdf')) return 'plan'; if (n.endsWith('.dwg')) return 'plan'; if (n.endsWith('.xlsx')) return 'report'; return 'other'; }

async function renderCalendar() {
  $('#content').innerHTML = skeleton();
  const events = await tableList('events', state.currentProject.id, 'event_date');
  $('#content').innerHTML = `<div class="toolbar"><button id="add-event" class="btn primary"><i class="ti ti-plus"></i>Événement</button></div><div class="list">${events.map(e=>`<article class="card row"><div><h3>${escapeHtml(e.title)}</h3><p>${dateFmt(e.event_date)} ${e.event_time || ''} · ${escapeHtml(e.location || '')}</p><small>${escapeHtml(e.notes || '')}</small></div><span class="badge">${escapeHtml(e.event_type)}</span></article>`).join('') || emptyState('ti-calendar','Aucun événement','Planifie les réunions et livraisons.')}</div>`;
  $('#add-event').onclick = eventModal;
}
function eventModal() {
  openModal(`<form id="event-form" class="modal-form"><h3>Nouvel événement</h3><label>Titre<input name="title" required></label><label>Type<select name="event_type"><option value="meeting">Réunion</option><option value="delivery">Livraison</option><option value="inspection">Inspection</option><option value="deadline">Deadline</option><option value="safety">Sécurité</option><option value="client">Client</option></select></label><div class="form-row"><label>Date<input name="event_date" type="date" required></label><label>Heure<input name="event_time" type="time"></label></div><label>Lieu<input name="location"></label><label>Notes<textarea name="notes"></textarea></label><div class="modal-actions"><button type="button" class="btn ghost" id="cancel-modal">Annuler</button><button class="btn primary">Créer</button></div></form>`);
  $('#cancel-modal').onclick = closeModal;
  $('#event-form').onsubmit = async e => { e.preventDefault(); await tableInsert('events', { ...Object.fromEntries(new FormData(e.target).entries()), project_id: state.currentProject.id, created_by: state.user.id }); closeModal(); renderCalendar(); toast('Événement créé'); };
}

async function renderChat() {
  $('#content').innerHTML = skeleton();
  let rooms = await tableList('chat_rooms', state.currentProject.id);
  if (!rooms.length) {
    await tableInsert('chat_rooms', { project_id: state.currentProject.id, name: 'Général chantier', room_type: 'general' });
    rooms = await tableList('chat_rooms', state.currentProject.id);
  }
  const room = rooms[0];
  const messages = await tableList('chat_messages', null).then(x => x.filter(m => m.room_id === room.id)).catch(()=>[]);
  $('#content').innerHTML = `<section class="chat"><div id="messages">${messages.map(messageHtml).join('')}</div><form id="chat-form"><input id="chat-body" placeholder="Écrire un message..."><button class="btn primary">Envoyer</button></form></section>`;
  if (state.chatChannel) db.removeChannel(state.chatChannel);
  state.chatChannel = subscribeToChat(room.id, msg => { $('#messages').insertAdjacentHTML('beforeend', messageHtml(msg)); });
  $('#chat-form').onsubmit = async e => { e.preventDefault(); const body = $('#chat-body').value.trim(); if (!body) return; await tableInsert('chat_messages', { room_id: room.id, author_id: state.user.id, body }); $('#chat-body').value = ''; };
}
function messageHtml(m) { return `<div class="message"><strong>${m.author_id === state.user?.id ? 'Moi' : 'Utilisateur'}</strong><p>${escapeHtml(m.body)}</p><small>${dateFmt(m.created_at)}</small></div>`; }

async function renderReports() {
  const phases = await tableList('phases', state.currentProject.id, 'sort_order');
  const photos = await tableList('photos', state.currentProject.id);
  $('#content').innerHTML = `<article class="report card" id="report"><h1>Rapport chantier</h1><h2>${escapeHtml(state.currentProject.name)}</h2><p>${escapeHtml(state.currentProject.address || '')}</p><h3>Avancement</h3>${phases.map(phaseCard).join('')}<h3>Photos</h3><div class="thumbs">${photos.slice(0,12).map(ph=>`<img src="${publicUrl(STORAGE_BUCKETS.photos, ph.storage_path)}">`).join('')}</div></article><button class="btn primary" onclick="window.print()"><i class="ti ti-file-type-pdf"></i>Exporter PDF</button>`;
}

async function renderTeam() {
  const members = await tableList('project_members', state.currentProject.id).catch(()=>[]);
  $('#content').innerHTML = `<article class="card"><h3>Équipe du chantier</h3>${members.map(m=>`<div class="row"><span>${m.user_id}</span><b>${ROLES[m.role] || m.role}</b></div>`).join('') || '<p class="muted">Aucun membre listé.</p>'}</article>`;
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
}
