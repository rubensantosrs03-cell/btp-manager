/* ================================================================
   BTP MANAGER — APP.JS
   Full application logic — modular, production-ready
   Compatible with existing Supabase schema
   ================================================================ */

'use strict';

/* ════════════════════════════════════════════════════════════════
   STATE — single source of truth
   ════════════════════════════════════════════════════════════════ */
const S = {
  user:          null,
  profile:       null,
  projects:      [],
  activeProject: null,
  bordereau:     [],
  phases:        [],
  phaseTasks:    {},       // phaseId → task[]
  photos:        [],
  documents:     [],
  events:        [],
  chatRooms:     [],
  activeRoom:    null,
  messages:      [],
  team:          [],

  calYear:  new Date().getFullYear(),
  calMonth: new Date().getMonth(),

  bordFilter:   'all',
  invoiceSel:   new Set(),
  selectedPhotoFiles: [],
  selectedDocFile:    null,
  selectedPhaseColor: '#f0a500',

  realtimeSub: null,
};

/* ════════════════════════════════════════════════════════════════
   UTILITIES
   ════════════════════════════════════════════════════════════════ */
const Utils = {
  $: id => document.getElementById(id),
  $$: sel => document.querySelectorAll(sel),

  fmt(n, dec = 0) {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    }).format(n);
  },
  fmtEur(n) { return '€\u202F' + this.fmt(n); },
  fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; },
  fmtDateTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  },
  fmtTime(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  },

  initials(name) {
    return (name || '?').split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
  },
  avatarColor(name) {
    const colors = ['#f0a500','#34d399','#f87171','#60a5fa','#a78bfa','#fb923c'];
    let h = 0;
    for (const c of name || '?') h = (h * 31 + c.charCodeAt(0)) % colors.length;
    return colors[h];
  },

  roleLabel(r) {
    return { admin:'Admin', conducteur:'Conducteur de travaux', chef:'Chef de chantier',
      metre:'Métreur', equipe:"Chef d'équipe", viewer:'Viewer' }[r] || r;
  },
  roleBadge(r) {
    return `<span class="badge b-r-${r}">${this.roleLabel(r)}</span>`;
  },
  statusBadge(s) {
    const map = {
      active:       '<span class="badge b-active">En cours</span>',
      planning:     '<span class="badge b-planning">Planifié</span>',
      delayed:      '<span class="badge b-delayed">Retard</span>',
      done:         '<span class="badge b-done">Terminé</span>',
      paused:       '<span class="badge b-paused">En pause</span>',
      'not-started':'<span class="badge b-not-started">Pas commencé</span>',
      'in-progress':'<span class="badge b-in-progress">En cours</span>',
      finished:     '<span class="badge b-finished">Terminé</span>',
      invoiced:     '<span class="badge b-invoiced">Facturé</span>',
    };
    return map[s] || `<span class="badge b-paused">${s}</span>`;
  },
  progColor(p) { return p >= 75 ? 'var(--green)' : p >= 40 ? 'var(--accent)' : 'var(--red)'; },

  setBtn(id, loading, label = '') {
    const b = this.$(id);
    if (!b) return;
    if (loading) {
      b.dataset.orig = b.innerHTML;
      b.innerHTML = `<span class="spin-inline"></span>${label ? ' ' + label : ''}`;
      b.disabled = true;
    } else {
      b.innerHTML = b.dataset.orig || label;
      b.disabled = false;
    }
  },

  clearForm(ids) { ids.forEach(id => { const el = this.$(id); if (el) el.value = ''; }); },

  togglePwd(inputId, btn) {
    const inp = this.$(inputId);
    if (!inp) return;
    const isText = inp.type === 'text';
    inp.type = isText ? 'password' : 'text';
    btn.querySelector('i').className = isText ? 'ti ti-eye' : 'ti ti-eye-off';
  },

  showErr(id, msg) {
    const el = this.$(id);
    if (!el) return;
    el.querySelector('span').textContent = msg;
    el.classList.remove('hidden');
  },
  hideErr(id) {
    const el = this.$(id);
    if (el) el.classList.add('hidden');
  },

  // Debounce helper
  debounce(fn, ms = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  },
};

/* ════════════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ════════════════════════════════════════════════════════════════ */
const Toast = {
  show(msg, type = 'ok', duration = 3200) {
    const icons = { ok: 'ti-check-circle', er: 'ti-x-circle', wn: 'ti-alert-triangle', in: 'ti-info-circle' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="ti ${icons[type] || 'ti-check-circle'}"></i>${msg}`;
    const area = Utils.$('toast-container');
    if (area) area.appendChild(el);
    setTimeout(() => el.remove(), duration);
  },
  ok: (msg)   => Toast.show(msg, 'ok'),
  err: (msg)  => Toast.show(msg, 'er', 4000),
  warn: (msg) => Toast.show(msg, 'wn'),
  info: (msg) => Toast.show(msg, 'in'),
};

/* ════════════════════════════════════════════════════════════════
   MODALS
   ════════════════════════════════════════════════════════════════ */
const Modals = {
  open(id) { Utils.$(id)?.classList.add('open'); },
  close(id) { Utils.$(id)?.classList.remove('open'); },
  closeAll() { Utils.$$('.modal-backdrop.open').forEach(m => m.classList.remove('open')); },
};
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') Modals.closeAll();
});

/* ════════════════════════════════════════════════════════════════
   NAVIGATION
   ════════════════════════════════════════════════════════════════ */
const Nav = {
  panelConfig: {
    dashboard:  { title: 'Tableau de bord',    action: 'modal-project',  actionLabel: 'Nouveau projet' },
    projets:    { title: 'Projets / Chantiers', action: 'modal-project',  actionLabel: 'Nouveau projet' },
    bordereau:  { title: 'Bordereau / Métré',  action: 'modal-position', actionLabel: 'Position' },
    phases:     { title: 'Phases de l\'œuvre', action: 'modal-phase',    actionLabel: 'Phase' },
    photos:     { title: 'Photos',             action: 'modal-photo',    actionLabel: 'Photos' },
    documents:  { title: 'Documents / Plans',  action: 'modal-document', actionLabel: 'Document' },
    planning:   { title: 'Planning Gantt',     action: null },
    calendar:   { title: 'Calendrier',         action: 'modal-event',    actionLabel: 'Événement' },
    chat:       { title: 'Chatrooms',          action: null },
    rapports:   { title: 'Rapports',           action: null },
    equipe:     { title: 'Équipe',             action: 'modal-member',   actionLabel: 'Membre' },
  },

  show(panelId) {
    // Panels
    Utils.$$('.panel').forEach(p => p.classList.remove('active'));
    Utils.$(`panel-${panelId}`)?.classList.add('active');

    // Sidebar links
    Utils.$$('.sb-link').forEach(l => l.classList.toggle('active', l.dataset.panel === panelId));

    // Topbar
    const cfg = this.panelConfig[panelId] || {};
    Utils.$('topbar-title').textContent = cfg.title || panelId;
    const bc = Utils.$('topbar-bc');
    if (bc) bc.textContent = S.activeProject && !['dashboard','projets','equipe','rapports'].includes(panelId)
      ? '/ ' + S.activeProject.name : '';

    // Action button
    const btn = Utils.$('topbar-action');
    const lbl = Utils.$('topbar-action-label');
    if (btn && lbl) {
      if (cfg.action) {
        btn.style.display = '';
        lbl.textContent = cfg.actionLabel || 'Nouveau';
        btn._action = cfg.action;
      } else {
        btn.style.display = 'none';
      }
    }

    // Clear chat badge
    if (panelId === 'chat') {
      const badge = Utils.$('sb-chat-badge');
      if (badge) { badge.classList.add('hidden'); badge.textContent = '0'; }
      Utils.$('notif-dot')?.classList.add('hidden');
    }

    // Close mobile sidebar
    this.closeMobileSidebar();
  },

  topbarAction() {
    const btn = Utils.$('topbar-action');
    if (btn?._action) Modals.open(btn._action);
  },

  openMobileSidebar() {
    Utils.$('sidebar')?.classList.add('mobile-open');
    Utils.$('sb-overlay')?.classList.add('visible');
  },
  closeMobileSidebar() {
    Utils.$('sidebar')?.classList.remove('mobile-open');
    Utils.$('sb-overlay')?.classList.remove('visible');
  },

  toggleUserMenu() {
    Utils.$('user-dropdown')?.classList.toggle('hidden');
  },

  updateSidebarProject(proj) {
    const badge = Utils.$('sb-proj-badge');
    if (!badge) return;
    if (proj) {
      badge.classList.remove('hidden');
      Utils.$('sb-proj-name').textContent = proj.name;
      Utils.$('sb-proj-meta').textContent = (proj.status === 'active' ? 'En cours' : 'Planifié') + ' · ' + proj.progress + '%';
      const dot = Utils.$('sb-proj-dot');
      if (dot) dot.style.background = proj.status === 'delayed' ? 'var(--red)' : proj.status === 'active' ? 'var(--green)' : 'var(--amber)';
    } else {
      badge.classList.add('hidden');
    }
  },
};

// Wire up sidebar links
document.querySelectorAll('.sb-link[data-panel]').forEach(el => {
  el.addEventListener('click', () => Nav.show(el.dataset.panel));
});

/* ════════════════════════════════════════════════════════════════
   LOADING SCREEN
   ════════════════════════════════════════════════════════════════ */
const Loading = {
  setMsg(msg) {
    const el = Utils.$('loading-msg');
    if (el) el.textContent = msg;
  },
  hide() {
    const el = Utils.$('loading-screen');
    if (!el) return;
    el.classList.add('out');
    setTimeout(() => (el.style.display = 'none'), 500);
  },
};

/* ════════════════════════════════════════════════════════════════
   AUTH
   ════════════════════════════════════════════════════════════════ */
const Auth = {
  goStep(id) {
    Utils.$$('.auth-step').forEach(s => s.classList.remove('active'));
    Utils.$(id)?.classList.add('active');
  },

  switchTab(tab) {
    Utils.$('tab-login')?.classList.toggle('active', tab === 'login');
    Utils.$('tab-signup')?.classList.toggle('active', tab === 'signup');
    Utils.$('form-login')?.classList.toggle('hidden', tab !== 'login');
    Utils.$('form-signup')?.classList.toggle('hidden', tab !== 'signup');
  },

  async login() {
    const email = Utils.$('l-email')?.value.trim();
    const pass  = Utils.$('l-pass')?.value;
    if (!email || !pass) { Utils.showErr('login-err', 'Email et mot de passe requis.'); return; }
    Utils.hideErr('login-err');
    Utils.setBtn('btn-login', true, 'Connexion…');
    const { error } = await DB.auth.signInWithPassword({ email, password: pass });
    Utils.setBtn('btn-login', false);
    if (error) Utils.showErr('login-err', error.message);
    // onAuthStateChange handles the rest
  },

  async signup() {
    const first = Utils.$('s-first')?.value.trim();
    const last  = Utils.$('s-last')?.value.trim();
    const email = Utils.$('s-email')?.value.trim();
    const pass  = Utils.$('s-pass')?.value;
    const role  = Utils.$('s-role')?.value;
    if (!first || !last || !email || !pass) { Utils.showErr('signup-err', 'Tous les champs sont requis.'); return; }
    if (pass.length < 8) { Utils.showErr('signup-err', 'Mot de passe minimum 8 caractères.'); return; }
    Utils.hideErr('signup-err');
    Utils.setBtn('btn-signup', true, 'Création…');
    const { error } = await DB.auth.signUp({
      email, password: pass,
      options: { data: { full_name: `${first} ${last}`, role } },
    });
    Utils.setBtn('btn-signup', false);
    if (error) { Utils.showErr('signup-err', error.message); }
    else {
      Toast.ok('Compte créé ! Vérifiez votre email pour confirmer.');
      this.switchTab('login');
    }
  },

  codeNav(i) {
    const v = Utils.$('cd' + i)?.value;
    if (v && i < 3) Utils.$('cd' + (i + 1))?.focus();
    if (v && i === 3) Auth.checkCode();
  },
  codeDel(i, e) {
    if (e.key === 'Backspace' && !Utils.$('cd' + i)?.value && i > 0) {
      const prev = Utils.$('cd' + (i - 1));
      if (prev) { prev.value = ''; prev.focus(); }
    }
  },
  getCode() { return [0,1,2,3].map(i => Utils.$('cd' + i)?.value || '').join(''); },

  async checkCode() {
    const projId = Utils.$('code-project-sel')?.value;
    const code   = this.getCode();
    if (!projId) { Toast.warn('Sélectionnez un projet.'); return; }
    if (code.length < 4) { Utils.$('code-err')?.classList.remove('hidden'); return; }
    Utils.$('code-err')?.classList.add('hidden');
    Utils.setBtn('btn-code', true, 'Vérification…');

    const { data: proj, error } = await DB
      .from('projects')
      .select('*')
      .eq('id', projId)
      .eq('access_code', code)
      .single();

    Utils.setBtn('btn-code', false);
    if (error || !proj) { Utils.$('code-err')?.classList.remove('hidden'); return; }

    // Grant membership
    if (S.user) {
      await DB.from('project_members').upsert(
        { project_id: proj.id, user_id: S.user.id, role: S.profile?.role || 'viewer' },
        { onConflict: 'project_id,user_id' }
      );
    }
    S.activeProject = proj;
    Nav.updateSidebarProject(proj);
    this._showApp();
    await Data.loadAllForProject();
    Render.all();
    Toast.ok('Bienvenue sur ' + proj.name);
  },

  async enterWithoutProject() {
    this._showApp();
    await Data.loadProjects();
    Render.dashboard();
    Render.projects();
  },

  _showApp() {
    Utils.$('auth-screen')?.classList.add('out');
    setTimeout(() => Utils.$('auth-screen')?.classList.add('hidden'), 500);
    const app = Utils.$('app');
    if (app) app.classList.remove('hidden');
    Nav.show('dashboard');
  },

  async logout() {
    Modals.closeAll();
    Utils.$('user-dropdown')?.classList.add('hidden');
    await DB.auth.signOut();
    // onAuthStateChange resets everything
  },
};

/* ════════════════════════════════════════════════════════════════
   DATA LAYER — all Supabase queries
   ════════════════════════════════════════════════════════════════ */
const Data = {
  async loadProjects() {
    const { data } = await DB.from('projects').select('*').order('created_at', { ascending: false });
    S.projects = data || [];

    // Auto-select first accessible project
    if (!S.activeProject && S.user && S.projects.length) {
      const { data: mem } = await DB.from('project_members').select('project_id').eq('user_id', S.user.id);
      const ids = (mem || []).map(m => m.project_id);
      const found = S.projects.find(p => ids.includes(p.id));
      if (found) { S.activeProject = found; Nav.updateSidebarProject(found); }
    }

    // Populate project selects
    this._fillProjectSelects();
  },

  async loadBordereau() {
    if (!S.activeProject) { S.bordereau = []; return; }
    const { data } = await DB.from('bordereau').select('*').eq('project_id', S.activeProject.id)
      .order('sort_order').order('position_num');
    S.bordereau = data || [];
  },

  async loadPhases() {
    if (!S.activeProject) { S.phases = []; S.phaseTasks = {}; return; }
    const { data: phases } = await DB.from('phases').select('*')
      .eq('project_id', S.activeProject.id).order('sort_order').order('created_at');
    S.phases = phases || [];

    if (S.phases.length) {
      const { data: tasks } = await DB.from('phase_tasks').select('*')
        .in('phase_id', S.phases.map(p => p.id)).order('sort_order');
      S.phaseTasks = {};
      (tasks || []).forEach(t => {
        if (!S.phaseTasks[t.phase_id]) S.phaseTasks[t.phase_id] = [];
        S.phaseTasks[t.phase_id].push(t);
      });
    } else {
      S.phaseTasks = {};
    }
  },

  async loadPhotos() {
    if (!S.activeProject) { S.photos = []; return; }
    const { data } = await DB.from('photos')
      .select('*, profiles(full_name)')
      .eq('project_id', S.activeProject.id)
      .order('created_at', { ascending: false });
    S.photos = data || [];
  },

  async loadDocuments() {
    if (!S.activeProject) { S.documents = []; return; }
    const { data } = await DB.from('documents')
      .select('*, profiles(full_name)')
      .eq('project_id', S.activeProject.id)
      .order('created_at', { ascending: false });
    S.documents = data || [];
  },

  async loadEvents() {
    const { data } = await DB.from('events')
      .select('*, projects(name)').order('event_date').order('event_time');
    S.events = data || [];
  },

  async loadChatRooms() {
    if (!S.activeProject) { S.chatRooms = []; return; }
    const { data } = await DB.from('chat_rooms').select('*').eq('project_id', S.activeProject.id);
    S.chatRooms = data || [];

    // Auto-create default rooms
    if (!S.chatRooms.length) {
      const { data: created } = await DB.from('chat_rooms').insert([
        { project_id: S.activeProject.id, name: 'Général — ' + S.activeProject.name, room_type: 'general', icon: '💬', icon_bg: '#1a2a1e' },
        { project_id: S.activeProject.id, name: 'Équipe terrain', room_type: 'ops', icon: '👷', icon_bg: '#1a1f2e' },
      ]).select();
      S.chatRooms = created || [];
    }
    if (!S.activeRoom && S.chatRooms.length) S.activeRoom = S.chatRooms[0];
    await this.loadMessages();
  },

  async loadMessages() {
    if (!S.activeRoom) { S.messages = []; return; }
    const { data } = await DB.from('chat_messages')
      .select('*, profiles(full_name, role)')
      .eq('room_id', S.activeRoom.id)
      .order('created_at', { ascending: true })
      .limit(100);
    S.messages = data || [];
  },

  async loadTeam() {
    const projIds = S.projects.map(p => p.id);
    if (!projIds.length) { S.team = []; return; }
    const { data } = await DB.from('project_members')
      .select('*, profiles(id, full_name, role, phone)').in('project_id', projIds);
    const seen = new Set();
    S.team = [];
    (data || []).forEach(m => {
      if (m.profiles && !seen.has(m.profiles.id)) {
        seen.add(m.profiles.id);
        S.team.push({ ...m.profiles, memberRole: m.role });
      }
    });
  },

  async loadAllForProject() {
    await Promise.all([
      this.loadBordereau(),
      this.loadPhases(),
      this.loadPhotos(),
      this.loadDocuments(),
      this.loadEvents(),
      this.loadChatRooms(),
      this.loadTeam(),
    ]);
  },

  _fillProjectSelects() {
    // Code step select
    const sel = Utils.$('code-project-sel');
    if (sel) {
      sel.innerHTML = '<option value="">— Choisir un projet —</option>';
      S.projects.forEach(p => {
        sel.innerHTML += `<option value="${p.id}">${p.name}</option>`;
      });
    }
    // Event modal select
    const evSel = Utils.$('ev-project');
    if (evSel) {
      evSel.innerHTML = '<option value="">— Aucun —</option>';
      S.projects.forEach(p => {
        evSel.innerHTML += `<option value="${p.id}">${p.name}</option>`;
      });
    }
  },
};

/* ════════════════════════════════════════════════════════════════
   REALTIME — live chat updates
   ════════════════════════════════════════════════════════════════ */
const Realtime = {
  subscribe() {
    if (S.realtimeSub) { S.realtimeSub.unsubscribe(); S.realtimeSub = null; }
    if (!S.activeRoom) return;

    S.realtimeSub = DB.channel('chat:' + S.activeRoom.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `room_id=eq.${S.activeRoom.id}`,
      }, async payload => {
        const { data: profile } = await DB.from('profiles')
          .select('full_name, role').eq('id', payload.new.author_id).single();
        S.messages.push({ ...payload.new, profiles: profile });
        Render.chatMessages();

        // Badge if chat not visible
        if (!Utils.$('panel-chat')?.classList.contains('active')) {
          const badge = Utils.$('sb-chat-badge');
          if (badge) {
            badge.classList.remove('hidden');
            badge.textContent = parseInt(badge.textContent || 0) + 1;
          }
          Utils.$('notif-dot')?.classList.remove('hidden');
        }
      })
      .subscribe();
  },
};

/* ════════════════════════════════════════════════════════════════
   RENDER — UI builders
   ════════════════════════════════════════════════════════════════ */
const Render = {
  all() {
    this.dashboard();
    this.projects();
    this.bordereau();
    this.phases();
    this.photos();
    this.documents();
    this.gantt();
    this.calendar();
    this.chat();
    this.team();
    this.reports();
  },

  /* ── Project detail header ── */
  projectHeader(p) {
    if (!p) {
      return `<div class="pdh" style="margin-bottom:16px">
        <span style="color:var(--tx3);font-size:13px">
          <i class="ti ti-info-circle"></i> Aucun projet sélectionné.
          <button class="btn btn-accent btn-sm" style="margin-left:10px" onclick="App.Nav.show('projets')">Sélectionner un projet</button>
        </span>
      </div>`;
    }
    return `<div class="pdh">
      <div class="pdh-icon" style="background:linear-gradient(135deg,${p.color_from||'#1a2a1e'},${p.color_to||'#0d1a0a'})">${p.icon||'🏗️'}</div>
      <div class="pdh-info">
        <div class="pdh-name">${p.name}</div>
        <div class="pdh-meta">
          <span><i class="ti ti-map-pin"></i>${p.address||'—'}</span>
          <span><i class="ti ti-building"></i>${p.client||'—'}</span>
          <span><i class="ti ti-calendar"></i>Fin: ${Utils.fmtDate(p.end_date)}</span>
          <span><i class="ti ti-user"></i>${p.responsible||'—'}</span>
        </div>
      </div>
      <div class="pdh-right">
        ${Utils.statusBadge(p.status)}
        <div class="pdh-pct">
          <div class="pdh-pct-num">${p.progress}%</div>
          <div class="pdh-pct-lbl">avancé</div>
        </div>
      </div>
    </div>`;
  },

  /* ── Dashboard ── */
  dashboard() {
    const active  = S.projects.filter(p => p.status === 'active');
    const delayed = S.projects.filter(p => p.status === 'delayed');
    const avgProg = S.projects.length ? Math.round(S.projects.reduce((a, p) => a + p.progress, 0) / S.projects.length) : 0;
    const totalExec = S.bordereau.reduce((a, r) => a + r.qty_executed * r.unit_price, 0);
    const invd      = S.bordereau.filter(r => r.status === 'invoiced').reduce((a, r) => a + r.qty_executed * r.unit_price, 0);

    // KPIs
    Utils.$('dash-kpis').innerHTML = `
      <div class="kpi-card accent">
        <div class="kpi-label"><i class="ti ti-building-skyscraper" style="color:var(--accent)"></i>Projets actifs</div>
        <div class="kpi-value">${active.length}</div>
        <div class="kpi-sub">${S.projects.length} total · ${delayed.length} en retard</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label"><i class="ti ti-trending-up" style="color:var(--green)"></i>Avancement moyen</div>
        <div class="kpi-value">${avgProg}<span style="font-size:18px">%</span></div>
        <div class="kpi-sub up"><i class="ti ti-arrow-up-right"></i>Sur ${S.projects.length} chantier(s)</div>
      </div>
      <div class="kpi-card blue">
        <div class="kpi-label"><i class="ti ti-file-invoice" style="color:var(--blue)"></i>À facturer</div>
        <div class="kpi-value" style="font-size:18px">${Utils.fmtEur(totalExec - invd)}</div>
        <div class="kpi-sub warn"><i class="ti ti-clock"></i>Situation à préparer</div>
      </div>
      <div class="kpi-card red">
        <div class="kpi-label"><i class="ti ti-alert-triangle" style="color:var(--red)"></i>Alertes</div>
        <div class="kpi-value">${delayed.length}</div>
        <div class="kpi-sub down">${delayed.length} projet(s) en retard</div>
      </div>`;

    // Projects list
    Utils.$('dash-proj-list').innerHTML = S.projects.length
      ? S.projects.slice(0, 5).map(p => `
          <div class="dash-proj-item" onclick="App.Projects.open('${p.id}')">
            <div class="dash-proj-icon">${p.icon || '🏗️'}</div>
            <div class="dash-proj-info">
              <div class="dash-proj-name">${p.name}</div>
              <div class="prog-track" style="margin-top:4px">
                <div class="prog-fill" style="width:${p.progress}%;background:${Utils.progColor(p.progress)}"></div>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--tx3);margin-top:3px">
                <span>${(p.address || '—').split(',')[0]}</span>
                <span style="font-family:var(--mono);font-weight:700;color:${Utils.progColor(p.progress)}">${p.progress}%</span>
              </div>
            </div>
            ${Utils.statusBadge(p.status)}
          </div>`).join('')
      : '<div class="empty-state"><i class="ti ti-building-off"></i><div class="empty-state-title">Aucun projet</div></div>';

    // Alerts
    Utils.$('dash-alerts').innerHTML = delayed.length
      ? delayed.map(p => `
          <div class="alert-item danger">
            <i class="ti ti-clock alert-icon" style="color:var(--red)"></i>
            <div><div class="alert-title">Retard — ${p.name}</div><div class="alert-sub">${(p.address||'').split(',')[0]}</div></div>
          </div>`).join('')
      : `<div class="alert-item info">
          <i class="ti ti-check alert-icon" style="color:var(--green)"></i>
          <div><div class="alert-title">Aucune alerte active</div><div class="alert-sub">Tous les chantiers sont dans les délais</div></div>
        </div>`;

    // Events
    const evColors = { meeting:'var(--blue)', delivery:'var(--amber)', inspection:'var(--green)', deadline:'var(--red)', safety:'var(--amber)', client:'var(--purple)' };
    const upcoming = S.events.filter(e => new Date(e.event_date) >= new Date()).slice(0, 4);
    Utils.$('dash-events').innerHTML = upcoming.length
      ? upcoming.map(e => `
          <div class="ev-item">
            <div class="ev-dot" style="background:${evColors[e.event_type]||'var(--accent)'}"></div>
            <div>
              <div class="ev-title">${e.title}</div>
              <div class="ev-meta">${Utils.fmtDate(e.event_date)} · ${e.event_time||''} · ${e.location||'—'}
                <span class="ev-proj-chip">${e.projects?.name||'Tous'}</span>
              </div>
            </div>
          </div>`).join('')
      : '<div class="empty-state" style="padding:16px"><i class="ti ti-calendar-off"></i><div class="empty-state-sub">Aucun événement à venir</div></div>';

    // Bordereau mini
    const bName = Utils.$('dash-bord-proj-name');
    if (bName) bName.textContent = S.activeProject?.name || 'Sélectionner un projet';
    const planned = S.bordereau.reduce((a, r) => a + r.qty_planned * r.unit_price, 0);
    const exec    = S.bordereau.reduce((a, r) => a + r.qty_executed * r.unit_price, 0);
    const inv2    = S.bordereau.filter(r => r.status === 'invoiced').reduce((a, r) => a + r.qty_executed * r.unit_price, 0);
    Utils.$('dash-bord').innerHTML = S.bordereau.length
      ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
          <div style="background:var(--surface2);border-radius:var(--r);padding:12px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--tx3);margin-bottom:3px">Marché</div><div style="font-size:16px;font-weight:800;font-family:var(--head)">${Utils.fmtEur(planned)}</div></div>
          <div style="background:var(--surface2);border-radius:var(--r);padding:12px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--tx3);margin-bottom:3px">Exécuté</div><div style="font-size:16px;font-weight:800;font-family:var(--head);color:var(--green)">${Utils.fmtEur(exec)}</div></div>
          <div style="background:var(--surface2);border-radius:var(--r);padding:12px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--tx3);margin-bottom:3px">Facturé</div><div style="font-size:16px;font-weight:800;font-family:var(--head);color:var(--blue)">${Utils.fmtEur(inv2)}</div></div>
          <div style="background:var(--surface2);border-radius:var(--r);padding:12px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--tx3);margin-bottom:3px">À facturer</div><div style="font-size:16px;font-weight:800;font-family:var(--head);color:var(--amber)">${Utils.fmtEur(exec - inv2)}</div></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:4px"><span style="color:var(--tx3)">Exécution</span><span style="font-family:var(--mono);font-weight:700;color:${Utils.progColor(planned?Math.round(exec/planned*100):0)}">${planned ? Math.round(exec/planned*100) : 0}%</span></div>
        <div class="prog-track"><div class="prog-fill" style="width:${planned?Math.round(exec/planned*100):0}%;background:var(--green)"></div></div>`
      : '<div class="empty-state" style="padding:16px"><i class="ti ti-file-off"></i><div class="empty-state-sub">Aucune position</div></div>';

    // Last messages
    Utils.$('dash-msgs').innerHTML = S.messages.slice(-3).map(m => `
      <div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--border2)">
        <div class="sb-avatar" style="background:${Utils.avatarColor(m.profiles?.full_name||'?')};flex-shrink:0">${Utils.initials(m.profiles?.full_name||'?')}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2px">
            <span style="font-size:13px;font-weight:700">${m.profiles?.full_name||'—'}</span>
            <span style="font-size:10px;color:var(--tx3)">${Utils.fmtDateTime(m.created_at)}</span>
          </div>
          <div style="font-size:12px;color:var(--tx2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.body||''}</div>
        </div>
      </div>`).join('') || '<div class="empty-state" style="padding:16px"><i class="ti ti-message-off"></i><div class="empty-state-sub">Aucun message récent</div></div>';
  },

  /* ── Projects ── */
  projects() {
    Utils.$('proj-count').textContent = S.projects.length + ' chantier(s)';
    Utils.$('proj-grid').innerHTML = S.projects.map(p => `
      <div class="proj-card${S.activeProject?.id === p.id ? ' selected' : ''}" onclick="App.Projects.open('${p.id}')">
        <div class="proj-thumb" style="background:linear-gradient(135deg,${p.color_from||'#1a2a1e'},${p.color_to||'#0d1a0a'})">
          <span>${p.icon||'🏗️'}</span>
          <div class="proj-status-badge">${Utils.statusBadge(p.status)}</div>
        </div>
        <div class="proj-body">
          <div class="proj-name">${p.name}</div>
          <div class="proj-meta"><i class="ti ti-map-pin" style="font-size:11px"></i>${(p.address||'—').split(',')[0]} · ${p.surface_m2||'?'} m²</div>
          <div style="font-size:11px;color:var(--tx3);margin-bottom:10px"><i class="ti ti-user" style="font-size:11px"></i> ${p.responsible||'—'} · ${p.client||'—'}</div>
          <div class="proj-progress-row"><span>Avancement</span><span class="pct" style="color:${Utils.progColor(p.progress)}">${p.progress}%</span></div>
          <div class="prog-track"><div class="prog-fill" style="width:${p.progress}%;background:${Utils.progColor(p.progress)}"></div></div>
          <div class="proj-end"><i class="ti ti-calendar" style="font-size:11px"></i>Fin: ${Utils.fmtDate(p.end_date)}</div>
        </div>
      </div>`).join('') + `
      <div class="proj-add-card" onclick="App.Modals.open('modal-project')">
        <i class="ti ti-plus"></i><span>Nouveau chantier</span>
      </div>`;
  },

  /* ── Bordereau ── */
  bordereau() {
    // Headers
    ['pdh-bordereau'].forEach(id => {
      const el = Utils.$(id);
      if (el) el.innerHTML = this.projectHeader(S.activeProject);
    });

    // KPIs
    const planned = S.bordereau.reduce((a, r) => a + r.qty_planned * r.unit_price, 0);
    const exec    = S.bordereau.reduce((a, r) => a + r.qty_executed * r.unit_price, 0);
    const inv     = S.bordereau.filter(r => r.status === 'invoiced').reduce((a, r) => a + r.qty_executed * r.unit_price, 0);
    Utils.$('bord-kpis').innerHTML = `
      <div class="bord-kpi"><div class="bord-kpi-label">Marché total</div><div class="bord-kpi-value">${Utils.fmtEur(planned)}</div><div class="bord-kpi-sub">${S.bordereau.length} positions</div></div>
      <div class="bord-kpi"><div class="bord-kpi-label">Exécuté</div><div class="bord-kpi-value" style="color:var(--green)">${Utils.fmtEur(exec)}</div><div class="bord-kpi-sub">${planned?Math.round(exec/planned*100):0}% du marché</div></div>
      <div class="bord-kpi"><div class="bord-kpi-label">Facturé</div><div class="bord-kpi-value" style="color:var(--blue)">${Utils.fmtEur(inv)}</div><div class="bord-kpi-sub">Situations précédentes</div></div>
      <div class="bord-kpi"><div class="bord-kpi-label">À facturer</div><div class="bord-kpi-value" style="color:var(--amber)">${Utils.fmtEur(exec-inv)}</div><div class="bord-kpi-sub">Prêt pour situation</div></div>`;

    // Filters
    const filters = [['all','Tout'],['not-started','Non commencé'],['in-progress','En cours'],['finished','Terminé'],['invoiced','Facturé']];
    Utils.$('bord-filters').innerHTML = filters.map(([k,l]) =>
      `<button class="filter-chip${S.bordFilter===k?' active':''}" onclick="App.Bordereau.setFilter('${k}')">${l}</button>`
    ).join('');

    this.bordTable();
    this.invoicePrep();
  },

  bordTable() {
    const rows = S.bordereau.filter(r => S.bordFilter === 'all' || r.status === S.bordFilter);
    const stColors = { 'not-started':'var(--tx3)', 'in-progress':'var(--amber)', finished:'var(--green)', invoiced:'var(--blue)' };

    Utils.$('bord-tbody').innerHTML = rows.length ? rows.map(r => {
      const tot = r.qty_executed * r.unit_price;
      const pct = r.qty_planned > 0 ? Math.min(100, Math.round(r.qty_executed / r.qty_planned * 100)) : 0;
      return `<tr>
        <td style="font-family:var(--mono);font-size:11px;font-weight:700;color:var(--tx3)">${r.position_num}</td>
        <td>
          <div style="font-weight:500">${r.description}</div>
          ${r.notes ? `<div style="font-size:10px;color:var(--amber);margin-top:1px"><i class="ti ti-alert-circle" style="font-size:10px"></i> ${r.notes}</div>` : ''}
        </td>
        <td class="hide-sm" style="text-align:center;font-size:11px;color:var(--tx3)">${r.unit}</td>
        <td class="num hide-md">${Utils.fmt(r.qty_planned, 2)}</td>
        <td class="num">
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">
            <input class="tbl-qty" type="number" value="${r.qty_executed}" min="0"
              onchange="App.Bordereau.updateQty('${r.id}',this.value)"
              title="Modifier la quantité exécutée">
            <div class="prog-track" style="width:52px;height:3px">
              <div class="prog-fill" style="width:${pct}%;background:${Utils.progColor(pct)}"></div>
            </div>
          </div>
        </td>
        <td class="num hide-md">${Utils.fmt(r.unit_price, 2)}</td>
        <td class="num" style="font-weight:700">${Utils.fmtEur(tot)}</td>
        <td>
          <select class="tbl-status-sel" style="color:${stColors[r.status]||'var(--tx3)'}"
            onchange="App.Bordereau.updateStatus('${r.id}',this.value)">
            <option value="not-started"${r.status==='not-started'?' selected':''}>Pas commencé</option>
            <option value="in-progress"${r.status==='in-progress'?' selected':''}>En cours</option>
            <option value="finished"${r.status==='finished'?' selected':''}>Terminé</option>
            <option value="invoiced"${r.status==='invoiced'?' selected':''}>Facturé</option>
          </select>
        </td>
        <td>
          <button class="btn btn-xs btn-ghost" onclick="App.Bordereau.deletePosition('${r.id}')" title="Supprimer">
            <i class="ti ti-trash" style="color:var(--red)"></i>
          </button>
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="9"><div class="empty-state" style="padding:28px">
      <i class="ti ti-file-off"></i>
      <div class="empty-state-title">Aucune position</div>
      <div class="empty-state-sub">${S.activeProject ? 'Ajoutez votre première position' : 'Sélectionnez un projet'}</div>
    </div></td></tr>`;

    const ft = rows.reduce((a, r) => a + r.qty_executed * r.unit_price, 0);
    Utils.$('bord-tfoot').innerHTML = `
      <tr style="background:var(--bg3)">
        <td colspan="6" style="padding:10px 13px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--tx3)">Total exécuté (filtre)</td>
        <td class="num" style="font-size:14px;font-weight:800;font-family:var(--head);padding:10px 13px">${Utils.fmtEur(ft)}</td>
        <td colspan="2"></td>
      </tr>`;
  },

  invoicePrep() {
    const rows = S.bordereau.filter(r => r.status === 'finished' || r.status === 'in-progress');
    if (!rows.length) {
      Utils.$('invoice-prep').innerHTML = '<div class="empty-state" style="padding:16px"><i class="ti ti-file-off"></i><div class="empty-state-sub">Aucune position prête à facturer</div></div>';
      return;
    }
    const selTotal = [...S.invoiceSel].reduce((a, id) => {
      const r = S.bordereau.find(x => x.id === id);
      return a + (r ? r.qty_executed * r.unit_price : 0);
    }, 0);
    Utils.$('invoice-prep').innerHTML = `
      <table class="data-table" style="font-size:12px">
        <thead><tr>
          <th style="width:40px"><input type="checkbox" onchange="App.Bordereau.selectAllInvoice(this.checked)"></th>
          <th>Description</th><th class="num">Qté exéc.</th>
          <th style="text-align:center;width:50px">U.</th>
          <th class="num">P.U.</th><th class="num">Montant HT</th>
        </tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td><input type="checkbox" ${S.invoiceSel.has(r.id)?'checked':''} onchange="App.Bordereau.toggleInvoiceSel('${r.id}',this.checked)"></td>
            <td>${r.position_num} — ${r.description}</td>
            <td class="num">${Utils.fmt(r.qty_executed,2)}</td>
            <td style="text-align:center;color:var(--tx3)">${r.unit}</td>
            <td class="num">${Utils.fmt(r.unit_price,2)}</td>
            <td class="num" style="font-weight:700">${Utils.fmtEur(r.qty_executed*r.unit_price)}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr style="background:var(--bg3)">
            <td colspan="5" style="padding:10px 13px;font-weight:700;font-size:12px">TOTAL SÉLECTIONNÉ HT</td>
            <td class="num" style="font-weight:800;font-size:14px;padding:10px 13px">${Utils.fmtEur(selTotal)}</td>
          </tr>
        </tfoot>
      </table>`;
  },

  /* ── Phases ── */
  phases() {
    ['pdh-phases'].forEach(id => { const el = Utils.$(id); if(el) el.innerHTML = this.projectHeader(S.activeProject); });

    // Populate phase filter in photos
    const pf = Utils.$('photo-filter-phase');
    if (pf) {
      pf.innerHTML = '<option value="">Toutes les phases</option>';
      S.phases.forEach(p => { pf.innerHTML += `<option value="${p.id}">${p.name}</option>`; });
    }
    // Phase modal select
    const ph2 = Utils.$('ph2-phase');
    if (ph2) {
      ph2.innerHTML = '<option value="">— Aucune —</option>';
      S.phases.forEach(p => { ph2.innerHTML += `<option value="${p.id}">${p.name}</option>`; });
    }

    if (!S.phases.length) {
      Utils.$('phases-list').innerHTML = `<div class="empty-state"><i class="ti ti-list-check"></i><div class="empty-state-title">Aucune phase définie</div><div class="empty-state-sub">Ajoutez la première phase de l'œuvre</div></div>`;
      return;
    }
    Utils.$('phases-list').innerHTML = S.phases.map((ph, i) => {
      const tasks = S.phaseTasks[ph.id] || [];
      const done  = tasks.filter(t => t.done).length;
      const pct   = tasks.length ? Math.round(done / tasks.length * 100) : ph.progress || 0;
      const col   = ph.color || 'var(--accent)';
      return `<div class="phase-card">
        <div class="phase-hd" onclick="App.Phases.toggle('${ph.id}')">
          <div class="phase-num" style="background:${col}20;color:${col}">${i+1}</div>
          <div class="phase-info">
            <div class="phase-name">${ph.name}</div>
            <div class="phase-meta">${Utils.fmtDate(ph.start_date)} → ${Utils.fmtDate(ph.end_date)} · ${ph.responsible||'N/A'}</div>
          </div>
          <div class="phase-right">
            ${Utils.statusBadge(ph.status)}
            <div class="phase-pct" style="color:${col}">${pct}%</div>
            <div class="phase-prog prog-track">
              <div class="prog-fill" style="width:${pct}%;background:${col}"></div>
            </div>
            <i class="ti ti-chevron-down phase-chevron" id="ph-ch-${ph.id}"></i>
          </div>
        </div>
        <div class="phase-body" id="ph-body-${ph.id}">
          <div class="phase-body-inner">
            ${ph.notes ? `<div class="phase-note"><i class="ti ti-note"></i>${ph.notes}</div>` : ''}
            <ul class="checklist">
              ${tasks.map(t => `
                <li class="cl-item" onclick="App.Phases.toggleTask('${ph.id}','${t.id}',${!t.done})">
                  <div class="chk-box${t.done?' checked':''}"><i class="ti ti-check" style="font-size:10px"></i></div>
                  <span class="cl-label${t.done?' done':''}">${t.description}</span>
                </li>`).join('')}
            </ul>
            <div class="phase-actions">
              <button class="btn btn-xs" onclick="App.Phases.addTask('${ph.id}')"><i class="ti ti-plus"></i>Tâche</button>
              <button class="btn btn-xs btn-red" onclick="App.Phases.delete('${ph.id}')"><i class="ti ti-trash"></i></button>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
  },

  /* ── Photos ── */
  async photos(filterPhaseId = '') {
    ['pdh-photos'].forEach(id => { const el = Utils.$(id); if(el) el.innerHTML = this.projectHeader(S.activeProject); });
    const filtered = filterPhaseId ? S.photos.filter(p => p.phase_id === filterPhaseId) : S.photos;
    Utils.$('photos-count').textContent = filtered.length + ' photo(s)';

    // Render gallery
    const gallery = Utils.$('photo-gallery');
    if (!gallery) return;

    // Resolve URLs asynchronously for images
    const cards = await Promise.all(filtered.map(async ph => {
      let thumbHtml = `<div class="photo-thumb-placeholder">📷</div>`;
      if (ph.storage_path) {
        const url = await Storage.resolveUrl('photos', ph.storage_path).catch(() => null);
        if (url) {
          thumbHtml = `<img src="${url}" alt="${ph.location_label||''}" loading="lazy" onerror="this.parentNode.innerHTML='<div class=photo-thumb-placeholder>📷</div>'">`;
        }
      }
      return `<div class="photo-card" onclick="App.Photos.view('${ph.id}')">
        <div class="photo-thumb">
          ${thumbHtml}
          <div class="photo-overlay"><i class="ti ti-zoom-in"></i></div>
        </div>
        <div class="photo-info">
          <div class="photo-label">${ph.location_label || ph.file_name || 'Photo'}</div>
          <div class="photo-date">${Utils.fmtDate(ph.created_at)} · ${ph.profiles?.full_name||'—'}</div>
          ${ph.description ? `<div class="photo-desc">${ph.description}</div>` : ''}
          <div class="photo-tags">${(ph.tags||[]).map(t=>`<span class="photo-tag">${t}</span>`).join('')}</div>
        </div>
      </div>`;
    }));

    gallery.innerHTML = cards.join('') + `
      <div class="photo-add-card" onclick="App.Modals.open('modal-photo')">
        <i class="ti ti-camera-plus" style="font-size:28px"></i>
        <span>Ajouter des photos</span>
      </div>`;
  },

  /* ── Documents ── */
  async documents() {
    ['pdh-documents'].forEach(id => { const el = Utils.$(id); if(el) el.innerHTML = this.projectHeader(S.activeProject); });
    const icons = { plan:'ti-file-description', report:'ti-file-text', invoice:'ti-file-invoice', permit:'ti-certificate', other:'ti-file' };
    const typeLabels = { plan:'Plan', report:'Rapport', invoice:'Facture', permit:'Permis', other:'Autre' };

    Utils.$('docs-tbody').innerHTML = S.documents.length ? S.documents.map(d => {
      const ext = (d.file_name||'').split('.').pop().toLowerCase();
      return `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:9px">
            <i class="ti ${icons[d.doc_type]||'ti-file'}" style="font-size:18px;color:var(--accent);flex-shrink:0"></i>
            <div>
              <div style="font-weight:600">${d.file_name||'—'}</div>
              ${d.description ? `<div style="font-size:10px;color:var(--tx3)">${d.description}</div>` : ''}
            </div>
          </div>
        </td>
        <td class="hide-sm"><span class="badge b-paused">${typeLabels[d.doc_type]||d.doc_type}</span></td>
        <td class="hide-sm"><span style="font-family:var(--mono);font-size:11px">${d.version||'v1'}</span></td>
        <td class="hide-md" style="font-size:11px;color:var(--tx3)">${d.file_size ? (d.file_size/1024).toFixed(0)+' KB' : '—'}</td>
        <td class="hide-md" style="font-size:11px">${d.profiles?.full_name||'—'}</td>
        <td class="hide-sm" style="font-size:11px;color:var(--tx3)">${Utils.fmtDate(d.created_at)}</td>
        <td>
          <div style="display:flex;gap:5px">
            <button class="btn btn-xs btn-ghost" onclick="App.Documents.open('${d.id}')" title="Ouvrir"><i class="ti ti-external-link"></i></button>
            <button class="btn btn-xs btn-ghost" onclick="App.Documents.download('${d.id}')" title="Télécharger"><i class="ti ti-download"></i></button>
            <button class="btn btn-xs btn-ghost" onclick="App.Documents.delete('${d.id}')" title="Supprimer"><i class="ti ti-trash" style="color:var(--red)"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="7"><div class="empty-state" style="padding:32px">
      <i class="ti ti-files-off"></i>
      <div class="empty-state-title">Aucun document</div>
      <div class="empty-state-sub">Téléversez vos plans et rapports</div>
    </div></td></tr>`;
  },

  /* ── Gantt ── */
  gantt() {
    ['pdh-planning'].forEach(id => { const el = Utils.$(id); if(el) el.innerHTML = this.projectHeader(S.activeProject); });
    if (!S.phases.length) {
      Utils.$('gantt-body').innerHTML = '<div class="empty-state" style="padding:32px"><i class="ti ti-chart-gantt"></i><div class="empty-state-sub">Ajoutez des phases pour afficher le Gantt</div></div>';
      Utils.$('gantt-header').innerHTML = '';
      return;
    }
    const starts  = S.phases.filter(p => p.start_date).map(p => new Date(p.start_date));
    const ends    = S.phases.filter(p => p.end_date).map(p => new Date(p.end_date));
    const minDate = starts.length ? new Date(Math.min(...starts)) : new Date();
    const maxDate = ends.length   ? new Date(Math.max(...ends))   : new Date(minDate.getTime() + 180 * 86400000);
    const totalMs = maxDate - minDate || 1;

    // Build months
    const months = []; let cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (cur <= maxDate) { months.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1); }

    const ML = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
    Utils.$('gantt-header').innerHTML = `
      <div class="gantt-task-col">Phase</div>
      <div class="gantt-months-wrap">${months.map(m => `<div class="gantt-month">${ML[m.getMonth()]} ${m.getFullYear().toString().slice(2)}</div>`).join('')}</div>`;

    const todayPct = Math.max(0, Math.min(100, (new Date() - minDate) / totalMs * 100));
    Utils.$('gantt-body').innerHTML = S.phases.map(ph => {
      const tasks = S.phaseTasks[ph.id] || [];
      const pct   = tasks.length ? Math.round(tasks.filter(t => t.done).length / tasks.length * 100) : ph.progress || 0;
      const col   = ph.color || 'var(--accent)';
      const s = ph.start_date ? Math.max(0, (new Date(ph.start_date) - minDate) / totalMs * 100) : 0;
      const e = ph.end_date   ? Math.min(100, (new Date(ph.end_date) - minDate) / totalMs * 100)  : 100;
      const w = Math.max(0.5, e - s);
      return `<div class="gantt-row">
        <div class="gantt-task-name" style="color:${col}">${ph.name}</div>
        <div class="gantt-bar-area">
          <div class="gantt-today" style="left:${todayPct}%"></div>
          <div class="gantt-bar-bg" style="left:${s}%;width:${w}%;background:${col}"></div>
          <div class="gantt-bar" style="left:${s}%;width:${Math.max(0.5, w*pct/100)}%;background:${col}">
            ${pct > 12 ? pct + '%' : ''}
          </div>
        </div>
      </div>`;
    }).join('');
  },

  /* ── Calendar ── */
  calendar() {
    const y = S.calYear, m = S.calMonth;
    const ML = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    Utils.$('cal-title').textContent = ML[m] + ' ' + y;

    const DL = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
    Utils.$('cal-dow-header').innerHTML = DL.map(d => `<div class="cal-dh">${d}</div>`).join('');

    const first = new Date(y, m, 1);
    let dow = first.getDay() - 1; if (dow < 0) dow = 6;
    const dim = new Date(y, m + 1, 0).getDate();
    const prevDim = new Date(y, m, 0).getDate();
    const today = new Date();

    const cells = [];
    for (let i = dow - 1; i >= 0; i--) cells.push({ d: prevDim - i, cur: false });
    for (let d = 1; d <= dim; d++) cells.push({ d, cur: true });
    while (cells.length % 7) cells.push({ d: cells.length - dow - dim + 1, cur: false });

    const evClass = { meeting:'cal-ev-meeting', delivery:'cal-ev-delivery', inspection:'cal-ev-inspection', deadline:'cal-ev-deadline', safety:'cal-ev-safety', client:'cal-ev-client' };
    Utils.$('cal-grid').innerHTML = cells.map(c => {
      const isToday = c.cur && c.d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
      const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(c.d).padStart(2,'0')}`;
      const evs = S.events.filter(e => e.event_date === ds);
      return `<div class="cal-cell${!c.cur?' other-month':''}${isToday?' today':''}">
        <div class="cal-num${isToday?' cal-today-num':''}">${c.d}</div>
        ${evs.slice(0,2).map(e => `<div class="cal-ev ${evClass[e.event_type]||''}" title="${e.title}">${e.event_time?e.event_time.slice(0,5)+' ':''}${e.title}</div>`).join('')}
        ${evs.length > 2 ? `<div style="font-size:9px;color:var(--tx3)">+${evs.length-2}</div>` : ''}
      </div>`;
    }).join('');

    const monthStr = `${y}-${String(m+1).padStart(2,'0')}`;
    const monthEvs = S.events.filter(e => e.event_date?.startsWith(monthStr)).sort((a,b) => a.event_date.localeCompare(b.event_date));
    const evColors = { meeting:'var(--blue)', delivery:'var(--amber)', inspection:'var(--green)', deadline:'var(--red)', safety:'var(--amber)', client:'var(--purple)' };
    Utils.$('cal-event-list').innerHTML = monthEvs.length ? monthEvs.map(e => `
      <div class="ev-item">
        <div class="ev-dot" style="background:${evColors[e.event_type]||'var(--accent)'}"></div>
        <div style="flex:1">
          <div class="ev-title">${e.title}</div>
          <div class="ev-meta">
            ${Utils.fmtDate(e.event_date)} · ${e.event_time||''} · ${e.location||'—'}
            ${e.projects?.name ? `<span class="ev-proj-chip">${e.projects.name}</span>` : ''}
          </div>
          ${e.participants ? `<div style="font-size:10px;color:var(--tx3);margin-top:2px"><i class="ti ti-users" style="font-size:10px"></i> ${e.participants}</div>` : ''}
        </div>
        <button class="btn btn-xs btn-ghost" onclick="App.Calendar.deleteEvent('${e.id}')"><i class="ti ti-trash" style="color:var(--red)"></i></button>
      </div>`).join('')
    : '<div class="empty-state" style="padding:20px"><i class="ti ti-calendar-off"></i><div class="empty-state-sub">Aucun événement ce mois</div></div>';
  },

  /* ── Chat ── */
  chat() {
    Utils.$('chat-rooms-list').innerHTML = S.chatRooms.map(r => `
      <div class="chat-room${S.activeRoom?.id===r.id?' active':''}" onclick="App.Chat.switchRoom('${r.id}')">
        <div class="chat-room-icon" style="background:${r.icon_bg||'#1a2a1e'}">${r.icon||'💬'}</div>
        <div style="flex:1;min-width:0">
          <div class="chat-room-name">${r.name}</div>
          <div class="chat-room-last">${S.messages.slice(-1)[0]?.body?.slice(0,30)||'Démarrer la conversation'}…</div>
        </div>
      </div>`).join('') || '<div style="padding:16px;font-size:12px;color:var(--tx3)">Sélectionnez un projet pour voir les chatrooms.</div>';

    if (S.activeRoom) {
      const icon = Utils.$('chat-tb-icon');
      if (icon) { icon.style.background = S.activeRoom.icon_bg||'#1a2a1e'; icon.textContent = S.activeRoom.icon||'💬'; }
      Utils.$('chat-tb-name').textContent = S.activeRoom.name;
      Utils.$('chat-tb-meta').textContent = S.chatRooms.length + ' salon(s)';
    }
    this.chatMessages();
  },

  chatMessages() {
    const el = Utils.$('chat-messages');
    if (!el) return;
    el.innerHTML = S.messages.length ? S.messages.map(m => {
      const name = m.profiles?.full_name || 'Inconnu';
      const role = m.profiles?.role;
      return `<div class="chat-msg">
        <div class="chat-msg-av" style="background:${Utils.avatarColor(name)}">${Utils.initials(name)}</div>
        <div class="chat-msg-body">
          <div class="chat-msg-hd">
            <span class="chat-msg-author">${name}</span>
            ${role ? `${Utils.roleBadge(role)}` : ''}
            <span class="chat-msg-time">${Utils.fmtDateTime(m.created_at)}</span>
          </div>
          <div class="chat-msg-text">${(m.body||'').replace(/\n/g,'<br>').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/&lt;br&gt;/g,'<br>')}</div>
        </div>
      </div>`;
    }).join('') : '<div class="empty-state"><i class="ti ti-message-off"></i><div class="empty-state-sub">Aucun message — Démarrez la conversation</div></div>';
    el.scrollTop = el.scrollHeight;
  },

  /* ── Team ── */
  team() {
    Utils.$('team-tbody').innerHTML = S.team.length ? S.team.map(m => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="sb-avatar" style="background:${Utils.avatarColor(m.full_name||'?')};font-size:11px">${Utils.initials(m.full_name||'?')}</div>
            <span style="font-weight:600">${m.full_name||'—'}</span>
          </div>
        </td>
        <td>${Utils.roleBadge(m.memberRole||m.role||'viewer')}</td>
        <td class="hide-sm" style="font-size:12px;color:var(--blue)">${m.email||'—'}</td>
        <td class="hide-md" style="font-size:12px;color:var(--tx3)">${m.phone||'—'}</td>
        <td><span class="badge b-active">Actif</span></td>
      </tr>`).join('')
    : `<tr><td colspan="5"><div class="empty-state" style="padding:32px"><i class="ti ti-users-off"></i><div class="empty-state-title">Aucun membre</div><div class="empty-state-sub">Les membres s'ajoutent en accédant à un projet avec le code</div></div></td></tr>`;
  },

  /* ── Reports ── */
  reports() {
    const planned = S.bordereau.reduce((a,r) => a + r.qty_planned * r.unit_price, 0);
    const exec    = S.bordereau.reduce((a,r) => a + r.qty_executed * r.unit_price, 0);
    const inv     = S.bordereau.filter(r => r.status==='invoiced').reduce((a,r) => a + r.qty_executed * r.unit_price, 0);
    const phaseDone = S.phases.filter(p => p.status === 'finished').length;
    const tasksDone = Object.values(S.phaseTasks).flat().filter(t => t.done).length;
    const totalTasks = Object.values(S.phaseTasks).flat().length;

    Utils.$('reports-grid').innerHTML = `
      <div class="report-card">
        <div class="report-title"><i class="ti ti-file-invoice"></i>Financier — ${S.activeProject?.name||'Projet'}</div>
        <div class="report-row"><span>Marché total HT</span><span class="report-row-val">${Utils.fmtEur(planned)}</span></div>
        <div class="report-row"><span>Exécuté HT</span><span class="report-row-val" style="color:var(--green)">${Utils.fmtEur(exec)}</span></div>
        <div class="report-row"><span>Taux d'exécution</span><span class="report-row-val">${planned?Math.round(exec/planned*100):0}%</span></div>
        <div class="report-row"><span>Facturé HT</span><span class="report-row-val" style="color:var(--blue)">${Utils.fmtEur(inv)}</span></div>
        <div class="report-row"><span>Reste à facturer</span><span class="report-row-val" style="color:var(--amber)">${Utils.fmtEur(exec-inv)}</span></div>
        <div class="report-row"><span>TVA estimée (20%)</span><span class="report-row-val">${Utils.fmtEur((exec-inv)*.2)}</span></div>
        <div class="report-row" style="font-weight:700;font-size:14px"><span>TTC à facturer</span><span class="report-row-val" style="color:var(--accent)">${Utils.fmtEur((exec-inv)*1.2)}</span></div>
      </div>
      <div class="report-card">
        <div class="report-title"><i class="ti ti-chart-bar"></i>Avancement général</div>
        <div class="report-row"><span>Projets actifs</span><span class="report-row-val">${S.projects.filter(p=>p.status==='active').length}</span></div>
        <div class="report-row"><span>Projets en retard</span><span class="report-row-val" style="color:var(--red)">${S.projects.filter(p=>p.status==='delayed').length}</span></div>
        <div class="report-row"><span>Avancement moyen</span><span class="report-row-val">${S.projects.length?Math.round(S.projects.reduce((a,p)=>a+p.progress,0)/S.projects.length):0}%</span></div>
        <div class="report-row"><span>Phases terminées</span><span class="report-row-val">${phaseDone} / ${S.phases.length}</span></div>
        <div class="report-row"><span>Tâches complétées</span><span class="report-row-val">${tasksDone} / ${totalTasks}</span></div>
        <div class="report-row"><span>Photos documentées</span><span class="report-row-val">${S.photos.length}</span></div>
        <div class="report-row"><span>Documents téléversés</span><span class="report-row-val">${S.documents.length}</span></div>
      </div>
      <div class="report-card">
        <div class="report-title"><i class="ti ti-list-check"></i>Bordereau par statut</div>
        ${[['not-started','Non commencé','var(--tx3)'],['in-progress','En cours','var(--amber)'],['finished','Terminé','var(--green)'],['invoiced','Facturé','var(--blue)']].map(([k,l,c]) => {
          const items = S.bordereau.filter(r=>r.status===k);
          const val   = items.reduce((a,r)=>a+r.qty_executed*r.unit_price,0);
          return `<div class="report-row"><span style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${c};display:inline-block"></span>${l} (${items.length})</span><span class="report-row-val" style="color:${c}">${Utils.fmtEur(val)}</span></div>`;
        }).join('')}
      </div>
      <div class="report-card">
        <div class="report-title"><i class="ti ti-calendar-stats"></i>Événements</div>
        ${[['meeting','Réunions chantier'],['delivery','Livraisons'],['inspection','Inspections'],['deadline','Deadlines'],['safety','Sécurité'],['client','Client']].map(([k,l])=>{
          const count = S.events.filter(e=>e.event_type===k).length;
          return `<div class="report-row"><span>${l}</span><span class="report-row-val">${count}</span></div>`;
        }).join('')}
        <div class="report-row" style="margin-top:6px"><span style="font-weight:700">Total événements</span><span class="report-row-val" style="font-weight:700">${S.events.length}</span></div>
      </div>`;
  },
};

/* ════════════════════════════════════════════════════════════════
   FEATURE MODULES
   ════════════════════════════════════════════════════════════════ */

/* ── Projects ── */
const Projects = {
  async open(id) {
    const proj = S.projects.find(p => p.id === id);
    if (!proj) return;
    S.activeProject = proj;
    Nav.updateSidebarProject(proj);
    await Data.loadAllForProject();
    Render.all();
    Nav.show('bordereau');
    Toast.ok(proj.name + ' sélectionné');
  },

  async create() {
    const name = Utils.$('np-name')?.value.trim();
    const code = Utils.$('np-code')?.value.trim();
    if (!name) { Toast.err('Nom du projet requis.'); return; }
    if (!/^\d{4}$/.test(code)) { Toast.err('Le code doit être exactement 4 chiffres.'); return; }

    Utils.setBtn('btn-create-proj', true, 'Création…');
    const { data, error } = await DB.from('projects').insert({
      name,
      client:      Utils.$('np-client')?.value,
      type:        Utils.$('np-type')?.value,
      address:     Utils.$('np-addr')?.value,
      start_date:  Utils.$('np-start')?.value || null,
      end_date:    Utils.$('np-end')?.value   || null,
      responsible: Utils.$('np-resp')?.value,
      surface_m2:  parseFloat(Utils.$('np-surface')?.value) || null,
      description: Utils.$('np-desc')?.value,
      access_code: code,
      created_by:  S.user?.id,
      color_from:  '#1a2a1e',
      color_to:    '#0d1a0a',
    }).select().single();
    Utils.setBtn('btn-create-proj', false);

    if (error) { Toast.err('Erreur: ' + error.message); return; }

    // Add creator as admin member
    if (S.user) {
      await DB.from('project_members').insert({ project_id: data.id, user_id: S.user.id, role: 'admin' });
    }
    S.projects.unshift(data);
    Data._fillProjectSelects();
    Render.projects();
    Render.dashboard();
    Modals.close('modal-project');
    Toast.ok(name + ' créé !');
    Utils.clearForm(['np-name','np-client','np-addr','np-resp','np-surface','np-code','np-desc']);
  },
};

/* ── Bordereau ── */
const Bordereau = {
  setFilter(f) { S.bordFilter = f; Render.bordereau(); },

  async updateQty(id, val) {
    const qty = Math.max(0, parseFloat(val) || 0);
    const { error } = await DB.from('bordereau').update({ qty_executed: qty }).eq('id', id);
    if (error) { Toast.err('Erreur mise à jour.'); return; }
    const r = S.bordereau.find(r => r.id === id);
    if (r) r.qty_executed = qty;
    Render.bordereau(); Render.dashboard();
  },

  async updateStatus(id, status) {
    const { error } = await DB.from('bordereau').update({ status }).eq('id', id);
    if (error) { Toast.err('Erreur.'); return; }
    const r = S.bordereau.find(r => r.id === id);
    if (r) r.status = status;
    Render.bordereau();
  },

  async deletePosition(id) {
    if (!confirm('Supprimer cette position ?')) return;
    const { error } = await DB.from('bordereau').delete().eq('id', id);
    if (error) { Toast.err('Erreur suppression.'); return; }
    S.bordereau = S.bordereau.filter(r => r.id !== id);
    Render.bordereau(); Toast.warn('Position supprimée.');
  },

  async addPosition() {
    if (!S.activeProject) { Toast.warn('Sélectionnez un projet.'); return; }
    const num  = Utils.$('pos-num')?.value.trim();
    const desc = Utils.$('pos-desc')?.value.trim();
    if (!num || !desc) { Toast.err('N° et description requis.'); return; }

    Utils.setBtn('btn-add-pos', true, 'Ajout…');
    const { data, error } = await DB.from('bordereau').insert({
      project_id:   S.activeProject.id,
      position_num: num,
      description:  desc,
      unit:         Utils.$('pos-unit')?.value,
      qty_planned:  parseFloat(Utils.$('pos-qty')?.value)  || 0,
      unit_price:   parseFloat(Utils.$('pos-pu')?.value)   || 0,
      notes:        Utils.$('pos-notes')?.value,
      created_by:   S.user?.id,
      sort_order:   S.bordereau.length,
    }).select().single();
    Utils.setBtn('btn-add-pos', false);

    if (error) { Toast.err('Erreur: ' + error.message); return; }
    S.bordereau.push(data);
    Render.bordereau();
    Modals.close('modal-position');
    Toast.ok('Position ajoutée.');
    Utils.clearForm(['pos-num','pos-desc','pos-qty','pos-pu','pos-notes']);
  },

  toggleInvoiceSel(id, checked) { checked ? S.invoiceSel.add(id) : S.invoiceSel.delete(id); Render.invoicePrep(); },
  selectAllInvoice(checked) {
    const rows = S.bordereau.filter(r => r.status === 'finished' || r.status === 'in-progress');
    checked ? rows.forEach(r => S.invoiceSel.add(r.id)) : S.invoiceSel.clear();
    Render.invoicePrep();
  },

  async generateInvoice() {
    if (!S.invoiceSel.size) { Toast.warn('Sélectionnez au moins une position.'); return; }
    const rows     = S.bordereau.filter(r => S.invoiceSel.has(r.id));
    const totalHT  = rows.reduce((a, r) => a + r.qty_executed * r.unit_price, 0);
    const tva      = totalHT * 0.2;
    const totalTTC = totalHT + tva;
    const invNum   = 'SIT-' + new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + Date.now().toString().slice(-4);
    const now      = new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });

    // Save to DB
    const { data: inv } = await DB.from('invoices').insert({
      project_id: S.activeProject?.id,
      invoice_num: invNum,
      period_label: 'Situation ' + now,
      total_ht: totalHT,
      created_by: S.user?.id,
    }).select().single();
    if (inv) {
      await DB.from('invoice_lines').insert(rows.map(r => ({
        invoice_id:   inv.id,
        bordereau_id: r.id,
        description:  r.position_num + ' — ' + r.description,
        qty:          r.qty_executed,
        unit:         r.unit,
        unit_price:   r.unit_price,
      })));
    }

    Utils.$('invoice-preview').innerHTML = `
      <div style="border:1px solid var(--border);border-radius:var(--r2);padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-family:var(--head);font-size:22px;font-weight:800;letter-spacing:-.5px">SITUATION DE TRAVAUX</div>
            <div style="font-size:12px;color:var(--tx3);margin-top:4px">${invNum} · ${now} · ${S.activeProject?.name||''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:var(--head);font-size:26px;font-weight:800;color:var(--accent)">${Utils.fmtEur(totalTTC)}</div>
            <div style="font-size:10px;color:var(--tx3)">TTC (TVA 20%)</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--tx2);margin-bottom:16px"><strong>Client :</strong> ${S.activeProject?.client||'—'} &nbsp;|&nbsp; <strong>Chantier :</strong> ${S.activeProject?.address||'—'}</div>
        <div class="table-responsive">
          <table class="data-table" style="font-size:11px">
            <thead><tr><th>N°</th><th>Description</th><th style="text-align:center">Qté</th><th>Unité</th><th class="num">P.U. €</th><th class="num">Total HT €</th></tr></thead>
            <tbody>${rows.map(r => `<tr>
              <td style="font-family:var(--mono)">${r.position_num}</td>
              <td>${r.description}</td>
              <td style="text-align:center">${Utils.fmt(r.qty_executed,2)}</td>
              <td style="text-align:center;color:var(--tx3)">${r.unit}</td>
              <td class="num">${Utils.fmt(r.unit_price,2)}</td>
              <td class="num" style="font-weight:700">${Utils.fmtEur(r.qty_executed*r.unit_price)}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
        <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px;display:flex;flex-direction:column;align-items:flex-end;gap:5px">
          <div style="display:flex;gap:32px;font-size:13px"><span style="color:var(--tx3)">Total HT</span><span style="font-family:var(--mono);font-weight:700">${Utils.fmtEur(totalHT)}</span></div>
          <div style="display:flex;gap:32px;font-size:13px"><span style="color:var(--tx3)">TVA 20%</span><span style="font-family:var(--mono);font-weight:700">${Utils.fmtEur(tva)}</span></div>
          <div style="display:flex;gap:32px;font-size:16px;margin-top:4px"><strong>Total TTC</strong><span style="font-family:var(--mono);font-weight:800;color:var(--accent)">${Utils.fmtEur(totalTTC)}</span></div>
        </div>
      </div>`;

    Modals.open('modal-invoice');
  },

  export() { Toast.info('Export Excel — intégration SheetJS à venir.'); },
};

/* ── Phases ── */
const Phases = {
  toggle(id) {
    const body  = Utils.$('ph-body-' + id);
    const chev  = Utils.$('ph-ch-' + id);
    if (!body) return;
    body.classList.toggle('open');
    if (chev) chev.style.transform = body.classList.contains('open') ? 'rotate(180deg)' : '';
  },

  async toggleTask(phId, taskId, done) {
    const { error } = await DB.from('phase_tasks').update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', taskId);
    if (error) { Toast.err('Erreur.'); return; }
    const tasks = S.phaseTasks[phId];
    if (tasks) { const t = tasks.find(t => t.id === taskId); if (t) t.done = done; }
    Render.phases();
  },

  async addTask(phId) {
    const d = prompt('Nouvelle tâche :');
    if (!d?.trim()) return;
    const { data, error } = await DB.from('phase_tasks').insert({
      phase_id: phId, description: d.trim(), sort_order: (S.phaseTasks[phId] || []).length,
    }).select().single();
    if (error) { Toast.err('Erreur.'); return; }
    (S.phaseTasks[phId] = S.phaseTasks[phId] || []).push(data);
    Render.phases();
  },

  async delete(id) {
    if (!confirm('Supprimer cette phase et ses tâches ?')) return;
    await DB.from('phase_tasks').delete().eq('phase_id', id);
    const { error } = await DB.from('phases').delete().eq('id', id);
    if (error) { Toast.err('Erreur.'); return; }
    S.phases = S.phases.filter(p => p.id !== id);
    delete S.phaseTasks[id];
    Render.phases(); Render.gantt(); Toast.warn('Phase supprimée.');
  },

  selectColor(el) {
    Utils.$$('.color-swatch').forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
    S.selectedPhaseColor = el.dataset.color;
    const inp = Utils.$('ph-color');
    if (inp) inp.value = el.dataset.color;
  },

  async add() {
    if (!S.activeProject) { Toast.warn('Sélectionnez un projet.'); return; }
    const name = Utils.$('ph-name')?.value.trim();
    if (!name) { Toast.err('Nom requis.'); return; }
    const tasks = (Utils.$('ph-tasks')?.value || '').split('\n').filter(t => t.trim());

    Utils.setBtn('btn-add-phase', true, 'Ajout…');
    const { data: phase, error } = await DB.from('phases').insert({
      project_id:  S.activeProject.id,
      name,
      start_date:  Utils.$('ph-start')?.value || null,
      end_date:    Utils.$('ph-end')?.value   || null,
      responsible: Utils.$('ph-resp')?.value,
      status:      Utils.$('ph-status')?.value || 'not-started',
      notes:       Utils.$('ph-notes')?.value,
      color:       S.selectedPhaseColor,
      sort_order:  S.phases.length,
    }).select().single();
    Utils.setBtn('btn-add-phase', false);

    if (error) { Toast.err('Erreur: ' + error.message); return; }
    S.phases.push(phase);

    if (tasks.length) {
      const { data: tData } = await DB.from('phase_tasks').insert(
        tasks.map((d, i) => ({ phase_id: phase.id, description: d.trim(), sort_order: i }))
      ).select();
      S.phaseTasks[phase.id] = tData || [];
    } else {
      S.phaseTasks[phase.id] = [];
    }

    Render.phases(); Render.gantt();
    Modals.close('modal-phase');
    Toast.ok('Phase ajoutée.');
    Utils.clearForm(['ph-name','ph-start','ph-end','ph-resp','ph-tasks','ph-notes']);
  },
};

/* ── Photos ── */
const Photos = {
  handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    this.handleFiles(e.dataTransfer.files);
  },
  handleFiles(files) {
    S.selectedPhotoFiles = Array.from(files);
    const prev = Utils.$('photo-preview');
    if (prev) prev.innerHTML = S.selectedPhotoFiles.map(f =>
      `<div class="photo-preview-item"><i class="ti ti-photo" style="font-size:13px"></i>${f.name} <span style="color:var(--tx3)">(${(f.size/1024/1024).toFixed(1)}MB)</span></div>`
    ).join('');
  },

  async upload() {
    if (!S.activeProject) { Toast.warn('Sélectionnez un projet.'); return; }
    if (!S.selectedPhotoFiles.length) { Toast.warn('Sélectionnez au moins un fichier.'); return; }

    Utils.setBtn('btn-upload-photo', true, 'Upload…');
    let uploaded = 0;

    for (const file of S.selectedPhotoFiles) {
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${S.activeProject.id}/${Date.now()}_${safeName}`;
        await Storage.upload('photos', path, file, { contentType: file.type });

        const tags = (Utils.$('ph2-tags')?.value || '').split(',').map(t => t.trim()).filter(Boolean);
        const { data: row } = await DB.from('photos').insert({
          project_id:     S.activeProject.id,
          phase_id:       Utils.$('ph2-phase')?.value || null,
          storage_path:   path,
          file_name:      file.name,
          file_size:      file.size,
          mime_type:      file.type,
          description:    Utils.$('ph2-desc')?.value,
          location_label: Utils.$('ph2-loc')?.value,
          tags,
          uploaded_by:    S.user?.id,
        }).select('*, profiles(full_name)').single();

        if (row) { S.photos.unshift(row); uploaded++; }
      } catch (err) {
        Toast.err('Erreur upload: ' + err.message);
      }
    }

    Utils.setBtn('btn-upload-photo', false);
    Render.photos();
    Modals.close('modal-photo');
    Toast.ok(uploaded + ' photo(s) téléversée(s).');
    S.selectedPhotoFiles = [];
    if (Utils.$('photo-preview')) Utils.$('photo-preview').innerHTML = '';
    Utils.clearForm(['ph2-loc','ph2-desc','ph2-tags']);
  },

  async view(id) {
    const ph = S.photos.find(p => p.id === id);
    if (!ph) return;

    let url = null;
    if (ph.storage_path) {
      url = await Storage.resolveUrl('photos', ph.storage_path).catch(() => null);
    }

    Utils.$('lightbox-body').innerHTML = `
      ${url ? `<img class="lightbox-img" src="${url}" alt="${ph.location_label||''}" onerror="this.style.display='none'">` : ''}
      <div class="lightbox-meta">${Utils.fmtDateTime(ph.created_at)} · ${ph.profiles?.full_name||'—'} · ${ph.location_label||''}</div>
      ${ph.description ? `<div class="lightbox-desc">${ph.description}</div>` : ''}
      <div class="lightbox-tags">${(ph.tags||[]).map(t=>`<span class="photo-tag">${t}</span>`).join('')}</div>
      <div style="display:flex;gap:8px;margin-top:14px">
        ${url ? `<a href="${url}" target="_blank" rel="noopener" class="btn btn-sm"><i class="ti ti-external-link"></i>Ouvrir</a>
                 <a href="${url}" download="${ph.file_name||'photo'}" class="btn btn-sm"><i class="ti ti-download"></i>Télécharger</a>` : ''}
        <button class="btn btn-xs btn-red" onclick="App.Photos.delete('${ph.id}')"><i class="ti ti-trash"></i>Supprimer</button>
      </div>`;
    Modals.open('modal-lightbox');
  },

  async delete(id) {
    const ph = S.photos.find(p => p.id === id);
    if (!ph || !confirm('Supprimer cette photo ?')) return;
    if (ph.storage_path) await Storage.remove('photos', ph.storage_path);
    await DB.from('photos').delete().eq('id', id);
    S.photos = S.photos.filter(p => p.id !== id);
    Modals.close('modal-lightbox');
    Render.photos();
    Toast.warn('Photo supprimée.');
  },

  applyFilter() {
    const phaseId = Utils.$('photo-filter-phase')?.value || '';
    Render.photos(phaseId);
  },
};

/* ── Documents ── */
const Documents = {
  handleFile(file) {
    S.selectedDocFile = file;
    const prev = Utils.$('doc-file-preview');
    if (prev) prev.innerHTML = file
      ? `<div class="photo-preview-item" style="margin-top:8px"><i class="ti ti-file" style="font-size:13px"></i>${file.name} <span style="color:var(--tx3)">(${(file.size/1024/1024).toFixed(1)}MB)</span></div>`
      : '';
  },

  async upload() {
    if (!S.activeProject) { Toast.warn('Sélectionnez un projet.'); return; }
    if (!S.selectedDocFile) { Toast.warn('Sélectionnez un fichier.'); return; }
    Utils.setBtn('btn-upload-doc', true, 'Upload…');
    try {
      const file = S.selectedDocFile;
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${S.activeProject.id}/${Date.now()}_${safeName}`;
      await Storage.upload('documents', path, file, { contentType: file.type });

      const { data } = await DB.from('documents').insert({
        project_id:   S.activeProject.id,
        storage_path: path,
        file_name:    file.name,
        file_size:    file.size,
        mime_type:    file.type,
        doc_type:     Utils.$('doc-type')?.value || 'other',
        version:      Utils.$('doc-version')?.value || 'v1',
        description:  Utils.$('doc-desc')?.value,
        uploaded_by:  S.user?.id,
      }).select('*, profiles(full_name)').single();

      if (data) S.documents.unshift(data);
      Render.documents();
      Modals.close('modal-document');
      Toast.ok('Document téléversé.');
      S.selectedDocFile = null;
      if (Utils.$('doc-file-preview')) Utils.$('doc-file-preview').innerHTML = '';
      Utils.clearForm(['doc-desc']);
    } catch (err) {
      Toast.err('Erreur upload: ' + err.message);
    }
    Utils.setBtn('btn-upload-doc', false);
  },

  async open(id) {
    const d = S.documents.find(x => x.id === id);
    if (!d?.storage_path) { Toast.warn('Chemin introuvable.'); return; }
    const url = await Storage.resolveUrl('documents', d.storage_path).catch(() => null);
    if (url) window.open(url, '_blank');
    else Toast.err('Impossible d\'ouvrir le fichier.');
  },

  async download(id) {
    const d = S.documents.find(x => x.id === id);
    if (!d?.storage_path) { Toast.warn('Chemin introuvable.'); return; }
    const url = await Storage.resolveUrl('documents', d.storage_path).catch(() => null);
    if (!url) { Toast.err('Impossible de télécharger.'); return; }
    const a = document.createElement('a');
    a.href = url; a.download = d.file_name || 'document'; a.target = '_blank';
    a.click();
  },

  async delete(id) {
    const d = S.documents.find(x => x.id === id);
    if (!d || !confirm('Supprimer ce document ?')) return;
    if (d.storage_path) await Storage.remove('documents', d.storage_path);
    await DB.from('documents').delete().eq('id', id);
    S.documents = S.documents.filter(x => x.id !== id);
    Render.documents();
    Toast.warn('Document supprimé.');
  },
};

/* ── Calendar ── */
const Calendar = {
  prev() { if (S.calMonth === 0) { S.calMonth = 11; S.calYear--; } else S.calMonth--; Render.calendar(); },
  next() { if (S.calMonth === 11) { S.calMonth = 0; S.calYear++; } else S.calMonth++; Render.calendar(); },

  async addEvent() {
    const title = Utils.$('ev-title')?.value.trim();
    if (!title) { Toast.err('Titre requis.'); return; }
    Utils.setBtn('btn-add-event', true, 'Création…');

    const { data, error } = await DB.from('events').insert({
      title,
      event_date:  Utils.$('ev-date')?.value,
      event_time:  Utils.$('ev-time')?.value,
      event_type:  Utils.$('ev-type')?.value,
      project_id:  Utils.$('ev-project')?.value || null,
      location:    Utils.$('ev-loc')?.value,
      participants:Utils.$('ev-parts')?.value,
      notes:       Utils.$('ev-notes')?.value,
      created_by:  S.user?.id,
    }).select('*, projects(name)').single();
    Utils.setBtn('btn-add-event', false);

    if (error) { Toast.err('Erreur: ' + error.message); return; }
    S.events.push(data);
    S.events.sort((a, b) => (a.event_date||'').localeCompare(b.event_date||''));
    Render.calendar(); Render.dashboard();
    Modals.close('modal-event');
    Toast.ok('Événement créé.');
    Utils.clearForm(['ev-title','ev-loc','ev-parts','ev-notes']);
  },

  async deleteEvent(id) {
    if (!confirm('Supprimer cet événement ?')) return;
    await DB.from('events').delete().eq('id', id);
    S.events = S.events.filter(e => e.id !== id);
    Render.calendar(); Render.dashboard();
    Toast.warn('Événement supprimé.');
  },
};

/* ── Chat ── */
const Chat = {
  async switchRoom(id) {
    S.activeRoom = S.chatRooms.find(r => r.id === id);
    await Data.loadMessages();
    Realtime.subscribe();
    Render.chat();
  },

  async send() {
    const input = Utils.$('chat-input');
    const body  = input?.value.trim();
    if (!body || !S.activeRoom) return;
    input.value = '';
    input.style.height = '';
    const { error } = await DB.from('chat_messages').insert({
      room_id:   S.activeRoom.id,
      author_id: S.user?.id,
      body,
    });
    if (error) { Toast.err('Erreur envoi: ' + error.message); if (input) input.value = body; }
  },

  onKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); } },

  autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  },

  toggleSidebar() {
    Utils.$('chat-sidebar')?.classList.toggle('mobile-open');
  },

  async createDefaultRooms() {
    if (!S.activeProject) { Toast.warn('Sélectionnez un projet.'); return; }
    const { data } = await DB.from('chat_rooms').insert([
      { project_id: S.activeProject.id, name: 'Général — ' + S.activeProject.name, room_type: 'general', icon: '💬', icon_bg: '#1a2a1e' },
      { project_id: S.activeProject.id, name: 'Équipe terrain', room_type: 'ops', icon: '👷', icon_bg: '#1a1f2e' },
    ]).select();
    S.chatRooms = [...S.chatRooms, ...(data||[])];
    Render.chat(); Toast.ok('Salons créés.');
  },
};

/* ── Team ── */
const Team = {
  async add() {
    const first = Utils.$('m-first')?.value.trim();
    const last  = Utils.$('m-last')?.value.trim();
    if (!first || !last) { Toast.err('Prénom et nom requis.'); return; }
    Toast.info('Invitation — fonctionnalité à connecter à l\'envoi d\'email Supabase.');
    Modals.close('modal-member');
  },
};

/* ── Search ── */
const Search = {
  handle: Utils.debounce(function(val) {
    if (!val || val.length < 2) return;
    const matches = S.projects.filter(p =>
      p.name.toLowerCase().includes(val.toLowerCase()) ||
      (p.client||'').toLowerCase().includes(val.toLowerCase())
    );
    if (matches.length === 1) Projects.open(matches[0].id);
    else if (matches.length > 1) {
      Nav.show('projets');
      Toast.info(matches.length + ' projets trouvés.');
    }
  }, 400),
};

/* ════════════════════════════════════════════════════════════════
   COLOR PICKER INIT
   ════════════════════════════════════════════════════════════════ */
function initColorPicker() {
  const colors = ['#f0a500','#34d399','#60a5fa','#f87171','#a78bfa','#fb923c','#22d3ee','#4ade80'];
  const picker = Utils.$('phase-color-picker');
  if (!picker) return;
  picker.innerHTML = colors.map(c =>
    `<div class="color-swatch${c===S.selectedPhaseColor?' selected':''}" data-color="${c}" style="background:${c}"
      onclick="App.Phases.selectColor(this)"></div>`
  ).join('');
}

/* ════════════════════════════════════════════════════════════════
   BOOT — initialisation
   ════════════════════════════════════════════════════════════════ */
const App = {
  Auth, Nav, Modals, Projects, Bordereau, Phases, Photos, Documents, Calendar, Chat, Team, Search, Utils,

  async init() {
    Loading.setMsg('Vérification de la session…');

    // Set today's date in event form
    const evDate = Utils.$('ev-date');
    if (evDate) evDate.value = new Date().toISOString().split('T')[0];

    // Init color picker
    initColorPicker();

    // Conn status
    try {
      const { error } = await DB.from('profiles').select('id').limit(1);
      const dot = Utils.$('sb-conn')?.querySelector('.conn-dot');
      const txt = Utils.$('sb-conn')?.querySelector('span');
      if (error) {
        if (dot) { dot.classList.remove('conn-ok'); dot.classList.add('conn-err'); }
        if (txt) txt.textContent = 'Hors ligne';
      }
    } catch (e) {
      console.warn('DB check failed:', e);
    }

    // Check existing session
    Loading.setMsg('Chargement de la session…');
    const { data: { session } } = await DB.auth.getSession();

    if (session?.user) {
      S.user = session.user;
      Loading.setMsg('Chargement du profil…');
      await this._loadProfile();
      Loading.setMsg('Chargement des projets…');
      await Data.loadProjects();
      Loading.hide();
      // Show code step if projects available
      Utils.$('auth-screen')?.classList.remove('hidden');
      Auth.goStep('step-code');
    } else {
      Loading.hide();
      Utils.$('auth-screen')?.classList.remove('hidden');
      Auth.goStep('step-auth');
    }

    // Auth state listener
    DB.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        S.user = session.user;
        await this._loadProfile();
        await Data.loadProjects();
        Utils.$('auth-screen')?.classList.remove('hidden');
        Auth.goStep('step-code');
      } else if (event === 'SIGNED_OUT') {
        S.user = null; S.profile = null; S.projects = []; S.activeProject = null;
        S.bordereau = []; S.phases = []; S.photos = []; S.documents = []; S.events = [];
        S.chatRooms = []; S.messages = []; S.team = [];
        Utils.$('app')?.classList.add('hidden');
        Utils.$('auth-screen')?.classList.remove('hidden');
        Utils.$('auth-screen')?.classList.remove('out');
        Auth.goStep('step-auth');
      }
    });

    // Enter key on auth forms
    document.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const stepAuth = Utils.$('step-auth');
        if (stepAuth?.classList.contains('active')) {
          const loginForm = Utils.$('form-login');
          if (!loginForm?.classList.contains('hidden')) Auth.login();
          else Auth.signup();
        }
      }
    });
  },

  async _loadProfile() {
    if (!S.user) return;
    const { data } = await DB.from('profiles').select('*').eq('id', S.user.id).single();
    if (data) {
      S.profile = data;
      const name = data.full_name;
      const nameEl = Utils.$('sb-user-name');
      const roleEl = Utils.$('sb-user-role');
      const avEl   = Utils.$('sb-avatar');
      if (nameEl) nameEl.textContent = name;
      if (roleEl) roleEl.textContent = Utils.roleLabel(data.role);
      if (avEl)   { avEl.textContent = Utils.initials(name); avEl.style.background = Utils.avatarColor(name); }
    }
  },
};

// Close user dropdown when clicking outside
document.addEventListener('click', e => {
  const dropdown = Utils.$('user-dropdown');
  const userBtn  = dropdown?.closest('.sb-user');
  if (dropdown && !dropdown.classList.contains('hidden') && !userBtn?.contains(e.target)) {
    dropdown.classList.add('hidden');
  }
});

// Start
document.addEventListener('DOMContentLoaded', () => App.init());
