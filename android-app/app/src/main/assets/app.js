(function () {
  'use strict';

  const KEY = 'gestion_clientes_data_v1';
  const CLOUD_TABLE = 'gestion_clientes';
  const CLOUD_SETUP_SQL = String.raw`-- Añade la tabla que necesita Gestión Clientes al proyecto Supabase existente.
-- No modifica ni borra la tabla ivory37_sync de Control Laboral.
-- Se puede ejecutar más de una vez sin borrar datos.

create table if not exists public.gestion_clientes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.gestion_clientes
  add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.gestion_clientes
  add column if not exists updated_at timestamptz not null default now();
alter table public.gestion_clientes enable row level security;

revoke all on table public.gestion_clientes from public, anon, authenticated;
grant select, insert, update on table public.gestion_clientes to authenticated;

drop policy if exists "Users can read their own company data" on public.gestion_clientes;
drop policy if exists "Users can create their own company data" on public.gestion_clientes;
drop policy if exists "Users can update their own company data" on public.gestion_clientes;
drop policy if exists "Users can read their own Gestión Clientes data" on public.gestion_clientes;
drop policy if exists "Users can create their own Gestión Clientes data" on public.gestion_clientes;
drop policy if exists "Users can update their own Gestión Clientes data" on public.gestion_clientes;

create policy "Users can read their own Gestión Clientes data"
  on public.gestion_clientes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can create their own Gestión Clientes data"
  on public.gestion_clientes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own Gestión Clientes data"
  on public.gestion_clientes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Actualiza la caché de esquema de PostgREST inmediatamente.
notify pgrst, 'reload schema';`;
  const COLLECTIONS = ['leads', 'clients', 'works', 'tasks', 'quotes', 'invoices', 'payments', 'expenses', 'events', 'documents', 'team'];
  const CANARY_ISLANDS = ['Gran Canaria', 'Tenerife', 'Lanzarote', 'Fuerteventura', 'La Palma', 'La Gomera', 'El Hierro', 'La Graciosa'];
  const TITLES = { dashboard: 'Resumen', myday: 'Mi día', agenda: 'Agenda', visits: 'Visitas', leads: 'Leads', clients: 'Clientes', works: 'Obras', tasks: 'Tareas', incidents: 'Incidencias', maintenance: 'Mantenimiento', checklists: 'Checklists', quotes: 'Presupuestos', finance: 'Facturas y gastos', documents: 'Documentos', reports: 'Informes', team: 'Equipo', settings: 'Ajustes' };
  const TASK_CATEGORIES = ['General', 'Incidencia', 'Mantenimiento', 'Checklist'];
  const STATUS = {
    lead: ['Nuevo', 'Contactado', 'Cualificado', 'Propuesta enviada', 'Ganado', 'Perdido'],
    work: ['Pendiente', 'Planificada', 'En curso', 'Pausada', 'Terminada', 'Cancelada'],
    task: ['Pendiente', 'En curso', 'Hecha'],
    quote: ['Borrador', 'Enviada', 'Aceptada', 'Rechazada', 'Vencida'],
    invoice: ['Borrador', 'Emitida', 'Parcial', 'Pagada', 'Vencida']
  };
  const $ = (s, root) => (root || document).querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const nowIso = () => new Date().toISOString();
  const dateKey = (d) => { const x = d || new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const today = dateKey();
  const money = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(v) || 0);
  const num = (v) => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const dateFmt = (v, options) => { if (!v) return '—'; const d = new Date(String(v).slice(0, 10) + 'T12:00:00'); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES', options || { day: '2-digit', month: 'short', year: 'numeric' }); };
  const safeHref = (value) => { try { const u = new URL(String(value || ''), location.href); return ['https:', 'http:', 'mailto:'].includes(u.protocol) ? u.href : '#'; } catch (_) { return '#'; } };
  const monthFmt = (v) => v ? new Date(v + '-01T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) : '';
  const optionHtml = (items, selected, emptyLabel) => '<option value="">' + esc(emptyLabel || 'Sin asignar') + '</option>' + items.map(x => '<option value="' + esc(x.id) + '"' + (String(x.id) === String(selected || '') ? ' selected' : '') + '>' + esc(x.name || x.title || 'Sin nombre') + '</option>').join('');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const emptyData = () => ({ version: 1, company: { name: '', taxId: '', phone: '', email: '', address: '', currency: 'EUR', taxName: 'IGIC', taxRate: 7, owner: '' }, leads: [], clients: [], works: [], tasks: [], quotes: [], invoices: [], payments: [], expenses: [], events: [], documents: [], team: [], _meta: { deleted: {} } });

  function normalize(input) {
    const source = input && typeof input === 'object' ? input : {};
    const out = emptyData();
    Object.assign(out.company, source.company && typeof source.company === 'object' ? source.company : {});
    // Migrate the old mainland IVA default to the general Canary Islands IGIC rate.
    if (!source.company || !source.company.taxName) {
      out.company.taxName = 'IGIC';
      if (source.company && num(source.company.taxRate) === 21) out.company.taxRate = 7;
    }
    COLLECTIONS.forEach(k => { out[k] = Array.isArray(source[k]) ? source[k].filter(x => x && x.id != null).map(x => Object.assign({}, x, { id: String(x.id) })) : []; });
    out.tasks.forEach(task => { if (!TASK_CATEGORIES.includes(task.category)) task.category = 'General'; });
    ['quotes', 'invoices'].forEach(k => out[k].forEach(item => {
      if (item.taxRate == null) item.taxRate = out.company.taxRate;
      if (!item.taxName) item.taxName = num(item.taxRate) === 21 ? 'Impuesto anterior' : out.company.taxName;
      if (item.status === 'Borrador' && num(item.taxRate) === 21 && (!source.company || !source.company.taxName)) {
        item.taxRate = out.company.taxRate;
        item.taxName = out.company.taxName;
      }
    }));
    out._meta = source._meta && typeof source._meta === 'object' ? source._meta : { deleted: {} };
    if (!out._meta.deleted) out._meta.deleted = {};
    return out;
  }

  function restoreBridgeStorage() {
    const bridge = window.AndroidBridge;
    if (!bridge || typeof bridge.getLocalStorageSnapshot !== 'function') return;
    try {
      const snapshot = JSON.parse(bridge.getLocalStorageSnapshot() || '{}');
      Object.keys(snapshot).forEach(key => {
        if (typeof snapshot[key] === 'string' && localStorage.getItem(key) === null) localStorage.setItem(key, snapshot[key]);
      });
    } catch (_) {}
  }
  restoreBridgeStorage();
  let data = load();
  let view = 'dashboard';
  let searchText = '';
  let filterValue = 'all';
  let supa = null;
  let cloudUser = null;
  let cloudProblem = '';
  let cloudSetupRequired = false;
  let cloudEmailDraft = '';
  let syncTimer = null;
  let cloudBusy = false;
  let settingsTab = 'empresa';
  let agendaMonth = today.slice(0, 7);
  let myDayDate = today;
  let islandFilter = 'all';
  const viewModes = { leads: 'board', works: 'board', tasks: 'board' };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? normalize(JSON.parse(raw)) : emptyData();
    } catch (err) {
      console.error('No se pudieron cargar los datos locales de Gestión Clientes.', err);
      return emptyData();
    }
  }

  function save(scheduleSync) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      mirrorBridgeStorage();
      $('#sync-label').textContent = 'Guardado en este dispositivo';
      $('#sync-pill').dataset.state = 'local';
      if (scheduleSync !== false && cloudUser) {
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => syncCloud(false), 900);
      }
      return true;
    } catch (err) {
      toast('No se pudieron guardar los cambios. Libera espacio o exporta una copia.', 'bad');
      return false;
    }
  }

  function commitChange(mutate) {
    const previous = clone(data);
    mutate();
    if (save()) return true;
    data = previous;
    return false;
  }

  function mirrorBridgeStorage() {
    const snapshot = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) snapshot[key] = localStorage.getItem(key);
      }
      const serialized = JSON.stringify(snapshot);
      if (window.AndroidBridge && typeof window.AndroidBridge.saveLocalStorage === 'function') window.AndroidBridge.saveLocalStorage(serialized);
      if (window.GestionClientesDesktopBridge && typeof window.GestionClientesDesktopBridge.saveLocalStorage === 'function') window.GestionClientesDesktopBridge.saveLocalStorage(serialized);
    } catch (_) {}
  }

  function toast(message, kind) {
    const node = document.createElement('div');
    node.className = 'toast ' + (kind || '');
    node.textContent = message;
    $('#toast-root').appendChild(node);
    setTimeout(() => node.remove(), 3400);
  }

  function setView(next) {
    view = next;
    searchText = '';
    filterValue = 'all';
    islandFilter = 'all';
    if (next === 'myday') myDayDate = today;
    closeGlobalSearch(true);
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $('#crumb-title').textContent = TITLES[view] || 'Resumen';
    $('#sidebar').classList.remove('open');
    render();
  }
  function applyTheme() {
    const theme = localStorage.getItem(KEY + '_theme') === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    const themeColor = $('meta[name="theme-color"]');
    if (themeColor) themeColor.content = theme === 'light' ? '#f5f1e6' : '#0a0f0d';
    const toggle = $('#theme-toggle');
    if (toggle) {
      const nextTheme = theme === 'dark' ? 'claro' : 'oscuro';
      toggle.textContent = theme === 'dark' ? '☼' : '☾';
      toggle.setAttribute('aria-label', 'Activar modo ' + nextTheme);
      toggle.title = 'Activar modo ' + nextTheme;
    }
  }
  function toggleTheme() {
    localStorage.setItem(KEY + '_theme', document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
    applyTheme();
  }
  function normalizeSearchText(value) {
    return String(value == null ? '' : value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  }
  function globalSearchMatches(query) {
    const types = [
      ['lead', 'Lead', data.leads], ['client', 'Cliente', data.clients], ['work', 'Obra', data.works],
      ['task', 'Tarea', data.tasks], ['quote', 'Presupuesto', data.quotes], ['invoice', 'Factura', data.invoices],
      ['document', 'Documento', data.documents]
    ];
    const q = normalizeSearchText(query);
    return types.flatMap(([type, label, rows]) => rows.map(item => {
      const title = item.name || item.company || item.title || item.number || item.kind || 'Sin título';
      const relation = [clientName(item.clientId), workName(item.workId)].filter(Boolean).join(' · ');
      const detail = type === 'lead' ? [item.company, item.phone, item.email, item.stage].filter(Boolean).join(' · ')
        : type === 'client' ? [item.company, item.phone, item.email].filter(Boolean).join(' · ')
        : type === 'work' ? [clientName(item.clientId), item.status, item.address].filter(Boolean).join(' · ')
        : type === 'task' ? [relation, item.status, item.due ? dateFmt(item.due) : ''].filter(Boolean).join(' · ')
        : type === 'quote' || type === 'invoice' ? [relation, item.status, item.number].filter(Boolean).join(' · ')
        : [relation, item.kind].filter(Boolean).join(' · ');
      const haystack = normalizeSearchText(JSON.stringify(item) + ' ' + relation);
      if (!haystack.includes(q)) return null;
      const titleMatch = normalizeSearchText(title);
      const rank = titleMatch === q ? 0 : titleMatch.startsWith(q) ? 1 : titleMatch.includes(q) ? 2 : 3;
      return { type, label, item, title, detail, rank };
    })).filter(Boolean).sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title, 'es')).slice(0, 7);
  }
  function renderGlobalSearch(query) {
    const input = $('#global-search-input');
    const results = $('#global-search-results');
    if (!input || !results) return;
    const value = String(query || '').trim();
    if (!value) {
      results.innerHTML = '<div class="global-search-empty">Escribe un nombre, teléfono o número para buscar.</div>';
      results.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      return;
    }
    const matches = globalSearchMatches(value);
    results.innerHTML = matches.length ? matches.map(result => '<button type="button" role="option" class="global-search-result" data-action="detail" data-type="' + result.type + '" data-id="' + esc(result.item.id) + '"><span class="global-result-mark" aria-hidden="true">' + esc(result.label.slice(0, 1)) + '</span><span class="global-result-copy"><strong>' + esc(result.title) + '</strong><small>' + esc(result.label + (result.detail ? ' · ' + result.detail : '')) + '</small></span><span class="global-result-arrow" aria-hidden="true">↵</span></button>').join('') : '<div class="global-search-empty">No hay resultados para «' + esc(value) + '».</div>';
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  function closeGlobalSearch(clear) {
    const input = $('#global-search-input');
    const results = $('#global-search-results');
    if (clear && input) input.value = '';
    if (results) results.hidden = true;
    if (input) input.setAttribute('aria-expanded', 'false');
  }
  function $$(s, root) { return Array.from((root || document).querySelectorAll(s)); }
  function clientName(id) { const x = data.clients.find(r => r.id === id); return x ? (x.company || x.name) : ''; }
  function workName(id) { const x = data.works.find(r => r.id === id); return x ? x.name : ''; }
  function teamName(id) { const x = data.team.find(r => r.id === id); return x ? x.name : ''; }
  function roundMoney(value) { return Math.round((num(value) + Number.EPSILON) * 100) / 100; }
  function quoteLineTotal(item) { return roundMoney(Math.max(0, num(item.quantity)) * Math.max(0, num(item.unitPrice))); }
  function quoteBase(items) { return roundMoney((items || []).reduce((sum, item) => sum + quoteLineTotal(item), 0)); }
  function taxAmount(row) { return roundMoney(Math.max(0, num(row.amount)) * Math.max(0, num(row.taxRate)) / 100); }
  function total(row) { return roundMoney(Math.max(0, num(row.amount)) + taxAmount(row)); }
  function paidFor(invoice) { return data.payments.filter(p => p.invoiceId === invoice.id).reduce((s, p) => s + num(p.amount), 0); }
  function outstanding(invoice) { return Math.max(0, total(invoice) - paidFor(invoice)); }
  function statusClass(status) {
    const s = String(status || '').toLowerCase();
    if (/ganado|terminada|hecha|pagada|aceptada/.test(s)) return 'green';
    if (/curso|enviada|emitida|parcial|cualificado/.test(s)) return 'blue';
    if (/vencid|perdid|cancelad|rechazad|pausad/.test(s)) return 'red';
    if (/propuesta|contactado|planific|borrador/.test(s)) return 'yellow';
    if (/nuevo|pendiente/.test(s)) return 'lime';
    return '';
  }
  function badge(status) { return '<span class="badge ' + statusClass(status) + '">' + esc(status || 'Sin estado') + '</span>'; }
  function selected(arr, id, empty) {
    const found = arr.find(x => String(x.id) === String(id));
    return found ? (found.company || found.name || found.title) : (empty || 'Sin asignar');
  }
  function personOption() { return data.team.filter(x => x.active !== false).map(x => ({ id: x.id, name: x.name })); }

  function render() {
    document.title = (data.company.name || 'Gestión Clientes') + ' · ' + (TITLES[view] || 'Gestión');
    $('#company-name-side').textContent = data.company.name || 'Mi empresa';
    $('#user-name-side').textContent = data.company.owner || 'Tu perfil';
    const initials = (data.company.owner || data.company.name || 'GC').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
    $('#user-avatar').textContent = initials;
    $('#user-avatar-top').textContent = initials;
    $('#today-label').textContent = new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
    const overdue = data.tasks.filter(t => t.status !== 'Hecha' && t.due && t.due < today).length;
    const leadsDue = data.leads.filter(l => l.stage !== 'Ganado' && l.stage !== 'Perdido' && l.nextDate && l.nextDate <= today).length;
    const todayCount = data.tasks.filter(t => t.status !== 'Hecha' && t.due === today).length + data.events.filter(e => e.date === today).length + data.leads.filter(l => !['Ganado', 'Perdido'].includes(l.stage) && l.nextDate === today).length;
    const incidentsDue = data.tasks.filter(t => t.category === 'Incidencia' && t.status !== 'Hecha').length;
    const visitsDue = data.events.filter(e => e.kind === 'Visita de obra' && e.date >= today).length;
    $('#tasks-count').textContent = overdue ? String(overdue) : '';
    $('#leads-count').textContent = leadsDue ? String(leadsDue) : '';
    $('#agenda-count').textContent = String(upcomingCount() || '');
    $('#myday-count').textContent = String(todayCount || '');
    $('#incidents-count').textContent = String(incidentsDue || '');
    $('#visits-count').textContent = String(visitsDue || '');
    const root = $('#view-root');
    root.innerHTML = view === 'dashboard' ? renderDashboard()
      : view === 'myday' ? renderMyDay()
      : view === 'agenda' ? renderAgenda()
      : view === 'visits' ? renderVisits()
      : view === 'team' ? renderTeam()
      : ['incidents', 'maintenance', 'checklists'].includes(view) ? renderTaskCategory(view)
      : view === 'settings' ? renderSettings()
      : view === 'reports' ? renderReports()
      : view === 'finance' ? renderFinance()
      : view === 'documents' ? renderListView('documents')
      : renderListView(view);
  }

  function header(eyebrow, title, sub, actions) {
    return '<div class="page-head"><div><p class="eyebrow">' + esc(eyebrow) + '</p><h1>' + esc(title) + '</h1>' + (sub ? '<p class="page-sub">' + esc(sub) + '</p>' : '') + '</div><div class="head-actions">' + (actions || '') + '</div></div>';
  }
  function btn(label, action, type, extra) {
    return '<button class="btn ' + (type || '') + '" data-action="' + esc(action) + '"' + (extra || '') + '>' + label + '</button>';
  }
  function newBtn(type, label, attributes) { return btn('<span>＋</span>' + esc(label), 'new', 'btn-primary', ' data-type="' + type + '"' + (attributes || '')); }
  function empty(title, copy, type, label, attributes) {
    return '<div class="empty"><strong>' + esc(title) + '</strong>' + esc(copy) + (type ? newBtn(type, label || 'Crear primero', attributes) : '') + '</div>';
  }
  function card(title, content, sub, action) {
    return '<section class="card"><div class="card-head"><div><h2>' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' + (action || '') + '</div>' + content + '</section>';
  }
  function row(title, sub, status, end, actionType, actionId, kind) {
    return '<div class="row-item" data-action="detail" data-type="' + esc(kind || '') + '" data-id="' + esc(actionId || '') + '"><div class="row-main"><div class="row-title">' + esc(title) + (status ? badge(status) : '') + '</div><div class="row-sub">' + esc(sub || '') + '</div></div><div class="row-end">' + (end || '') + '</div></div>';
  }
  function amountEnd(value, date) { return '<div><div class="row-amount">' + esc(money(value)) + '</div><div class="row-date">' + esc(date || '') + '</div></div>'; }

  function renderDashboard() {
    const activeWorks = data.works.filter(w => w.status === 'En curso').length;
    const openLeads = data.leads.filter(l => !['Ganado', 'Perdido'].includes(l.stage));
    const weighted = openLeads.reduce((sum, l) => sum + num(l.value) * (Number(l.probability || defaultProbability(l.stage)) / 100), 0);
    const outstandingTotal = data.invoices.reduce((s, i) => s + outstanding(i), 0);
    const dueTasks = data.tasks.filter(t => t.status !== 'Hecha' && t.due).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
    const followups = data.leads.filter(l => l.stage !== 'Ganado' && l.stage !== 'Perdido' && l.nextDate).sort((a, b) => a.nextDate.localeCompare(b.nextDate)).slice(0, 5);
    const workRows = data.works.filter(w => !['Terminada', 'Cancelada'].includes(w.status)).sort((a, b) => (a.end || '9999').localeCompare(b.end || '9999')).slice(0, 4);
    const pipeline = STATUS.lead.slice(0, 4).map(stage => {
      const subset = openLeads.filter(l => l.stage === stage);
      const max = Math.max(1, ...STATUS.lead.slice(0, 4).map(s => openLeads.filter(l => l.stage === s).length));
      return '<div class="pipe-step"><div class="pipe-label">' + esc(stage) + '</div><div class="pipe-value">' + subset.length + '</div><div class="pipe-bar"><i style="width:' + Math.round(subset.length / max * 100) + '%"></i></div></div>';
    }).join('');
    const setup = !data.company.name ? '<section class="setup-card"><h2>Deja lista tu empresa</h2><p>Completa los datos básicos y añade tu primer contacto para empezar.</p><div class="setup-steps"><span class="setup-step">1. Configura la empresa</span><span class="setup-step">2. Añade un lead o cliente</span><span class="setup-step">3. Crea una obra y sus tareas</span></div><div style="margin-top:11px">' + btn('Configurar empresa', 'settings-tab', 'btn-primary', ' data-tab="empresa"') + '</div></section>' : '';
    const hero = '<section class="hero dashboard-hero"><div class="hero-main"><p class="eyebrow">PANEL DE CONTROL · ' + esc(new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })) + '</p><h1>' + (data.company.name ? 'Bienvenido, <span>' + esc(data.company.owner || data.company.name) + '</span>' : 'Tu negocio, <span>bajo control.</span>') + '</h1><p>Clientes, obras y equipo en un mismo sitio. Aquí tienes lo que requiere atención y el estado actual del negocio.</p></div>' + dashboardFocus() + '<div class="hero-actions">' + newBtn('lead', 'Nuevo lead') + newBtn('client', 'Nuevo cliente') + newBtn('work', 'Nueva obra') + newBtn('quote', 'Nuevo presupuesto') + '</div></section>';
    const kpis = '<div class="kpis">' +
      kpi('Oportunidades abiertas', openLeads.length, money(weighted) + ' valor ponderado', '✳') +
      kpi('Obras activas', activeWorks, data.works.length + ' obras registradas', '▦') +
      kpi('Pendiente de cobro', money(outstandingTotal), data.invoices.filter(i => outstanding(i) > 0).length + ' facturas abiertas', '€') +
      kpi('Tareas abiertas', data.tasks.filter(t => t.status !== 'Hecha').length, dueTasks.filter(t => t.due && t.due < today).length + ' vencidas', '☷') + '</div>';
    const tasksContent = dueTasks.length ? '<div class="list">' + dueTasks.map(t => row(t.title, (workName(t.workId) || selected(data.clients, t.clientId) || 'Sin obra asignada') + ' · vence ' + dateFmt(t.due), t.status, '<span class="row-date">' + esc(dateFmt(t.due, { day: '2-digit', month: 'short' })) + '</span>', '', t.id, 'task')).join('') + '</div>' : empty('Sin tareas próximas', 'Crea tareas y asígnalas a una obra para tenerlas a mano.', 'task', 'Crear tarea');
    const leadContent = followups.length ? '<div class="list">' + followups.map(l => row(l.name || l.company, (l.company && l.name ? l.company + ' · ' : '') + 'seguimiento ' + dateFmt(l.nextDate), l.stage, '<span class="row-amount">' + esc(money(l.value)) + '</span>', '', l.id, 'lead')).join('') + '</div>' : empty('Sin seguimientos programados', 'Añade una fecha de seguimiento a un lead.', 'lead', 'Añadir lead');
    const worksContent = workRows.length ? '<div class="list">' + workRows.map(w => row(w.name, selected(data.clients, w.clientId) + (w.end ? ' · entrega ' + dateFmt(w.end) : ''), w.status, '<span class="row-amount">' + esc(money(w.budget)) + '</span>', '', w.id, 'work')).join('') + '</div>' : empty('Aún no hay obras', 'Las obras de tu empresa aparecerán aquí.', 'work', 'Crear obra');
    const todayPanel = renderAttention();
    const activity = renderRecentActivity();
    return setup + hero + kpis + todayPanel + '<div class="dashboard-columns">' + card('Embudo comercial', '<div class="pipeline">' + pipeline + '</div>', openLeads.length + ' oportunidades activas', '<button class="text-link" data-view="leads">Abrir CRM →</button>') + '<div class="dashboard-lower-grid">' + card('Tareas por delante', tasksContent, 'Próximos vencimientos', '<button class="text-link" data-view="tasks">Ver todas →</button>') + card('Obras en marcha', worksContent, 'Planificación y avance', '<button class="text-link" data-view="works">Ver todas →</button>') + activity + card('Seguimientos comerciales', leadContent, 'Próximas llamadas y oportunidades', '<button class="text-link" data-view="leads">Ver leads →</button>') + '</div></div>';
  }

  function renderAttention() {
    const tasks = data.tasks.filter(t => t.status !== 'Hecha' && t.due && t.due <= today).map(t => ({ type: 'task', id: t.id, rank: t.due, title: t.title, detail: (t.due < today ? 'Tarea vencida' : 'Tarea para hoy') + ' · ' + (workName(t.workId) || selected(data.clients, t.clientId) || 'Sin obra') }));
    const leads = data.leads.filter(l => !['Ganado', 'Perdido'].includes(l.stage) && l.nextDate && l.nextDate <= today).map(l => ({ type: 'lead', id: l.id, rank: l.nextDate, title: l.name || l.company || 'Seguimiento comercial', detail: (l.nextDate < today ? 'Seguimiento atrasado' : 'Seguimiento para hoy') + (l.company && l.name ? ' · ' + l.company : '') }));
    const staleCutoff = dateKey(new Date(Date.now() - 7 * 86400000));
    const staleLeads = data.leads.filter(l => !['Ganado', 'Perdido'].includes(l.stage) && !l.nextDate && String(l.updatedAt || l.createdAt || '').slice(0, 10) <= staleCutoff).map(l => ({ type: 'lead', id: l.id, rank: String(l.updatedAt || l.createdAt || '').slice(0, 10), title: l.name || l.company || 'Oportunidad sin seguimiento', detail: 'Lead sin próximo paso' + (l.island ? ' · ' + l.island : '') }));
    const urgentIncidents = data.tasks.filter(t => t.category === 'Incidencia' && t.status !== 'Hecha' && t.priority === 'Alta').map(t => ({ type: 'task', id: t.id, rank: t.due && t.due < today ? t.due : today, title: t.title || 'Incidencia urgente', detail: 'Incidencia de prioridad alta' + (t.due ? ' · vence ' + dateFmt(t.due) : '') }));
    const events = data.events.filter(e => e.date === today).map(e => ({ type: 'event', id: e.id, rank: e.date + (e.time || ''), title: e.title || 'Cita de hoy', detail: [e.time, e.kind, workName(e.workId) || selected(data.clients, e.clientId), e.island].filter(Boolean).join(' · ') }));
    const invoices = data.invoices.filter(i => outstanding(i) > 0 && i.due && i.due < today).map(i => ({ type: 'invoice', id: i.id, rank: i.due, title: i.title || 'Factura ' + i.number, detail: 'Factura vencida · ' + money(outstanding(i)) + ' pendiente' }));
    const dueWorks = data.works.filter(w => !['Terminada', 'Cancelada'].includes(w.status) && w.end && w.end >= today && w.end <= dateKey(new Date(Date.now() + 7 * 86400000))).map(w => ({ type: 'work', id: w.id, rank: w.end, title: w.name, detail: 'Fecha de entrega · ' + dateFmt(w.end) }));
    const items = urgentIncidents.concat(tasks, leads, staleLeads, events, invoices, dueWorks).sort((a, b) => a.rank.localeCompare(b.rank)).slice(0, 6);
    const body = items.length ? '<div class="attention-list">' + items.map((x, i) => '<button class="attention-item" data-action="detail" data-type="' + esc(x.type) + '" data-id="' + esc(x.id) + '"><span class="attention-index">' + String(i + 1).padStart(2, '0') + '</span><span class="attention-copy"><strong>' + esc(x.title) + '</strong><small>' + esc(x.detail) + '</small></span><span class="attention-arrow">↗</span></button>').join('') + '</div>' : '<div class="attention-clear"><span class="attention-check">✓</span><div><strong>Todo al día</strong><p>No hay tareas vencidas, seguimientos atrasados ni entregas próximas.</p></div><button type="button" class="text-link" data-view="myday">Ver mi día →</button></div>';
    return card('Lo que pide atención hoy', body, items.length ? items.length + ' asuntos necesitan seguimiento' : 'Sin alertas pendientes', '<button class="text-link" data-view="myday">Abrir mi día →</button>');
  }

  function renderRecentActivity() {
    const sources = [
      ['lead', 'leads', 'Lead'], ['client', 'clients', 'Cliente'], ['work', 'works', 'Obra'], ['task', 'tasks', 'Tarea'],
      ['quote', 'quotes', 'Presupuesto'], ['invoice', 'invoices', 'Factura'], ['event', 'events', 'Cita']
    ];
    const records = sources.flatMap(([type, collection, label]) => data[collection].map(item => ({ type, label, item, stamp: item.updatedAt || item.createdAt || item.date || '' })))
      .filter(x => x.stamp).sort((a, b) => String(b.stamp).localeCompare(String(a.stamp))).slice(0, 5);
    const content = records.length ? '<div class="activity-list">' + records.map(x => {
      const title = x.item.title || x.item.name || x.item.company || x.item.number || x.label;
      const state = x.item.stage || x.item.status || x.item.kind || 'Actualizado';
      return '<button class="activity-item" data-action="detail" data-type="' + x.type + '" data-id="' + esc(x.item.id) + '"><span class="activity-mark">' + esc(x.label.slice(0, 1)) + '</span><span class="activity-copy"><strong>' + esc(title) + '</strong><small>' + esc(x.label + ' · ' + state) + '</small></span><time>' + esc(dateFmt(x.stamp, { day: '2-digit', month: 'short' })) + '</time></button>';
    }).join('') + '</div>' : '<div class="activity-empty"><strong>Tu actividad aparecerá aquí</strong><p>Al crear o actualizar leads, clientes, obras y presupuestos podrás seguir los últimos movimientos.</p></div>';
    return card('Actividad reciente', content, 'Últimos registros actualizados', '<button class="text-link" data-view="reports">Ver informes →</button>');
  }

  function renderMyDay() {
    const day = myDayDate || today;
    const dayEnd = dateKey(new Date(new Date(day + 'T12:00:00').getTime() + 7 * 86400000));
    const tasks = data.tasks.filter(t => t.status !== 'Hecha' && t.due && t.due <= day).sort((a, b) => a.due.localeCompare(b.due));
    const events = data.events.filter(e => e.date === day).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const leads = data.leads.filter(l => !['Ganado', 'Perdido'].includes(l.stage) && l.nextDate && l.nextDate <= day).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    const upcoming = data.tasks.filter(t => t.status !== 'Hecha' && t.due > day && t.due <= dayEnd).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6);
    const items = tasks.map(t => ({ type: 'task', id: t.id, time: t.due, when: dateFmt(t.due), title: t.title, detail: (t.due < day ? 'Vencida' : 'Para esta fecha') + ' · ' + (workName(t.workId) || selected(data.clients, t.clientId) || 'Sin obra asignada'), status: t.status }))
      .concat(events.map(e => ({ type: 'event', id: e.id, time: e.date + (e.time || '23:59'), when: e.time || 'Todo el día', title: e.title, detail: [e.kind, workName(e.workId) || selected(data.clients, e.clientId), e.island].filter(Boolean).join(' · '), status: e.kind || 'Cita' })))
      .concat(leads.map(l => ({ type: 'lead', id: l.id, time: l.nextDate, when: dateFmt(l.nextDate), title: l.name || l.company || 'Seguimiento comercial', detail: 'Seguimiento ' + (l.nextDate < day ? 'atrasado' : 'pendiente') + (l.company && l.name ? ' · ' + l.company : '') + (l.island ? ' · ' + l.island : ''), status: l.stage })))
      .sort((a, b) => String(a.time).localeCompare(String(b.time)));
    const todayContent = items.length ? '<div class="list">' + items.map(x => row(x.title, x.detail, x.status, '<span class="row-date">' + esc(x.when) + '</span>', '', x.id, x.type)).join('') + '</div>' : '<div class="day-clear"><strong>Sin asuntos para esta fecha</strong><p>Elige otro día o programa una tarea, visita o seguimiento.</p>' + newBtn('task', 'Crear tarea') + '</div>';
    const upcomingContent = upcoming.length ? '<div class="list">' + upcoming.map(t => row(t.title, workName(t.workId) || selected(data.clients, t.clientId) || 'Sin obra asignada', t.status, '<span class="row-date">' + esc(dateFmt(t.due)) + '</span>', '', t.id, 'task')).join('') + '</div>' : '<div class="activity-empty"><strong>Sin tareas para los próximos siete días</strong><p>Cuando añadas fechas límite, las verás aquí.</p></div>';
    const dayTitle = new Date(day + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const dateControls = '<div class="day-date-controls"><button class="btn btn-sm" data-action="myday-shift" data-delta="-1" aria-label="Día anterior">←</button><button class="btn btn-sm" data-action="myday-today">Hoy</button><strong>' + esc(dayTitle) + '</strong><button class="btn btn-sm" data-action="myday-shift" data-delta="1" aria-label="Día siguiente">→</button></div>';
    return header('ORGANIZACIÓN PERSONAL', 'Mi día', 'Consulta lo urgente, planifica la semana y cambia de fecha para preparar el trabajo.', newBtn('task', 'Nueva tarea')) + dateControls +
      '<div class="kpis">' + kpi('Asuntos pendientes', items.length, tasks.filter(t => t.due < day).length + ' tareas vencidas a esta fecha', '◉') + kpi('Citas', events.length, 'para el día seleccionado', '◷') + kpi('Seguimientos', leads.length, 'oportunidades pendientes', '✳') + kpi('Tareas próximos 7 días', upcoming.length, 'desde la fecha elegida', '☷') + '</div>' +
      '<div class="grid-2 day-grid">' + card('Pendientes · ' + dateFmt(day, { weekday: 'long', day: 'numeric', month: 'long' }), todayContent, items.length ? 'Ordenado por fecha y hora' : 'Sin pendientes') + card('Próximos siete días', upcomingContent, 'Planifica con margen', '<button class="text-link" data-view="agenda">Abrir agenda →</button>') + '</div>';
  }

  function renderVisits() {
    let visits = data.events.filter(e => e.kind === 'Visita de obra');
    if (searchText) visits = visits.filter(e => normalizeSearchText(JSON.stringify(e) + ' ' + workName(e.workId) + ' ' + clientName(e.clientId) + ' ' + teamName(e.owner)).includes(normalizeSearchText(searchText)));
    if (islandFilter !== 'all') visits = visits.filter(e => {
      const work = data.works.find(item => item.id === e.workId);
      const client = data.clients.find(item => item.id === e.clientId) || (work && data.clients.find(item => item.id === work.clientId));
      return (e.island || (work && work.island) || (client && client.island) || '') === islandFilter;
    });
    visits.sort((a, b) => String(a.date + (a.time || '')).localeCompare(String(b.date + (b.time || ''))));
    const list = visits.length ? '<div class="list">' + visits.map(e => {
      const work = data.works.find(item => item.id === e.workId);
      const client = data.clients.find(item => item.id === e.clientId) || (work && data.clients.find(item => item.id === work.clientId));
      const island = e.island || (work && work.island) || (client && client.island) || '';
      return '<div class="row-item visit-row"><span class="visit-date"><b>' + esc(dateFmt(e.date, { day: '2-digit' })) + '</b><small>' + esc(dateFmt(e.date, { month: 'short' })) + '</small></span><div class="row-main" data-action="detail" data-type="event" data-id="' + esc(e.id) + '"><div class="row-title">' + esc(e.title) + badge(e.date < today ? 'Realizada' : e.date === today ? 'Hoy' : 'Programada') + '</div><div class="row-sub">' + esc([e.time, workName(e.workId), selected(data.clients, e.clientId), island, e.owner ? teamName(e.owner) : ''].filter(Boolean).join(' · ') || 'Sin obra ni cliente asociados') + '</div></div><div class="row-end"><button type="button" class="tiny-btn" data-action="edit" data-type="event" data-id="' + esc(e.id) + '">Editar</button></div></div>';
    }).join('') + '</div>' : empty(searchText || islandFilter !== 'all' ? 'No hay visitas con estos filtros' : 'Aún no hay visitas programadas', searchText || islandFilter !== 'all' ? 'Cambia la búsqueda o selecciona otra isla.' : 'Añade una visita desde aquí y se vinculará a la agenda, el cliente y la obra.', 'event', 'Programar visita', ' data-kind="Visita de obra"');
    const toolbar = '<div class="toolbar"><div class="search"><input id="search-input" type="search" value="' + esc(searchText) + '" placeholder="Buscar visita, cliente u obra…" aria-label="Buscar visitas"></div><select id="island-filter" aria-label="Filtrar por isla">' + islandOptions(islandFilter) + '</select><span class="muted small">' + visits.length + (visits.length === 1 ? ' visita' : ' visitas') + '</span></div>';
    const next = visits.filter(e => e.date >= today).length;
    return header('TRABAJO EN CAMPO', 'Visitas', 'Planifica visitas de obra y consulta rápidamente a quién y dónde tienes que ir.', newBtn('event', 'Programar visita', ' data-kind="Visita de obra"')) +
      '<div class="kpis">' + kpi('Visitas próximas', next, 'incluye las de hoy', '⌖') + kpi('Obras activas', data.works.filter(w => w.status === 'En curso').length, 'con planificación en curso', '▦') + kpi('Equipo disponible', data.team.filter(p => p.active !== false).length, 'responsables registrados', '♧') + kpi('Clientes', data.clients.length, 'contactos en cartera', '♙') + '</div>' + card('Agenda de visitas', toolbar + list, 'Cada visita queda guardada también en la agenda general');
  }

  function renderTaskCategory(page) {
    const config = {
      incidents: { category: 'Incidencia', title: 'Incidencias', eyebrow: 'ATENCIÓN AL CLIENTE', description: 'Registra avisos, garantías y problemas pendientes de resolver.', singular: 'incidencia' },
      maintenance: { category: 'Mantenimiento', title: 'Mantenimiento', eyebrow: 'POSTVENTA', description: 'Organiza revisiones preventivas y trabajos de mantenimiento.', singular: 'mantenimiento' },
      checklists: { category: 'Checklist', title: 'Checklists', eyebrow: 'CONTROL DE CALIDAD', description: 'Prepara listas de comprobación para que ninguna entrega se quede a medias.', singular: 'checklist' }
    }[page];
    const tasks = data.tasks.filter(t => t.category === config.category).filter(t => !searchText || normalizeSearchText(JSON.stringify(t)).includes(normalizeSearchText(searchText))).slice().sort((a, b) => (a.status === 'Hecha') - (b.status === 'Hecha') || (a.due || '9999').localeCompare(b.due || '9999'));
    const actions = newBtn('task', 'Nueva ' + config.singular, ' data-category="' + esc(config.category) + '"');
    const toolbar = '<div class="toolbar"><div class="search"><input id="search-input" type="search" value="' + esc(searchText) + '" placeholder="Buscar ' + config.title.toLocaleLowerCase('es') + '…" aria-label="Buscar ' + config.title + '"></div><span class="muted small">' + tasks.length + (tasks.length === 1 ? ' registro' : ' registros') + '</span></div>';
    const content = tasks.length ? '<div class="list">' + tasks.map(t => renderListRow('tasks', t)).join('') + '</div>' : empty(searchText ? 'No se encontraron resultados' : 'Todavía no hay ' + config.title.toLocaleLowerCase('es'), searchText ? 'Prueba con otra búsqueda.' : 'Crea el primero para organizar el seguimiento.', 'task', 'Crear ' + config.singular, ' data-category="' + esc(config.category) + '"');
    return header(config.eyebrow, config.title, config.description, actions) + '<section class="card">' + toolbar + content + '</section>';
  }

  function renderTeam() {
    const people = data.team.slice().sort((a, b) => (a.active === false) - (b.active === false) || String(a.name || '').localeCompare(String(b.name || ''), 'es'));
    const list = people.length ? '<div class="team-grid">' + people.map(p => '<article class="team-card"><div class="team-card-top"><span class="team-avatar">' + esc((p.name || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase()) + '</span><span class="team-state ' + (p.active === false ? 'inactive' : '') + '">' + (p.active === false ? 'Inactivo' : 'Activo') + '</span></div><h3>' + esc(p.name) + '</h3><p>' + esc(p.role || 'Sin puesto indicado') + '</p><div class="team-contact">' + (p.phone ? '<a href="tel:' + esc(p.phone) + '">' + esc(p.phone) + '</a>' : '') + (p.email ? '<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>' : '') + '</div><div class="team-card-actions"><button type="button" class="btn btn-sm" data-action="detail" data-type="team" data-id="' + esc(p.id) + '">Ver ficha</button><button type="button" class="btn btn-sm" data-action="edit" data-type="team" data-id="' + esc(p.id) + '">Editar</button></div></article>').join('') + '</div>' : empty('Aún no has añadido a tu equipo', 'Añade las personas que participan en las obras y asígnalas después a tareas y visitas.', 'team', 'Añadir persona');
    return header('OPERACIONES', 'Equipo', 'Responsables y colaboradores de tu empresa.', newBtn('team', 'Añadir persona')) + '<div class="team-summary">' + kpi('Personas activas', people.filter(p => p.active !== false).length, 'disponibles para asignación', '♧') + kpi('Obras con responsable', new Set(data.works.filter(w => w.owner).map(w => w.owner)).size, 'responsables asignados', '▦') + kpi('Tareas asignadas', data.tasks.filter(t => t.owner && t.status !== 'Hecha').length, 'trabajos abiertos', '☷') + '</div>' + card('Personas y colaboradores', list, people.length + ' fichas de equipo');
  }
  function dashboardFocus() {
    const openTasks = data.tasks.filter(task => task.status !== 'Hecha').sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const openLeads = data.leads.filter(lead => !['Ganado', 'Perdido'].includes(lead.stage) && lead.nextDate).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    const overdueTask = openTasks.find(task => task.due && task.due < today);
    const dueLead = openLeads.find(lead => lead.nextDate <= today);
    const nextTask = openTasks[0];
    const nextLead = openLeads[0];
    let heading = 'Nada urgente ahora mismo';
    let copy = 'No tienes tareas abiertas ni seguimientos para hoy.';
    let action = '<button type="button" class="btn btn-primary btn-sm" data-action="new" data-type="lead">Crear un lead</button>';
    let eyebrow = 'TU SIGUIENTE MEJOR PASO';
    if (overdueTask) {
      heading = overdueTask.title || 'Tarea pendiente';
      copy = 'Vencida ' + dateFmt(overdueTask.due) + (workName(overdueTask.workId) ? ' · ' + workName(overdueTask.workId) : '');
      action = '<button type="button" class="btn btn-primary btn-sm" data-action="detail" data-type="task" data-id="' + esc(overdueTask.id) + '">Abrir tarea →</button>';
      eyebrow = 'TAREA QUE PIDE ATENCIÓN';
    } else if (dueLead) {
      heading = dueLead.name || dueLead.company || 'Seguimiento comercial';
      copy = 'Toca retomar esta oportunidad hoy' + (dueLead.company && dueLead.name ? ' · ' + dueLead.company : '');
      action = '<button type="button" class="btn btn-primary btn-sm" data-action="detail" data-type="lead" data-id="' + esc(dueLead.id) + '">Abrir lead →</button>';
      eyebrow = 'SEGUIMIENTO DE HOY';
    } else if (nextLead && (!nextTask || nextLead.nextDate < (nextTask.due || '9999'))) {
      heading = nextLead.name || nextLead.company || 'Seguimiento comercial';
      copy = 'Próximo seguimiento · ' + dateFmt(nextLead.nextDate);
      action = '<button type="button" class="btn btn-primary btn-sm" data-action="detail" data-type="lead" data-id="' + esc(nextLead.id) + '">Abrir lead →</button>';
      eyebrow = 'PRÓXIMO PASO COMERCIAL';
    } else if (nextTask) {
      heading = nextTask.title || 'Tarea pendiente';
      copy = (nextTask.due ? 'Vence ' + dateFmt(nextTask.due) : 'Sin fecha límite') + (workName(nextTask.workId) ? ' · ' + workName(nextTask.workId) : '');
      action = '<button type="button" class="btn btn-primary btn-sm" data-action="detail" data-type="task" data-id="' + esc(nextTask.id) + '">Abrir tarea →</button>';
      eyebrow = 'SIGUIENTE TAREA';
    } else if (nextLead) {
      heading = nextLead.name || nextLead.company || 'Seguimiento comercial';
      copy = 'Próximo seguimiento · ' + dateFmt(nextLead.nextDate);
      action = '<button type="button" class="btn btn-primary btn-sm" data-action="detail" data-type="lead" data-id="' + esc(nextLead.id) + '">Abrir lead →</button>';
      eyebrow = 'PRÓXIMO PASO COMERCIAL';
    }
    return '<aside class="hero-focus" aria-label="Siguiente paso recomendado"><p class="focus-eyebrow">✦ ' + esc(eyebrow) + '</p><strong>' + esc(heading) + '</strong><p>' + esc(copy) + '</p>' + action + '</aside>';
  }
  function kpi(label, value, note, symbol) { return '<div class="kpi"><div class="kpi-label"><span>' + esc(label) + '</span><span class="kpi-symbol">' + symbol + '</span></div><div class="kpi-value">' + esc(value) + '</div><div class="kpi-note">' + esc(note) + '</div></div>'; }
  function defaultProbability(stage) { return ({ Nuevo: 10, Contactado: 25, Cualificado: 50, 'Propuesta enviada': 75 })[stage] || 0; }

  const PAGE_CONFIG = {
    leads: { title: 'Leads', sub: 'Sigue las oportunidades desde el primer contacto hasta el cierre.', type: 'lead', singular: 'lead', collection: 'leads', filter: 'lead', fields: ['stage'] },
    clients: { title: 'Clientes', sub: 'Contactos, empresas y el historial de su relación contigo.', type: 'client', singular: 'cliente', collection: 'clients' },
    works: { title: 'Obras', sub: 'Cada proyecto con su cliente, planificación, presupuesto y avance.', type: 'work', singular: 'obra', collection: 'works', filter: 'work', fields: ['status'] },
    tasks: { title: 'Tareas', sub: 'Responsables, prioridades y fechas límite en un solo sitio.', type: 'task', singular: 'tarea', collection: 'tasks', filter: 'task', fields: ['status', 'priority'] },
    quotes: { title: 'Presupuestos', sub: 'Prepara propuestas, controla su estado y conviértelas en facturas.', type: 'quote', singular: 'presupuesto', collection: 'quotes', filter: 'quote', fields: ['status'] },
    documents: { title: 'Documentos', sub: 'Enlaces a planos, contratos, fotos y documentación relacionada con tus obras.', type: 'document', singular: 'documento', collection: 'documents' }
  };
  function islandOptions(selectedIsland) {
    return '<option value="all">Todas las islas</option>' + CANARY_ISLANDS.map(island => '<option value="' + esc(island) + '"' + (selectedIsland === island ? ' selected' : '') + '>' + esc(island) + '</option>').join('');
  }
  function renderKanbanBoard(key, items) {
    const isLead = key === 'leads';
    const isTask = key === 'tasks';
    const type = isLead ? 'lead' : isTask ? 'task' : 'work';
    const stages = STATUS[isLead ? 'lead' : isTask ? 'task' : 'work'];
    const field = isLead ? 'stage' : 'status';
    const columns = stages.map(stage => {
      const cards = items.filter(item => (item[field] || stages[0]) === stage);
      const cardRows = cards.map(item => {
        const title = isLead ? (item.name || item.company || 'Lead sin nombre') : isTask ? (item.title || 'Tarea sin título') : (item.name || 'Obra sin nombre');
        const linkedClient = !isLead ? data.clients.find(client => client.id === item.clientId) : null;
        const taskWork = isTask ? data.works.find(work => work.id === item.workId) : null;
        const itemIsland = item.island || (linkedClient && linkedClient.island) || (taskWork && taskWork.island) || '';
        const info = isLead
          ? [item.company && item.name ? item.company : '', item.island, item.nextDate ? 'Seguimiento ' + dateFmt(item.nextDate) : 'Sin próximo paso'].filter(Boolean).join(' · ')
          : isTask ? [item.category || 'General', item.priority ? 'Prioridad ' + item.priority : '', item.due ? ((item.due < today && item.status !== 'Hecha') ? 'Vencida ' : 'Vence ') + dateFmt(item.due) : 'Sin fecha', workName(item.workId) || selected(data.clients, item.clientId)].filter(Boolean).join(' · ')
          : [selected(data.clients, item.clientId), itemIsland, item.end ? 'Entrega ' + dateFmt(item.end) : 'Sin fecha de entrega'].filter(Boolean).join(' · ');
        const amount = isLead ? money(item.value) : isTask ? '' : money(item.budget);
        const select = '<label class="kanban-move-label" for="move-' + type + '-' + esc(item.id) + '">Mover a</label><select class="kanban-move" id="move-' + type + '-' + esc(item.id) + '" data-move-type="' + type + '" data-id="' + esc(item.id) + '" aria-label="Mover ' + esc(title) + ' a otra fase">' + stages.map(option => '<option value="' + esc(option) + '"' + (option === stage ? ' selected' : '') + '>' + esc(option) + '</option>').join('') + '</select>';
        return '<article class="kanban-card"><button type="button" class="kanban-card-open" data-action="detail" data-type="' + type + '" data-id="' + esc(item.id) + '"><strong>' + esc(title) + '</strong><span>' + esc(info || 'Sin información adicional') + '</span>' + (!isTask ? '<span class="kanban-card-bottom"><b>' + esc(amount) + '</b>' + (isLead && item.owner ? '<small>' + esc(teamName(item.owner)) + '</small>' : !isLead ? '<small>' + Math.round(num(item.progress)) + '% completado</small>' : '') + '</span>' : item.owner ? '<span class="kanban-card-bottom"><small>' + esc(teamName(item.owner)) + '</small></span>' : '') + (!isLead && !isTask ? '<span class="progress"><i style="width:' + Math.min(100, Math.max(0, num(item.progress))) + '%"></i></span>' : '') + '</button>' + select + '</article>';
      }).join('');
      return '<section class="kanban-column"><header><strong>' + esc(stage) + '</strong><span>' + cards.length + '</span></header><div class="kanban-column-cards">' + (cardRows || '<p class="kanban-empty">Sin registros en esta fase</p>') + '</div></section>';
    }).join('');
    return '<div class="kanban-board" aria-label="Tablero por fases de ' + (isLead ? 'leads' : isTask ? 'tareas' : 'obras') + '">' + columns + '</div>';
  }
  function renderListView(key) {
    const cfg = PAGE_CONFIG[key];
    if (!cfg) return renderDashboard();
    const headerActions = newBtn(cfg.type, 'Nuevo ' + cfg.singular);
    const head = header(key === 'leads' || key === 'quotes' ? 'COMERCIAL' : key === 'works' ? 'OPERACIONES' : key === 'tasks' ? 'ORGANIZACIÓN' : key === 'documents' ? 'ADMINISTRACIÓN' : 'RELACIONES', cfg.title, cfg.sub, headerActions);
    let items = data[cfg.collection].slice();
    const q = normalizeSearchText(searchText);
    if (q) items = items.filter(x => normalizeSearchText(JSON.stringify(x) + ' ' + clientName(x.clientId) + ' ' + workName(x.workId) + ' ' + teamName(x.owner)).includes(q));
    if (filterValue !== 'all') items = items.filter(x => [x.stage, x.status, x.priority, x.kind].includes(filterValue));
    if (islandFilter !== 'all' && ['leads', 'clients', 'works'].includes(key)) items = items.filter(x => (x.island || (key === 'works' ? (data.clients.find(client => client.id === x.clientId) || {}).island : '')) === islandFilter);
    if (key === 'tasks') items.sort((a, b) => (a.status === 'Hecha') - (b.status === 'Hecha') || (a.due || '9999').localeCompare(b.due || '9999'));
    else items.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
    const toolbar = '<div class="toolbar"><div class="search"><input id="search-input" type="search" value="' + esc(searchText) + '" placeholder="Buscar ' + esc(cfg.title.toLowerCase()) + '..." aria-label="Buscar ' + esc(cfg.title.toLowerCase()) + '"></div>' + (cfg.fields ? '<select id="filter-select" aria-label="Filtrar por estado"><option value="all">Todos los estados</option>' + STATUS[cfg.filter].map(s => '<option value="' + esc(s) + '"' + (filterValue === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + (key === 'tasks' ? '<option value="Alta"' + (filterValue === 'Alta' ? ' selected' : '') + '>Alta</option><option value="Media"' + (filterValue === 'Media' ? ' selected' : '') + '>Media</option><option value="Baja"' + (filterValue === 'Baja' ? ' selected' : '') + '>Baja</option>' : '') + '</select>' : '') + (['leads', 'clients', 'works'].includes(key) ? '<select id="island-filter" aria-label="Filtrar por isla">' + islandOptions(islandFilter) + '</select>' : '') + '<span class="muted small">' + items.length + (items.length === 1 ? ' registro' : ' registros') + '</span></div>';
    const hasBoard = ['leads', 'works', 'tasks'].includes(key);
    const boardDescription = key === 'leads' ? 'Avanza cada oportunidad por su fase y abre la ficha para contactar o convertirla en cliente.' : key === 'tasks' ? 'Prioriza el trabajo y mueve las tareas entre pendientes, en curso y hechas.' : 'Consulta el estado de entrega y mueve la obra a su siguiente fase.';
    const modeToggle = hasBoard ? '<div class="board-toolbar"><p>' + esc(boardDescription) + '</p><div class="view-switch" aria-label="Vista de registros"><button type="button" class="' + (viewModes[key] === 'board' ? 'active' : '') + '" data-action="toggle-view-mode" data-view-mode="board" data-list-key="' + key + '">Kanban</button><button type="button" class="' + (viewModes[key] === 'list' ? 'active' : '') + '" data-action="toggle-view-mode" data-view-mode="list" data-list-key="' + key + '">Lista</button></div></div>' : '';
    const content = !items.length ? empty(q || filterValue !== 'all' || islandFilter !== 'all' ? 'No se encontraron resultados' : 'Todavía no hay registros', q ? 'Prueba con otra búsqueda.' : 'Crea el primero para empezar a organizarlo.', cfg.type, 'Crear ' + cfg.singular) : hasBoard && viewModes[key] === 'board' ? renderKanbanBoard(key, items) : '<div class="list">' + items.map(x => renderListRow(key, x)).join('') + '</div>';
    return head + '<section class="card">' + modeToggle + toolbar + content + '</section>';
  }

  function renderListRow(key, x) {
    if (key === 'leads') {
      const nextAction = x.clientId
        ? '<button type="button" class="btn btn-sm" data-action="detail" data-type="client" data-id="' + esc(x.clientId) + '">Abrir cliente →</button>'
        : x.stage !== 'Perdido' ? '<button type="button" class="btn btn-sm btn-primary" data-action="convert-lead" data-id="' + esc(x.id) + '">Pasar a cliente →</button>' : '<button type="button" class="btn btn-sm" data-action="detail" data-type="lead" data-id="' + esc(x.id) + '">Ver oportunidad →</button>';
      return '<div class="row-item list-flow-row"><div class="row-main" data-action="detail" data-type="lead" data-id="' + esc(x.id) + '"><div class="row-title">' + esc(x.name || x.company) + badge(x.stage) + '</div><div class="row-sub">' + esc((x.company && x.name ? x.company + ' · ' : '') + (x.island ? x.island + ' · ' : '') + (x.source || 'Origen sin indicar') + (x.nextDate ? ' · próximo paso ' + dateFmt(x.nextDate) : ' · sin seguimiento')) + '</div></div><div class="row-end"><div class="row-value-block"><div class="row-amount">' + esc(money(x.value)) + '</div><div class="row-date">' + esc(x.owner ? teamName(x.owner) : 'Valor estimado') + '</div></div>' + nextAction + '</div></div>';
    }
    if (key === 'clients') return '<div class="row-item list-flow-row"><div class="row-main" data-action="detail" data-type="client" data-id="' + esc(x.id) + '"><div class="row-title">' + esc(x.company || x.name) + '</div><div class="row-sub">' + esc([x.name && x.company ? x.name : '', x.island, x.email, x.phone, data.works.filter(w => w.clientId === x.id).length + ' obras'].filter(Boolean).join(' · ')) + '</div></div><div class="row-end"><span class="row-date">' + esc(x.city || '') + '</span><button type="button" class="btn btn-sm" data-action="quick-new" data-type="work" data-client-id="' + esc(x.id) + '">＋ Crear obra</button></div></div>';
    if (key === 'works') return '<div class="row-item list-flow-row"><div class="row-main" data-action="detail" data-type="work" data-id="' + esc(x.id) + '"><div class="row-title">' + esc(x.name) + badge(x.status) + '</div><div class="row-sub">' + esc(selected(data.clients, x.clientId) + (x.island ? ' · ' + x.island : '') + (x.address ? ' · ' + x.address : '') + (x.end ? ' · entrega ' + dateFmt(x.end) : '')) + '</div><div class="progress" style="margin-top:8px"><i style="width:' + Math.min(100, Math.max(0, num(x.progress))) + '%"></i></div></div><div class="row-end"><div class="row-value-block"><div class="row-amount">' + esc(money(x.budget)) + '</div><div class="row-date">' + esc(Math.round(num(x.progress)) + '% completado') + '</div></div><div class="row-quick-actions"><button type="button" class="btn btn-sm" data-action="quick-new" data-type="task" data-client-id="' + esc(x.clientId || '') + '" data-work-id="' + esc(x.id) + '">＋ Tarea</button><button type="button" class="btn btn-sm" data-action="quick-new" data-type="quote" data-client-id="' + esc(x.clientId || '') + '" data-work-id="' + esc(x.id) + '">Presupuesto</button></div></div></div>';
    if (key === 'tasks') return '<div class="row-item"><button class="tiny-btn ' + (x.status === 'Hecha' ? '' : 'danger') + '" data-action="toggle-task" data-id="' + esc(x.id) + '" aria-label="' + (x.status === 'Hecha' ? 'Reabrir' : 'Marcar hecha') + '">' + (x.status === 'Hecha' ? '✓' : '○') + '</button><div class="row-main" data-action="detail" data-type="task" data-id="' + esc(x.id) + '"><div class="row-title">' + esc(x.title) + badge(x.status) + badge(x.category || 'General') + badge(x.priority || 'Media') + '</div><div class="row-sub">' + esc(workName(x.workId) || selected(data.clients, x.clientId) || 'Sin proyecto') + (x.owner ? ' · ' + teamName(x.owner) : '') + '</div></div><div class="row-end"><span class="row-date">' + esc(x.due ? 'Vence ' + dateFmt(x.due) : 'Sin fecha') + '</span></div></div>';
    if (key === 'quotes') return row(x.title || ('Presupuesto ' + x.number), selected(data.clients, x.clientId) + (x.workId ? ' · ' + workName(x.workId) : '') + (x.validUntil ? ' · válido hasta ' + dateFmt(x.validUntil) : ''), x.status, amountEnd(total(x), dateFmt(x.date)), '', x.id, 'quote');
    return '<div class="row-item" data-action="detail" data-type="document" data-id="' + esc(x.id) + '"><div class="row-main"><div class="row-title">' + esc(x.title) + badge(x.kind || 'Documento') + '</div><div class="row-sub">' + esc(workName(x.workId) || selected(data.clients, x.clientId) || 'Sin asociar') + (x.notes ? ' · ' + esc(x.notes) : '') + '</div></div><div class="row-end"><a class="document-link btn btn-sm" href="' + esc(safeHref(x.url)) + '" target="_blank" rel="noopener">Abrir ↗</a><div class="row-actions"><button class="tiny-btn" data-action="edit" data-type="document" data-id="' + esc(x.id) + '">Editar</button><button class="tiny-btn danger" data-action="delete" data-type="document" data-id="' + esc(x.id) + '">Eliminar</button></div></div></div>';
  }

  function renderFinance() {
    const invoices = data.invoices.slice().sort((a, b) => String(b.date || '').localeCompare(a.date || ''));
    const expenses = data.expenses.slice().sort((a, b) => String(b.date || '').localeCompare(a.date || ''));
    const due = invoices.reduce((s, x) => s + outstanding(x), 0);
    const paid = data.payments.reduce((s, x) => s + num(x.amount), 0);
    const month = today.slice(0, 7);
    const monthExpenses = expenses.filter(x => (x.date || '').slice(0, 7) === month).reduce((s, x) => s + num(x.amount), 0);
    const invRows = invoices.length ? '<div class="list">' + invoices.map(i => {
      const balance = outstanding(i);
      const status = balance <= 0 ? 'Pagada' : paidFor(i) > 0 ? 'Parcial' : (i.due && i.due < today ? 'Vencida' : i.status);
      const actions = '<button class="tiny-btn" data-action="payment" data-id="' + esc(i.id) + '" title="Registrar cobro">＋ cobro</button><button class="tiny-btn" data-action="edit" data-type="invoice" data-id="' + esc(i.id) + '">Editar</button>';
      return '<div class="row-item"><div class="row-main" data-action="detail" data-type="invoice" data-id="' + esc(i.id) + '"><div class="row-title">' + esc(i.number || i.title || 'Factura') + badge(status) + '</div><div class="row-sub">' + esc(selected(data.clients, i.clientId) + (i.workId ? ' · ' + workName(i.workId) : '') + ' · vence ' + dateFmt(i.due)) + '</div></div><div class="row-end"><div><div class="row-amount">' + esc(money(total(i))) + '</div><div class="row-date">Pendiente ' + esc(money(balance)) + '</div></div><div class="row-actions">' + actions + '</div></div></div>';
    }).join('') + '</div>' : empty('Aún no hay facturas', 'Crea una factura para controlar vencimientos y pagos.', 'invoice', 'Nueva factura');
    const expRows = expenses.length ? '<div class="list">' + expenses.map(x => row(x.title, (x.category || 'Gasto') + ' · ' + dateFmt(x.date) + (x.workId ? ' · ' + workName(x.workId) : ''), x.paid ? 'Pagado' : 'Pendiente', amountEnd(x.amount, x.vendor || ''), '', x.id, 'expense')).join('') + '</div>' : empty('Sin gastos registrados', 'Registra costes para conocer el margen real de cada obra.', 'expense', 'Añadir gasto');
    const paymentRows = data.payments.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8);
    const paymentContent = paymentRows.length ? '<div class="list">' + paymentRows.map(p => row(selected(data.invoices, p.invoiceId, 'Cobro') + (p.method ? ' · ' + p.method : ''), selected(data.clients, (data.invoices.find(i => i.id === p.invoiceId) || {}).clientId) + ' · ' + dateFmt(p.date), 'Cobrado', '<span class="row-amount">' + esc(money(p.amount)) + '</span>', '', p.id, 'payment')).join('') + '</div>' : empty('No hay cobros registrados', 'Al registrar un cobro en una factura aparecerá aquí.');
    return header('CONTROL FINANCIERO', 'Facturas y gastos', 'Sigue lo emitido, lo cobrado y los costes de cada obra.', newBtn('invoice', 'Nueva factura') + newBtn('expense', 'Añadir gasto')) +
      '<div class="kpis">' + kpi('Pendiente de cobro', money(due), invoices.filter(i => outstanding(i) > 0).length + ' facturas abiertas', '€') + kpi('Cobrado registrado', money(paid), data.payments.length + ' movimientos de cobro', '✓') + kpi('Gastos este mes', money(monthExpenses), monthFmt(month), '↘') + kpi('Obras con costes', new Set(expenses.filter(x => x.workId).map(x => x.workId)).size, 'con gastos asociados', '▦') + '</div>' +
      '<div class="grid-2"><div>' + card('Facturas', invRows, 'Importes, vencimientos y cobros parciales') + '<div style="margin-top:14px">' + card('Cobros recientes', paymentContent, 'Últimos pagos recibidos') + '</div></div>' + card('Gastos', expRows, 'Vincula los costes a cada obra') + '</div>';
  }

  function renderAgenda() {
    const start = agendaMonth + '-01';
    const d0 = new Date(start + 'T12:00:00');
    const next = new Date(d0.getFullYear(), d0.getMonth() + 1, 1);
    const end = dateKey(new Date(next.getTime() - 86400000));
    const events = data.events.filter(e => e.date >= start && e.date <= end).map(e => Object.assign({ _kind: 'event' }, e));
    const tasks = data.tasks.filter(t => t.status !== 'Hecha' && t.due >= start && t.due <= end).map(t => Object.assign({ _kind: 'task', date: t.due, title: t.title, owner: t.owner, linkId: t.id }));
    const leads = data.leads.filter(l => l.nextDate && l.nextDate >= start && l.nextDate <= end && !['Ganado', 'Perdido'].includes(l.stage)).map(l => ({ id: l.id, _kind: 'lead', date: l.nextDate, title: 'Seguimiento · ' + (l.company || l.name), notes: l.phone || l.email }));
    const all = events.concat(tasks, leads).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const groups = new Map();
    all.forEach(x => { if (!groups.has(x.date)) groups.set(x.date, []); groups.get(x.date).push(x); });
    const body = groups.size ? Array.from(groups, ([date, items]) => '<div class="agenda-date"><div class="date-block"><b>' + dateFmt(date, { day: '2-digit' }) + '</b><small>' + esc(dateFmt(date, { weekday: 'short' })) + '</small></div><div class="timeline">' + items.map(x => '<div class="timeline-entry"><div><strong>' + esc(x.title) + '</strong> ' + badge(x._kind === 'task' ? 'Tarea' : x._kind === 'lead' ? 'Lead' : (x.kind || 'Evento')) + '<div><span>' + esc((x.time ? x.time + ' · ' : '') + (workName(x.workId) || selected(data.clients, x.clientId) || x.notes || '')) + '</span></div></div><button class="tiny-btn" data-action="detail" data-type="' + x._kind + '" data-id="' + esc(x.id || x.linkId) + '">Abrir</button></div>').join('') + '</div></div>').join('') : empty('Agenda despejada', 'Añade una cita o programa un seguimiento y aparecerá aquí.', 'event', 'Crear cita');
    const monthLabel = monthFmt(agendaMonth);
    return header('PLANIFICACIÓN', 'Agenda', 'Citas, fechas de entrega, tareas y seguimientos comerciales.', newBtn('event', 'Nueva cita')) +
      '<section class="card"><div class="card-head"><div><h2>' + esc(monthLabel) + '</h2><p>Vista mensual de los próximos pasos</p></div><div class="head-actions"><button class="btn btn-sm" data-action="month-shift" data-delta="-1">←</button><button class="btn btn-sm" data-action="month-today">Hoy</button><button class="btn btn-sm" data-action="month-shift" data-delta="1">→</button></div></div>' + body + '</section>';
  }
  function upcomingCount() { return data.events.filter(e => e.date >= today).length + data.tasks.filter(t => t.status !== 'Hecha' && t.due === today).length; }

  function renderReports() {
    const month = today.slice(0, 7);
    const open = data.leads.filter(l => !['Ganado', 'Perdido'].includes(l.stage));
    const win = data.leads.filter(l => l.stage === 'Ganado');
    const billed = data.invoices.reduce((s, i) => s + total(i), 0);
    const collected = data.payments.reduce((s, p) => s + num(p.amount), 0);
    const expenses = data.expenses.reduce((s, x) => s + num(x.amount), 0);
    const monthBilled = data.invoices.filter(i => (i.date || '').slice(0, 7) === month).reduce((s, i) => s + total(i), 0);
    const monthCosts = data.expenses.filter(i => (i.date || '').slice(0, 7) === month).reduce((s, i) => s + num(i.amount), 0);
    const workRows = data.works.length ? '<div class="table-wrap"><table><thead><tr><th>Obra</th><th>Cliente</th><th>Estado</th><th class="numeric">Presupuesto</th><th class="numeric">Avance</th><th class="numeric">Gastos</th></tr></thead><tbody>' + data.works.map(w => '<tr><td><strong>' + esc(w.name) + '</strong></td><td>' + esc(selected(data.clients, w.clientId)) + '</td><td>' + badge(w.status) + '</td><td class="numeric">' + esc(money(w.budget)) + '</td><td class="numeric">' + esc(num(w.progress) + '%') + '</td><td class="numeric">' + esc(money(data.expenses.filter(e => e.workId === w.id).reduce((s, e) => s + num(e.amount), 0))) + '</td></tr>').join('') + '</tbody></table></div>' : empty('Sin obras para analizar', 'Crea obras para consultar su presupuesto y costes.', 'work', 'Crear obra');
    return header('ANÁLISIS', 'Informes', 'Una lectura rápida del estado comercial y financiero.', '<button class="btn" data-action="print">Imprimir / PDF</button><button class="btn" data-action="export-report">Exportar CSV</button>') +
      '<div class="kpis">' + kpi('Leads activos', open.length, money(open.reduce((s, x) => s + num(x.value), 0)) + ' de valor potencial', '✳') + kpi('Conversión ganada', win.length + (data.leads.length ? ' / ' + data.leads.length : ''), data.leads.length ? Math.round(win.length / data.leads.length * 100) + '% del total' : 'Sin leads todavía', '↗') + kpi('Facturado acumulado', money(billed), money(collected) + ' cobrado', '€') + kpi('Gastos registrados', money(expenses), money(monthCosts) + ' este mes', '↘') + '</div>' +
      '<div class="grid-2 grid-even">' + card('Actividad financiera · ' + monthFmt(month), '<div class="list">' + row('Facturado este mes', 'Base imponible más impuestos', '', '<span class="row-amount">' + esc(money(monthBilled)) + '</span>') + row('Gastos este mes', 'Costes registrados', '', '<span class="row-amount">' + esc(money(monthCosts)) + '</span>') + row('Margen estimado', 'Facturación menos gastos del mes', '', '<span class="row-amount">' + esc(money(monthBilled - monthCosts)) + '</span>') + '</div>', 'Importes según los registros disponibles') + card('Datos de la empresa', '<div class="list">' + row('Clientes', String(data.clients.length), '', '') + row('Obras activas', String(data.works.filter(w => w.status === 'En curso').length), '', '') + row('Tareas pendientes', String(data.tasks.filter(t => t.status !== 'Hecha').length), '', '') + row('Presupuestos enviados', String(data.quotes.filter(q => q.status === 'Enviada').length), '', '') + '</div>', 'Actividad registrada') + '</div><div style="margin-top:14px">' + card('Rentabilidad por obra', workRows, 'Presupuesto frente a gastos asociados') + '</div>';
  }

  function renderSettings() {
    const tabs = [['empresa', 'Empresa'], ['equipo', 'Equipo'], ['datos', 'Datos y nube']];
    const nav = '<div class="settings-tabs">' + tabs.map(x => '<button class="' + (settingsTab === x[0] ? 'active' : '') + '" data-action="settings-tab" data-tab="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>';
    if (settingsTab === 'empresa') {
      return header('PERSONALIZACIÓN', 'Ajustes', 'Configura los datos de tu negocio y cómo quieres trabajar.') + nav +
        '<section class="card"><div class="card-head"><div><h2>Datos de empresa</h2><p>Se usarán en la aplicación y los informes.</p></div></div><form id="company-form"><div class="fields">' +
        settingsField('name', 'Nombre comercial', data.company.name, 'text', 'full', 'Mi empresa') +
        settingsField('taxId', 'CIF / NIF', data.company.taxId, 'text') +
        settingsField('phone', 'Teléfono', data.company.phone, 'tel') +
        settingsField('email', 'Correo electrónico', data.company.email, 'email') +
        settingsField('owner', 'Tu nombre', data.company.owner, 'text') +
        settingsField('taxRate', 'IGIC por defecto (%)', data.company.taxRate, 'number') +
        '<p class="modal-note full" style="grid-column:1/-1;margin:0">Tipo general en Canarias: 7 %. Ajusta el porcentaje si la operación lleva otro tipo o está exenta.</p>' +
        settingsField('address', 'Dirección', data.company.address, 'text', 'full') +
        '</div><div style="margin-top:14px">' + btn('Guardar empresa', 'save-company', 'btn-primary', ' type="submit"') + '</div></form></section>' +
        '<div style="margin-top:14px">' + card('Cómo se organiza la información', '<div class="list"><div class="row-item"><div class="row-main"><div class="row-title">Lead → cliente</div><div class="row-sub">Convierte un contacto ganado y conserva su historial comercial.</div></div></div><div class="row-item"><div class="row-main"><div class="row-title">Cliente → obras</div><div class="row-sub">Un cliente puede tener varias obras, presupuestos, facturas y tareas.</div></div></div><div class="row-item"><div class="row-main"><div class="row-title">Obra → tareas y costes</div><div class="row-sub">Asigna responsables, fechas, gastos y documentación vinculada.</div></div></div></div>', 'Los datos se guardan primero en este dispositivo.') + '</div>';
    }
    if (settingsTab === 'equipo') {
      const list = data.team.length ? '<div class="list">' + data.team.map(x => row(x.name, [x.role, x.email, x.phone].filter(Boolean).join(' · '), x.active === false ? 'Inactivo' : 'Activo', '<div class="row-actions"><button class="tiny-btn" data-action="edit" data-type="team" data-id="' + esc(x.id) + '">Editar</button><button class="tiny-btn danger" data-action="delete" data-type="team" data-id="' + esc(x.id) + '">Eliminar</button></div>', '', x.id, 'team')).join('') + '</div>' : empty('Añade a tu equipo', 'Después podrás asignar responsables a las obras y tareas.', 'team', 'Añadir persona');
      return header('PERSONAS', 'Ajustes', 'Organiza responsables y asignaciones.') + nav + card('Equipo', list, 'Personas que pueden aparecer como responsables', newBtn('team', 'Añadir persona'));
    }
    const cloudConfig = window.GESTION_CLIENTES_SUPABASE_CONFIG || {};
    let projectRef = '';
    try { projectRef = new URL(cloudConfig.url || '').hostname.split('.')[0]; } catch (_) {}
    const sqlEditorUrl = projectRef ? 'https://supabase.com/dashboard/project/' + encodeURIComponent(projectRef) + '/sql/new' : 'https://supabase.com/dashboard';
    const setupActions = '<div class="cloud-setup-actions"><button type="button" class="btn btn-sm" data-action="cloud-setup">Descargar SQL de Gestión Clientes</button><a class="btn btn-sm" href="' + esc(sqlEditorUrl) + '" target="_blank" rel="noopener">Abrir Editor SQL ↗</a></div>';
    const cloudWarning = cloudProblem ? '<div class="cloud-alert" role="alert"><strong>Hay que revisar la conexión</strong><p>' + esc(cloudProblem) + '</p>' + (cloudSetupRequired ? setupActions : '') + '</div>' : '';
    const cloudSetupHelp = !cloudUser && !cloudProblem ? '<div class="cloud-setup-help"><strong>Prepara esta app en el proyecto compartido</strong><ol><li>Usa el mismo correo y contraseña que en Control Laboral.</li><li>Ejecuta el SQL de Gestión Clientes una vez; crea únicamente su tabla privada y recarga la caché del esquema.</li><li>Confirma el correo si Supabase te lo solicita.</li></ol>' + setupActions + '</div>' : '';
    const cloudPanel = '<div class="card"><div class="card-head"><div><h2>Sincronización privada</h2><p>La cuenta sirve en ambas apps; cada una conserva sus datos en una tabla independiente.</p></div><span class="badge ' + (cloudProblem ? 'yellow' : cloudUser ? 'green' : '') + '">' + esc(cloudUser ? cloudUser.email : cloudProblem ? 'Requiere atención' : 'Desconectado') + '</span></div>' + cloudWarning +
      (cloudUser ? '<p class="modal-note">Los cambios se sincronizan en segundo plano cuando hay conexión. Las copias locales siguen disponibles sin internet.</p><div class="head-actions"><button class="btn btn-primary" data-action="cloud-sync">Sincronizar ahora</button><button class="btn" data-action="cloud-logout">Cerrar sesión</button></div>' :
        '<p class="modal-note">El almacenamiento y las copias JSON funcionan sin cuenta. Para sincronizar entre móvil y ordenador, inicia sesión con la misma cuenta en las dos aplicaciones.</p><form id="cloud-form"><div class="fields"><div class="field"><label for="cloud-email">Correo</label><input id="cloud-email" name="email" type="email" value="' + esc(cloudEmailDraft) + '" autocomplete="username" required></div><div class="field"><label for="cloud-password">Contraseña</label><input id="cloud-password" name="password" type="password" autocomplete="current-password" minlength="6" required><span class="hint">El acceso admite la contraseña de 6 caracteres que ya creaste.</span></div></div><div class="head-actions" style="margin-top:12px"><button class="btn btn-primary" type="submit" data-cloud-mode="login">Iniciar sesión</button><button class="btn" type="submit" data-cloud-mode="signup">Crear cuenta</button></div></form>') +
      cloudSetupHelp + '</div>';
    const dataPanel = '<div class="card"><div class="card-head"><div><h2>Copias y exportaciones</h2><p>Conserva tus datos o llévalos a otra instalación.</p></div></div><div class="head-actions"><button class="btn btn-primary" data-action="backup">Descargar copia JSON</button><button class="btn" data-action="restore">Restaurar copia</button><button class="btn" data-action="export-all">Exportar registros CSV</button><input id="restore-input" type="file" accept="application/json,.json" hidden></div><p class="modal-note" style="margin-top:12px">La copia JSON incluye todos los registros, relaciones, configuración e historial de cobros.</p></div>';
    return header('DATOS', 'Ajustes', 'Copias de seguridad y sincronización en tus dispositivos.') + nav + '<div class="stack">' + dataPanel + cloudPanel + card('Almacenamiento', '<div class="row-item"><div class="row-main"><div class="row-title">Datos locales</div><div class="row-sub">Guardados automáticamente en este dispositivo.</div></div><span class="badge green">Activo</span></div>', 'Sin conexión disponible') + '</div>';
  }
  function settingsField(name, label, value, type, size, placeholder) {
    return '<div class="field ' + (size || '') + '"><label for="co-' + name + '">' + esc(label) + '</label><input id="co-' + name + '" name="' + name + '" type="' + (type || 'text') + '" value="' + esc(value == null ? '' : value) + '"' + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '></div>';
  }

  function quoteBreakdown(item) {
    const items = Array.isArray(item.items) ? item.items : [];
    if (!items.length) return '<div class="quote-legacy-note">Este registro todavía no tiene partidas detalladas. Pulsa «Editar» para añadir horas, desplazamientos y materiales.</div>';
    const rows = items.map(line => '<tr><td>' + esc(line.category || 'Otros') + '</td><td>' + esc(line.description || '') + '</td><td class="numeric">' + esc(num(line.quantity).toLocaleString('es-ES')) + '</td><td>' + esc(line.unit || 'ud') + '</td><td class="numeric">' + esc(money(line.unitPrice)) + '</td><td class="numeric">' + esc(money(quoteLineTotal(line))) + '</td></tr>').join('');
    return '<section class="quote-breakdown"><div class="card-head"><div><h3>Desglose de partidas</h3><p>Mano de obra, desplazamientos, materiales y otros conceptos.</p></div></div><div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Descripción</th><th class="numeric">Cantidad</th><th>Unidad</th><th class="numeric">Precio / unidad</th><th class="numeric">Importe</th></tr></thead><tbody>' + rows + '</tbody><tfoot><tr><th colspan="5">Base imponible</th><th class="numeric">' + esc(money(item.amount)) + '</th></tr><tr><th colspan="5">' + esc(item.taxName || 'IGIC') + ' (' + esc(num(item.taxRate)) + '%)</th><th class="numeric">' + esc(money(taxAmount(item))) + '</th></tr><tr class="quote-total-row"><th colspan="5">TOTAL</th><th class="numeric">' + esc(money(total(item))) + '</th></tr></tfoot></table></div></section>';
  }

  function quickAction(label, type, context, description) {
    const item = context.item;
    const contextType = context.type;
    const clientId = contextType === 'client' ? item.id : (item.clientId || '');
    const workId = contextType === 'work' ? item.id : (item.workId || '');
    const leadId = contextType === 'lead' ? item.id : '';
    const icons = { work: '▦', quote: '▤', task: '☷', event: '◷', expense: '€', document: '↗' };
    return '<button type="button" class="quick-action" data-action="quick-new" data-type="' + type + '" data-client-id="' + esc(clientId) + '" data-work-id="' + esc(workId) + '" data-lead-id="' + esc(leadId) + '"><span class="quick-action-icon">' + (icons[type] || '＋') + '</span><span class="quick-action-copy"><strong>' + esc(label) + '</strong><small>' + esc(description) + '</small></span><span class="quick-action-arrow">＋</span></button>';
  }

  function flowSteps(labels, complete, active) {
    return '<div class="flow-steps flow-steps-' + labels.length + '">' + labels.map((label, index) => '<div class="flow-step ' + (complete(index) ? 'is-done' : '') + (active === index ? ' is-active' : '') + '"><span class="flow-step-dot">' + (complete(index) ? '✓' : String(index + 1)) + '</span><span>' + esc(label) + '</span></div>').join('') + '</div>';
  }

  function leadProcessPanel(item) {
    const stages = ['Nuevo', 'Contactado', 'Cualificado', 'Propuesta enviada', 'Ganado'];
    const lost = item.stage === 'Perdido';
    const current = item.clientId ? 4 : Math.max(0, stages.indexOf(item.stage));
    const next = stages[Math.min(current + 1, stages.length - 1)];
    const steps = flowSteps(['Lead nuevo', 'Contactado', 'Cualificado', 'Propuesta', 'Cliente'], index => !lost && index < current, lost ? -1 : current);
    let nextAction = '';
    if (lost) nextAction = '<button type="button" class="btn btn-sm" data-action="reopen-lead" data-id="' + esc(item.id) + '">Reabrir oportunidad</button><span class="workflow-hint">Esta oportunidad está cerrada como perdida.</span>';
    else if (item.clientId) nextAction = '<button type="button" class="btn btn-primary btn-sm" data-action="detail" data-type="client" data-id="' + esc(item.clientId) + '">Abrir cliente →</button>' + (item.workId ? '<button type="button" class="btn btn-sm" data-action="detail" data-type="work" data-id="' + esc(item.workId) + '">Abrir obra →</button>' : '<button type="button" class="btn btn-sm" data-action="quick-new" data-type="work" data-client-id="' + esc(item.clientId) + '">Crear primera obra →</button>');
    else if (item.stage === 'Ganado') nextAction = '<span class="workflow-hint">Oportunidad ganada. Crea la ficha de cliente para continuar.</span><button type="button" class="btn btn-primary btn-sm" data-action="convert-lead" data-id="' + esc(item.id) + '">Crear cliente →</button>';
    else nextAction = '<span class="workflow-hint">Siguiente paso recomendado: ' + esc(item.stage === 'Propuesta enviada' ? 'convertirlo en cliente cuando acepte.' : 'marcar «' + next + '» cuando avances.') + '</span><button type="button" class="btn btn-sm" data-action="quick-new" data-type="event" data-lead-id="' + esc(item.id) + '">Programar seguimiento</button>' + (item.stage === 'Propuesta enviada' ? '<button type="button" class="btn btn-primary btn-sm" data-action="convert-lead" data-id="' + esc(item.id) + '">Pasar a cliente →</button>' : '<button type="button" class="btn btn-primary btn-sm" data-action="advance-lead" data-id="' + esc(item.id) + '">Avanzar a ' + esc(next) + ' →</button>');
    return '<section class="context-panel"><div class="context-panel-head"><div><p class="eyebrow">SIGUIENTE PASO</p><h3>Proceso comercial</h3><p>Avanza la oportunidad desde aquí sin volver a editarla.</p></div>' + badge(lost ? 'Perdido' : item.clientId ? 'Cliente' : item.stage || 'Nuevo') + '</div>' + steps + '<div class="workflow-next">' + nextAction + '</div>' + (item.clientId ? '<div class="quick-actions">' + quickAction('Crear obra', 'work', { type: 'client', item: data.clients.find(x => x.id === item.clientId) || { id: item.clientId } }, 'Empieza el proyecto') + quickAction('Crear presupuesto', 'quote', { type: 'client', item: data.clients.find(x => x.id === item.clientId) || { id: item.clientId } }, 'Prepara la propuesta') + '</div>' : '') + '</section>';
  }

  function clientWorkProcessPanel(type, item, id) {
    const works = type === 'client' ? data.works.filter(x => x.clientId === id) : [item];
    const workIds = new Set(works.map(x => x.id));
    const quotes = data.quotes.filter(x => type === 'client' ? x.clientId === id : x.workId === id);
    const invoices = data.invoices.filter(x => type === 'client' ? x.clientId === id : x.workId === id);
    const hasWork = works.length > 0;
    const hasQuote = quotes.length > 0;
    const hasInvoice = invoices.length > 0;
    const labels = ['Cliente', 'Obra', 'Presupuesto', 'Factura'];
    const done = [true, hasWork, hasQuote, hasInvoice];
    const active = done.findIndex((value, index) => index > 0 && !value);
    const focus = active < 0 ? 3 : active;
    const context = { type, item };
    const actions = type === 'client'
      ? quickAction('Crear obra', 'work', context, 'Organiza un nuevo proyecto') + quickAction('Presupuesto', 'quote', context, 'Detalla y envía una oferta') + quickAction('Nueva tarea', 'task', context, 'Apunta el siguiente trabajo') + quickAction('Programar cita', 'event', context, 'Llamada, visita o reunión')
      : quickAction('Nueva tarea', 'task', context, 'Planifica el trabajo') + quickAction('Presupuesto', 'quote', context, 'Detalla horas y materiales') + quickAction('Registrar gasto', 'expense', context, 'Controla el coste de obra') + quickAction('Añadir documento', 'document', context, 'Guarda planos y archivos');
    const hint = !hasWork && type === 'client' ? 'Empieza creando una obra para tener juntos tareas, presupuestos y documentos.' : !hasQuote ? 'Añade un presupuesto cuando quieras concretar el alcance y el precio.' : !hasInvoice ? 'Al aceptar el presupuesto, conviértelo en factura desde su ficha.' : 'Toda la actividad de este proyecto está reunida aquí.';
    return '<section class="context-panel"><div class="context-panel-head"><div><p class="eyebrow">CLIENTE Y PROYECTOS</p><h3>Flujo de trabajo</h3><p>' + esc(hint) + '</p></div></div>' + flowSteps(labels, index => done[index], focus) + '<div class="quick-actions">' + actions + '</div></section>';
  }

  function relatedRecord(type, item) {
    const title = item.name || item.title || item.number || item.company || 'Registro';
    let subtitle = '';
    let amount = '';
    if (type === 'work') { subtitle = item.address || selected(data.clients, item.clientId); amount = money(item.budget); }
    else if (type === 'quote' || type === 'invoice') { subtitle = dateFmt(item.date); amount = money(total(item)); }
    else if (type === 'task') { subtitle = item.due ? 'Vence ' + dateFmt(item.due) : 'Sin fecha límite'; }
    else if (type === 'expense') { subtitle = item.vendor || item.category || 'Gasto de obra'; amount = money(item.amount); }
    else if (type === 'document') { subtitle = item.kind || 'Documento'; }
    else if (type === 'event') { subtitle = dateFmt(item.date) + (item.time ? ' · ' + item.time : ''); }
    return '<button type="button" class="related-record" data-action="detail" data-type="' + type + '" data-id="' + esc(item.id) + '"><span class="related-record-main"><strong>' + esc(title) + '</strong><small>' + esc(subtitle) + '</small></span><span class="related-record-end">' + (item.status ? badge(item.status) : '') + (amount ? '<strong>' + esc(amount) + '</strong>' : '') + '</span><span class="related-record-arrow">›</span></button>';
  }

  function relationshipGroup(label, type, items) {
    if (!items.length) return '';
    return '<section class="relationship-group"><div class="relationship-group-title"><h4>' + esc(label) + '</h4><span>' + items.length + '</span></div><div class="relationship-list">' + items.map(item => relatedRecord(type, item)).join('') + '</div></section>';
  }

  function renderRelationships(type, item, id) {
    let groups = '';
    if (type === 'client') {
      const works = data.works.filter(x => x.clientId === id);
      const workIds = new Set(works.map(x => x.id));
      const tasks = data.tasks.filter(x => x.clientId === id || workIds.has(x.workId));
      groups = relationshipGroup('Obras', 'work', works) + relationshipGroup('Presupuestos', 'quote', data.quotes.filter(x => x.clientId === id)) + relationshipGroup('Facturas', 'invoice', data.invoices.filter(x => x.clientId === id)) + relationshipGroup('Tareas', 'task', tasks) + relationshipGroup('Documentos', 'document', data.documents.filter(x => x.clientId === id || workIds.has(x.workId)));
      groups += relationshipGroup('Citas', 'event', data.events.filter(x => x.clientId === id || workIds.has(x.workId)));
      if (item.sourceLeadId) {
        const source = data.leads.find(x => x.id === item.sourceLeadId);
        if (source) groups = '<div class="source-lead-note">Convertido desde el lead <button type="button" data-action="detail" data-type="lead" data-id="' + esc(source.id) + '">' + esc(source.name || source.company || 'Abrir oportunidad') + ' ↗</button></div>' + groups;
      }
    } else if (type === 'work') {
      groups = relationshipGroup('Tareas', 'task', data.tasks.filter(x => x.workId === id)) + relationshipGroup('Presupuestos', 'quote', data.quotes.filter(x => x.workId === id)) + relationshipGroup('Facturas', 'invoice', data.invoices.filter(x => x.workId === id)) + relationshipGroup('Gastos', 'expense', data.expenses.filter(x => x.workId === id)) + relationshipGroup('Documentos', 'document', data.documents.filter(x => x.workId === id)) + relationshipGroup('Citas', 'event', data.events.filter(x => x.workId === id));
    }
    return groups ? '<div class="relationships"><div class="relationships-heading"><div><p class="eyebrow">HISTORIAL RELACIONADO</p><h3>' + (type === 'client' ? 'Actividad del cliente' : 'Actividad de la obra') + '</h3></div></div><div class="relationship-grid">' + groups + '</div></div>' : '';
  }

  function openConvertLead(id) {
    const lead = data.leads.find(x => x.id === id);
    if (!lead) return;
    const label = lead.company || lead.name || 'este contacto';
    const summary = [lead.name, lead.phone, lead.email, num(lead.value) ? 'Valor estimado: ' + money(lead.value) : ''].filter(Boolean).join(' · ');
    const modal = '<div class="modal-backdrop" data-action="backdrop"><section class="modal conversion-modal" role="dialog" aria-modal="true" aria-labelledby="convert-title"><div class="modal-head"><h2 id="convert-title">Pasar oportunidad a cliente</h2><button type="button" class="close-btn" data-action="close-modal" aria-label="Cerrar">×</button></div><div class="modal-body"><div class="conversion-intro"><span class="quick-action-icon">↗</span><div><strong>' + esc(label) + '</strong><p>' + esc(summary || 'Se conservarán los datos del contacto y el historial del lead.') + '</p></div></div><p class="conversion-question">¿Qué quieres preparar ahora?</p><div class="conversion-choices"><button type="button" class="conversion-choice" data-action="convert-lead-finish" data-create-work="false" data-id="' + esc(id) + '"><span class="choice-mark">1</span><span><strong>Crear solo el cliente</strong><small>Podrás abrir su ficha y crear la obra más tarde.</small></span><span class="choice-arrow">→</span></button><button type="button" class="conversion-choice is-recommended" data-action="convert-lead-finish" data-create-work="true" data-id="' + esc(id) + '"><span class="choice-mark">2</span><span><strong>Crear cliente y primera obra</strong><small>Recomendado si ya está aprobado el trabajo. La obra quedará vinculada al contacto.</small></span><span class="choice-arrow">→</span></button></div><p class="modal-note conversion-footnote">El lead seguirá guardado como historial y quedará enlazado al cliente creado.</p></div></section></div>';
    $('#modal-root').innerHTML = modal;
  }

  function renderDetail(type, id) {
    const map = { lead: 'leads', client: 'clients', work: 'works', task: 'tasks', quote: 'quotes', invoice: 'invoices', expense: 'expenses', event: 'events', document: 'documents', team: 'team', payment: 'payments' };
    const collection = map[type];
    const item = collection && data[collection].find(x => x.id === id);
    if (!item) return;
    const title = item.name || item.company || item.title || item.number || item.kind || 'Detalle';
    const facts = [];
    const add = (label, value) => { if (value !== '' && value != null) facts.push('<div class="row-item"><div class="row-main"><div class="row-sub">' + esc(label) + '</div><div class="row-title">' + esc(value) + '</div></div></div>'); };
    if (type === 'lead') { add('Empresa', item.company); add('Estado', item.stage); add('Teléfono', item.phone); add('Correo', item.email); add('Isla', item.island); add('Origen', item.source); add('Valor estimado', money(item.value)); add('Próximo seguimiento', dateFmt(item.nextDate)); add('Notas', item.notes); }
    if (type === 'client') { add('Contacto', item.name); add('CIF / NIF', item.taxId); add('Teléfono', item.phone); add('Correo', item.email); add('Isla', item.island); add('Dirección', item.address); add('Notas', item.notes); }
    if (type === 'work') { add('Cliente', selected(data.clients, item.clientId)); add('Estado', item.status); add('Isla', item.island); add('Dirección', item.address); add('Inicio', dateFmt(item.start)); add('Entrega prevista', dateFmt(item.end)); add('Presupuesto', money(item.budget)); add('Avance', num(item.progress) + '%'); add('Responsable', teamName(item.owner)); add('Notas', item.notes); }
    if (type === 'task') { add('Tipo de seguimiento', item.category || 'General'); add('Estado', item.status); add('Prioridad', item.priority); add('Obra', workName(item.workId)); add('Cliente', selected(data.clients, item.clientId)); add('Fecha límite', dateFmt(item.due)); add('Responsable', teamName(item.owner)); add('Descripción', item.description); }
    if (type === 'quote') { add('Cliente', selected(data.clients, item.clientId)); add('Obra', workName(item.workId)); add('Estado', item.status); add('Fecha', dateFmt(item.date)); add('Válido hasta', dateFmt(item.validUntil)); if (!Array.isArray(item.items) || !item.items.length) { add('Base imponible', money(item.amount)); add(item.taxName || (num(item.taxRate) === 21 ? 'Impuesto anterior' : 'IGIC'), num(item.taxRate) + '%'); add('Total', money(total(item))); } add('Descripción y condiciones', item.notes); }
    if (type === 'invoice') { add('Cliente', selected(data.clients, item.clientId)); add('Obra', workName(item.workId)); add('Estado', item.status); add('Emisión', dateFmt(item.date)); add('Vencimiento', dateFmt(item.due)); if (!Array.isArray(item.items) || !item.items.length) { add('Base imponible', money(item.amount)); add(item.taxName || (num(item.taxRate) === 21 ? 'Impuesto anterior' : 'IGIC'), num(item.taxRate) + '%'); add('Total', money(total(item))); } add('Cobrado', money(paidFor(item))); add('Pendiente', money(outstanding(item))); add('Descripción', item.notes); }
    if (type === 'expense') { add('Categoría', item.category); add('Proveedor', item.vendor); add('Fecha', dateFmt(item.date)); add('Importe', money(item.amount)); add('Obra', workName(item.workId)); add('Notas', item.notes); }
    if (type === 'event') { add('Fecha', dateFmt(item.date)); add('Hora', item.time); add('Tipo', item.kind); add('Isla', item.island); add('Responsable', teamName(item.owner)); add('Notas', item.notes); }
    if (type === 'document') { add('Tipo', item.kind); add('Relacionado con', workName(item.workId) || selected(data.clients, item.clientId)); add('Enlace', item.url); add('Notas', item.notes); }
    if (type === 'team') { add('Puesto', item.role); add('Correo', item.email); add('Teléfono', item.phone); add('Estado', item.active === false ? 'Inactivo' : 'Activo'); }
    if (type === 'payment') { add('Factura', selected(data.invoices, item.invoiceId)); add('Fecha', dateFmt(item.date)); add('Método', item.method); add('Importe', money(item.amount)); add('Notas', item.notes); }
    const extraActions = type === 'lead' && !item.clientId && item.stage !== 'Perdido' ? '<button type="button" class="btn btn-primary btn-sm" data-action="convert-lead" data-id="' + esc(id) + '">Pasar a cliente</button>' : type === 'quote' ? '<button class="btn btn-sm" data-action="print">Imprimir / guardar PDF</button>' + (item.status !== 'Rechazada' ? '<button class="btn btn-primary btn-sm" data-action="quote-to-invoice" data-id="' + esc(id) + '">Crear factura</button>' : '') : type === 'invoice' && outstanding(item) > 0 ? '<button class="btn btn-primary btn-sm" data-action="payment" data-id="' + esc(id) + '">Registrar cobro</button>' : '';
    const breakdown = ['quote', 'invoice'].includes(type) && Array.isArray(item.items) && item.items.length ? quoteBreakdown(item) : '';
    const processPanel = type === 'lead' ? leadProcessPanel(item) : ['client', 'work'].includes(type) ? clientWorkProcessPanel(type, item, id) : '';
    const relationships = renderRelationships(type, item, id);
    const modal = '<div class="modal-backdrop" data-action="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div class="modal-head"><h2 id="detail-title">' + esc(title) + '</h2><button type="button" class="close-btn" data-action="close-modal" aria-label="Cerrar">×</button></div><div class="modal-body">' + processPanel + '<div class="list">' + facts.join('') + '</div>' + breakdown + relationships + '</div><div class="modal-foot"><div>' + extraActions + '</div><div><button type="button" class="btn btn-danger btn-sm" data-action="delete" data-type="' + type + '" data-id="' + esc(id) + '">Eliminar</button><button type="button" class="btn btn-primary btn-sm" data-action="edit" data-type="' + type + '" data-id="' + esc(id) + '">Editar</button></div></div></section></div>';
    $('#modal-root').innerHTML = modal;
  }

  const FIELDS = {
    lead: [
      ['name', 'Nombre de contacto', 'text', true], ['company', 'Empresa', 'text'], ['phone', 'Teléfono', 'tel'], ['email', 'Correo', 'email'], ['island', 'Isla', 'select', false, CANARY_ISLANDS], ['source', 'Origen', 'select', false, ['Recomendación', 'Web', 'Llamada', 'Redes sociales', 'Visita', 'Otro']], ['stage', 'Estado del lead', 'select', false, STATUS.lead], ['value', 'Valor estimado (€)', 'number'], ['probability', 'Probabilidad (%)', 'number'], ['nextDate', 'Próximo seguimiento', 'date'], ['owner', 'Responsable', 'team'], ['notes', 'Notas', 'textarea', false, null, 'full']
    ],
    client: [
      ['company', 'Empresa / nombre comercial', 'text', true], ['name', 'Persona de contacto', 'text'], ['taxId', 'CIF / NIF', 'text'], ['phone', 'Teléfono', 'tel'], ['email', 'Correo', 'email'], ['island', 'Isla', 'select', false, CANARY_ISLANDS], ['address', 'Dirección', 'text', false, null, 'full'], ['notes', 'Notas', 'textarea', false, null, 'full']
    ],
    work: [
      ['name', 'Nombre de la obra', 'text', true], ['clientId', 'Cliente', 'client', true], ['status', 'Estado', 'select', false, STATUS.work], ['island', 'Isla', 'select', false, CANARY_ISLANDS], ['address', 'Dirección de la obra', 'text', false, null, 'full'], ['start', 'Fecha de inicio', 'date'], ['end', 'Fecha prevista de entrega', 'date'], ['budget', 'Presupuesto (€)', 'number'], ['progress', 'Avance (%)', 'number'], ['owner', 'Responsable', 'team'], ['notes', 'Descripción / notas', 'textarea', false, null, 'full']
    ],
    task: [
      ['title', 'Tarea', 'text', true], ['category', 'Tipo de seguimiento', 'select', false, TASK_CATEGORIES], ['workId', 'Obra relacionada', 'work'], ['clientId', 'Cliente', 'client'], ['due', 'Fecha límite', 'date'], ['priority', 'Prioridad', 'select', false, ['Alta', 'Media', 'Baja']], ['status', 'Estado', 'select', false, STATUS.task], ['owner', 'Responsable', 'team'], ['description', 'Descripción', 'textarea', false, null, 'full']
    ],
    quote: [
      ['title', 'Concepto / asunto', 'text', true], ['number', 'Número de presupuesto', 'text'], ['clientId', 'Cliente', 'client', true], ['workId', 'Obra relacionada', 'work'], ['date', 'Fecha', 'date'], ['validUntil', 'Válido hasta', 'date'], ['taxRate', 'IGIC (%)', 'number'], ['status', 'Estado', 'select', false, STATUS.quote], ['notes', 'Detalle y condiciones', 'textarea', false, null, 'full']
    ],
    invoice: [
      ['title', 'Concepto / asunto', 'text', true], ['number', 'Número de factura', 'text'], ['clientId', 'Cliente', 'client', true], ['workId', 'Obra relacionada', 'work'], ['date', 'Fecha de emisión', 'date'], ['due', 'Fecha de vencimiento', 'date'], ['amount', 'Base imponible (€)', 'number', true], ['taxRate', 'IGIC (%)', 'number'], ['status', 'Estado', 'select', false, STATUS.invoice], ['notes', 'Detalle', 'textarea', false, null, 'full']
    ],
    expense: [
      ['title', 'Concepto del gasto', 'text', true], ['category', 'Categoría', 'select', false, ['Materiales', 'Personal', 'Transporte', 'Herramientas', 'Subcontrata', 'Suministros', 'Otros']], ['vendor', 'Proveedor', 'text'], ['date', 'Fecha', 'date'], ['amount', 'Importe (€)', 'number', true], ['workId', 'Obra relacionada', 'work'], ['paid', 'Estado de pago', 'select', false, ['Pendiente', 'Pagado']], ['notes', 'Notas', 'textarea', false, null, 'full']
    ],
    event: [
      ['title', 'Título', 'text', true], ['date', 'Fecha', 'date', true], ['time', 'Hora', 'time'], ['kind', 'Tipo', 'select', false, ['Reunión', 'Llamada', 'Visita de obra', 'Entrega', 'Otro']], ['owner', 'Responsable', 'team'], ['clientId', 'Cliente', 'client'], ['workId', 'Obra', 'work'], ['island', 'Isla', 'select', false, CANARY_ISLANDS], ['notes', 'Notas', 'textarea', false, null, 'full']
    ],
    document: [
      ['title', 'Nombre del documento', 'text', true], ['kind', 'Tipo', 'select', false, ['Contrato', 'Plano', 'Foto', 'Permiso', 'Acta', 'Factura', 'Otro']], ['url', 'Enlace al archivo', 'url', true, null, 'full'], ['clientId', 'Cliente', 'client'], ['workId', 'Obra relacionada', 'work'], ['notes', 'Notas', 'textarea', false, null, 'full']
    ],
    team: [
      ['name', 'Nombre', 'text', true], ['role', 'Puesto / función', 'text'], ['phone', 'Teléfono', 'tel'], ['email', 'Correo', 'email'], ['active', 'Estado', 'select', false, ['Activo', 'Inactivo']]
    ],
    payment: [
      ['invoiceId', 'Factura', 'invoice', true], ['amount', 'Importe recibido (€)', 'number', true], ['date', 'Fecha del cobro', 'date', true], ['method', 'Método', 'select', false, ['Transferencia', 'Efectivo', 'Tarjeta', 'Domiciliación', 'Otro']], ['notes', 'Notas', 'textarea', false, null, 'full']
    ]
  };
  const TYPE_LABEL = { lead: 'lead', client: 'cliente', work: 'obra', task: 'tarea', quote: 'presupuesto', invoice: 'factura', expense: 'gasto', event: 'cita', document: 'documento', team: 'persona', payment: 'cobro' };
  const TYPE_COLLECTION = { lead: 'leads', client: 'clients', work: 'works', task: 'tasks', quote: 'quotes', invoice: 'invoices', expense: 'expenses', event: 'events', document: 'documents', team: 'team', payment: 'payments' };
  const TYPE_TITLE = { lead: 'Lead', client: 'Cliente', work: 'Obra', task: 'Tarea', quote: 'Presupuesto', invoice: 'Factura', expense: 'Gasto', event: 'Cita / evento', document: 'Documento', team: 'Persona del equipo', payment: 'Registrar cobro' };

  function fieldMarkup(spec, value) {
    const [name, label, kind, required, choices, size] = spec;
    const id = 'f-' + name;
    const req = required ? ' required' : '';
    let control = '';
    if (kind === 'textarea') control = '<textarea id="' + id + '" name="' + name + '"' + req + '>' + esc(value || '') + '</textarea>';
    else if (kind === 'select') {
      const list = choices || [];
      const selectedValue = name === 'paid' ? (value === true ? 'Pagado' : value === false ? 'Pendiente' : value) : name === 'active' ? (value === false ? 'Inactivo' : value === true ? 'Activo' : value) : value;
      control = '<select id="' + id + '" name="' + name + '"' + req + '>' + (name === 'island' ? '<option value="">Sin especificar</option>' : '') + list.map(x => '<option value="' + esc(x) + '"' + (String(selectedValue == null ? '' : selectedValue) === String(x) ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>';
    } else if (kind === 'client') control = '<select id="' + id + '" name="' + name + '"' + req + '>' + optionHtml(data.clients, value, 'Selecciona cliente') + '</select>';
    else if (kind === 'work') control = '<select id="' + id + '" name="' + name + '"' + req + '>' + optionHtml(data.works, value, 'Sin obra asociada') + '</select>';
    else if (kind === 'team') control = '<select id="' + id + '" name="' + name + '"' + req + '>' + optionHtml(personOption(), value, 'Sin asignar') + '</select>';
    else if (kind === 'invoice') control = '<select id="' + id + '" name="' + name + '"' + req + '>' + optionHtml(data.invoices, value, 'Selecciona factura') + '</select>';
    else control = '<input id="' + id + '" name="' + name + '" type="' + kind + '" value="' + esc(value == null ? '' : value) + '"' + (kind === 'number' ? ' step="0.01" min="0"' : '') + req + '>';
    return '<div class="field ' + (size || '') + '"><label for="' + id + '">' + esc(label) + '</label>' + control + '</div>';
  }

  function quoteDefaultUnit(category) {
    return ({ 'Mano de obra': 'horas', 'Desplazamiento': 'trayecto', 'Material': 'ud', 'Otros': 'ud' })[category] || 'ud';
  }
  function quoteLineMarkup(item) {
    const category = item.category || 'Mano de obra';
    const unit = item.unit == null ? quoteDefaultUnit(category) : String(item.unit);
    const autoUnit = unit === quoteDefaultUnit(category) ? 'true' : 'false';
    const categories = ['Mano de obra', 'Desplazamiento', 'Material', 'Otros'];
    const lineId = 'quote-line-' + uid();
    return '<article class="quote-line-card" data-quote-line-row><div class="quote-line-grid">' +
      '<div class="field"><label for="' + lineId + '-category">Tipo de partida</label><select id="' + lineId + '-category" data-quote-field="category">' + categories.map(x => '<option' + (x === category ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select></div>' +
      '<div class="field quote-description"><label for="' + lineId + '-description">Descripción</label><input id="' + lineId + '-description" data-quote-field="description" type="text" value="' + esc(item.description || '') + '" placeholder="Ej.: Instalación, desplazamiento a obra, cemento"></div>' +
      '<div class="field"><label for="' + lineId + '-quantity">Cantidad</label><input id="' + lineId + '-quantity" data-quote-field="quantity" type="number" min="0.01" step="0.01" value="' + esc(item.quantity == null ? '' : item.quantity) + '" placeholder="0"></div>' +
      '<div class="field"><label for="' + lineId + '-unit">Unidad</label><input id="' + lineId + '-unit" data-quote-field="unit" type="text" data-auto-unit="' + autoUnit + '" value="' + esc(unit) + '" placeholder="horas, km, ud"></div>' +
      '<div class="field"><label for="' + lineId + '-price">Precio por unidad (€)</label><input id="' + lineId + '-price" data-quote-field="unitPrice" type="number" min="0" step="0.01" value="' + esc(item.unitPrice == null ? '' : item.unitPrice) + '" placeholder="0,00"></div>' +
      '<div class="quote-line-total-wrap"><span>Importe de la partida</span><strong data-quote-line-total>0,00 €</strong></div>' +
      '</div><div class="quote-line-actions"><span class="muted small">Cantidad × precio por unidad</span><button type="button" class="tiny-btn danger" data-action="remove-quote-line" aria-label="Quitar esta partida">Quitar partida</button></div></article>';
  }
  function quoteItemsForForm(item) {
    if (Array.isArray(item.items) && item.items.length) return clone(item.items);
    if (num(item.amount) > 0) return [{ category: 'Otros', description: item.title || 'Importe anterior sin desglose', quantity: 1, unit: 'servicio', unitPrice: num(item.amount) }];
    return [{ category: 'Mano de obra', description: '', quantity: '', unit: 'horas', unitPrice: '' }];
  }
  function quoteEditorMarkup(items) {
    return '<section class="quote-editor"><div class="card-head"><div><h3>Desglose del presupuesto</h3><p>Indica horas y tarifa, coste del desplazamiento y materiales por unidad.</p></div><button type="button" class="btn btn-sm" data-action="add-quote-line">＋ Añadir partida</button></div><div class="quote-line-list" data-quote-line-list>' + (items || []).map(quoteLineMarkup).join('') + '</div><div class="quote-summary"><div><span>Base imponible</span><strong data-quote-base>0,00 €</strong></div><div><span>IGIC (<b data-quote-tax-rate>7</b> %)</span><strong data-quote-tax>0,00 €</strong></div><div class="quote-summary-total"><span>Total</span><strong data-quote-total>0,00 €</strong></div></div><p class="modal-note">Los importes se calculan automáticamente. En los presupuestos antiguos, el importe actual se conserva como una partida editable.</p></section>';
  }
  function quoteItemsFromForm(form) {
    const items = [];
    let incomplete = false;
    $$('.quote-line-card', form).forEach(row => {
      const category = $('[data-quote-field="category"]', row).value;
      const description = $('[data-quote-field="description"]', row).value.trim();
      const quantityRaw = $('[data-quote-field="quantity"]', row).value.trim();
      const unit = $('[data-quote-field="unit"]', row).value.trim();
      const priceRaw = $('[data-quote-field="unitPrice"]', row).value.trim();
      if (!description && !quantityRaw && !priceRaw) return;
      const quantity = num(quantityRaw);
      const unitPrice = num(priceRaw);
      if (!description || !quantityRaw || !unit || !priceRaw || quantity <= 0 || unitPrice < 0) { incomplete = true; return; }
      items.push({ category, description, quantity, unit, unitPrice });
    });
    if (incomplete) return { error: 'Completa la descripción, cantidad, unidad y precio de cada partida que hayas empezado.' };
    if (!items.length) return { error: 'Añade al menos una partida detallada al presupuesto.' };
    return { items };
  }
  function updateQuoteTotals(form) {
    if (!form) return;
    const rate = Math.max(0, num(($('[name="taxRate"]', form) || {}).value));
    let base = 0;
    $$('.quote-line-card', form).forEach(row => {
      const quantity = Math.max(0, num(($('[data-quote-field="quantity"]', row) || {}).value));
      const price = Math.max(0, num(($('[data-quote-field="unitPrice"]', row) || {}).value));
      const lineTotal = quoteLineTotal({ quantity, unitPrice: price });
      base += lineTotal;
      const totalLabel = $('[data-quote-line-total]', row);
      if (totalLabel) totalLabel.textContent = money(lineTotal);
    });
    base = roundMoney(base);
    const tax = roundMoney(base * rate / 100);
    const baseLabel = $('[data-quote-base]', form);
    const taxLabel = $('[data-quote-tax]', form);
    const totalLabel = $('[data-quote-total]', form);
    const rateLabel = $('[data-quote-tax-rate]', form);
    if (baseLabel) baseLabel.textContent = money(base);
    if (taxLabel) taxLabel.textContent = money(tax);
    if (totalLabel) totalLabel.textContent = money(base + tax);
    if (rateLabel) rateLabel.textContent = String(rate).replace('.', ',');
  }
  function addQuoteLine(form) {
    const list = $('[data-quote-line-list]', form);
    if (!list) return;
    list.insertAdjacentHTML('beforeend', quoteLineMarkup({ category: 'Otros', description: '', quantity: '', unit: 'ud', unitPrice: '' }));
    updateQuoteTotals(form);
    const description = $('[data-quote-field="description"]', list.lastElementChild);
    if (description) description.focus();
  }

  function openForm(type, id, preset) {
    const collection = TYPE_COLLECTION[type];
    if (!collection || !FIELDS[type]) return;
    if (!id && ['work', 'quote', 'invoice'].includes(type) && !data.clients.length) {
      toast('Primero crea un cliente o convierte un lead para poder vincular este registro.', 'bad');
      setView('clients');
      openForm('client');
      return;
    }
    const old = id ? data[collection].find(x => x.id === id) : null;
    const item = Object.assign({}, old || {}, preset || {});
    if (!old) {
      if (['quote', 'invoice'].includes(type)) { item.date = item.date || today; item.taxRate = item.taxRate == null ? data.company.taxRate : item.taxRate; item.status = item.status || (type === 'quote' ? 'Borrador' : 'Borrador'); }
      if (type === 'lead') item.stage = item.stage || 'Nuevo';
      if (type === 'work') { item.status = item.status || 'Pendiente'; item.progress = 0; }
      if (type === 'task') { item.status = item.status || 'Pendiente'; item.priority = item.priority || 'Media'; item.category = item.category || 'General'; }
      if (type === 'expense') { item.date = item.date || today; item.paid = item.paid || 'Pendiente'; }
      if (type === 'event' || type === 'payment') item.date = item.date || today;
      if (type === 'team') item.active = true;
    }
    if (type === 'quote') item.items = quoteItemsForForm(item);
    const hasDetailedLines = type === 'quote' || (type === 'invoice' && Array.isArray(item.items) && item.items.length > 0);
    const fieldContent = hasDetailedLines
      ? '<div class="fields">' + FIELDS[type].filter(s => !['amount', 'notes'].includes(s[0])).map(s => fieldMarkup(s, item[s[0]])).join('') + '</div>' + quoteEditorMarkup(item.items) + '<div class="fields">' + fieldMarkup(FIELDS[type].find(s => s[0] === 'notes'), item.notes) + '</div>'
      : '<div class="fields">' + FIELDS[type].map(s => fieldMarkup(s, item[s[0]])).join('') + '</div>';
    const title = id ? 'Editar ' + TYPE_LABEL[type] : TYPE_TITLE[type];
    const form = '<div class="modal-backdrop" data-action="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="form-title"><div class="modal-head"><h2 id="form-title">' + esc(title) + '</h2><button class="close-btn" data-action="close-modal" aria-label="Cerrar">×</button></div><form id="entity-form" data-type="' + type + '" data-id="' + esc(id || '') + '"><div class="modal-body"><p class="modal-note">Los campos marcados son necesarios para guardar el registro.</p>' + fieldContent + '</div><div class="modal-foot"><div>' + (id ? '<button type="button" class="btn btn-danger btn-sm" data-action="delete" data-type="' + type + '" data-id="' + esc(id) + '">Eliminar</button>' : '') + '</div><div><button type="button" class="btn" data-action="close-modal">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div></div></form></section></div>';
    $('#modal-root').innerHTML = form;
    if (hasDetailedLines) updateQuoteTotals($('#entity-form'));
    const first = $('#entity-form input, #entity-form select, #entity-form textarea');
    if (first) setTimeout(() => first.focus(), 40);
  }

  function readForm(form) {
    const out = {};
    new FormData(form).forEach((v, k) => { out[k] = String(v).trim(); });
    ['value', 'amount', 'taxRate', 'progress', 'probability'].forEach(k => { if (k in out) out[k] = num(out[k]); });
    if (out.progress != null) out.progress = Math.min(100, Math.max(0, out.progress));
    if (out.paid) out.paid = out.paid === 'Pagado';
    if (out.active) out.active = out.active === 'Activo';
    if (out.owner === '') out.owner = '';
    return out;
  }
  function saveEntity(form) {
    const type = form.dataset.type;
    const collection = TYPE_COLLECTION[type];
    const values = readForm(form);
    if (!collection) return;
    if (type === 'payment') {
      const invoice = data.invoices.find(x => x.id === values.invoiceId);
      if (!invoice || values.amount <= 0 || values.amount > outstanding(invoice) + 0.005) {
        toast('Indica un cobro mayor que cero y no superior al saldo pendiente.', 'bad');
        return;
      }
    }
    if (type === 'document' && safeHref(values.url) === '#') {
      toast('Añade un enlace http o https válido para el documento.', 'bad');
      return;
    }
    if (['quote', 'invoice'].includes(type) && $('[data-quote-line-list]', form)) {
      const detailed = quoteItemsFromForm(form);
      if (detailed.error) { toast(detailed.error, 'bad'); return; }
      values.items = detailed.items;
      values.amount = quoteBase(detailed.items);
    }
    if (['quote', 'invoice'].includes(type) && !form.dataset.id) values.taxName = data.company.taxName || 'IGIC';
    if (type === 'invoice' && values.status === 'Pagada') values.status = 'Emitida';
    if (type === 'lead' && values.probability === 0) values.probability = defaultProbability(values.stage);
    const id = form.dataset.id;
    const savedId = id || uid();
    const time = nowIso();
    const index = id ? data[collection].findIndex(x => x.id === id) : -1;
    if (id && index < 0) { toast('No se encontró el registro. Actualiza la lista e inténtalo de nuevo.', 'bad'); return; }
    if (!commitChange(() => {
      if (id) data[collection][index] = Object.assign({}, data[collection][index], values, { updatedAt: time });
      else data[collection].unshift(Object.assign({ id: savedId, createdAt: time, updatedAt: time }, values));
    })) return;
    $('#modal-root').innerHTML = '';
    const destination = { lead: 'leads', client: 'clients', work: 'works', task: 'tasks', quote: 'quotes', invoice: 'finance', expense: 'finance', event: 'agenda', document: 'documents', team: 'settings', payment: 'finance' }[type] || view;
    if (type === 'team') settingsTab = 'equipo';
    setView(destination);
    renderDetail(type, savedId);
    toast((id ? 'Cambios guardados' : 'Registro creado') + ' correctamente.', 'good');
  }

  function removeEntity(type, id) {
    const collection = TYPE_COLLECTION[type];
    if (!collection || !confirm('¿Eliminar este ' + TYPE_LABEL[type] + '? Esta acción no se puede deshacer.')) return;
    const record = data[collection].find(x => x.id === id);
    if (!record) return;
    if (!commitChange(() => {
      data[collection] = data[collection].filter(x => x.id !== id);
      data._meta.deleted[collection] = data._meta.deleted[collection] || {};
      data._meta.deleted[collection][id] = Date.now();
      if (type === 'invoice') {
        const invoicePayments = data.payments.filter(p => p.invoiceId === id);
        data._meta.deleted.payments = data._meta.deleted.payments || {};
        invoicePayments.forEach(p => { data._meta.deleted.payments[p.id] = Date.now(); });
        data.payments = data.payments.filter(p => p.invoiceId !== id);
      }
    })) return;
    $('#modal-root').innerHTML = '';
    render();
    toast('Registro eliminado.', 'good');
  }

  function convertLead(id, createWork) {
    const lead = data.leads.find(x => x.id === id);
    if (!lead) return;
    if (lead.clientId) { setView('clients'); renderDetail('client', lead.clientId); return; }
    const time = nowIso();
    const client = { id: uid(), name: lead.name || '', company: lead.company || lead.name || '', phone: lead.phone || '', email: lead.email || '', island: lead.island || '', notes: lead.notes || '', createdAt: time, updatedAt: time, sourceLeadId: lead.id };
    const work = createWork ? { id: uid(), name: lead.company ? 'Obra · ' + lead.company : 'Nueva obra · ' + lead.name, clientId: client.id, island: lead.island || '', status: 'Pendiente', budget: num(lead.value), progress: 0, notes: 'Creada desde el lead. Completa dirección, fechas y alcance.', createdAt: time, updatedAt: time, sourceLeadId: lead.id } : null;
    if (!commitChange(() => {
      data.clients.unshift(client);
      if (work) data.works.unshift(work);
      const currentLead = data.leads.find(x => x.id === id);
      currentLead.stage = 'Ganado';
      currentLead.clientId = client.id;
      currentLead.workId = work ? work.id : '';
      currentLead.updatedAt = time;
    })) return;
    $('#modal-root').innerHTML = '';
    setView(work ? 'works' : 'clients');
    renderDetail(work ? 'work' : 'client', work ? work.id : client.id);
    toast(work ? 'Cliente y primera obra creados. Ya puedes organizar tareas y presupuestos.' : 'Lead convertido en cliente. Ya puedes crear su primera obra desde esta ficha.', 'good');
  }

  function updateLeadStage(id, stage) {
    const lead = data.leads.find(x => x.id === id);
    if (!lead || !STATUS.lead.includes(stage)) return;
    if (commitChange(() => { lead.stage = stage; lead.updatedAt = nowIso(); })) {
      renderDetail('lead', id);
      toast('Oportunidad actualizada: ' + stage + '.', 'good');
    }
  }

  function moveRecord(type, id, status) {
    const record = type === 'lead' ? data.leads.find(item => item.id === id) : type === 'work' ? data.works.find(item => item.id === id) : null;
    const allowed = STATUS[type];
    if (!record || !allowed || !allowed.includes(status)) return;
    const field = type === 'lead' ? 'stage' : 'status';
    if (record[field] === status) return;
    if (commitChange(() => {
      record[field] = status;
      if (type === 'lead' && status === 'Ganado' && !record.probability) record.probability = 100;
      if (type === 'work' && status === 'Terminada') record.progress = 100;
      record.updatedAt = nowIso();
    })) {
      render();
      toast((type === 'lead' ? 'Lead' : 'Obra') + ' movido a «' + status + '».', 'good');
    }
  }

  function advanceLead(id) {
    const lead = data.leads.find(x => x.id === id);
    if (!lead) return;
    const stages = ['Nuevo', 'Contactado', 'Cualificado', 'Propuesta enviada'];
    const index = stages.indexOf(lead.stage);
    if (index < 0 || index >= stages.length - 1) { openConvertLead(id); return; }
    updateLeadStage(id, stages[index + 1]);
  }

  function openQuickNew(target) {
    const type = target.dataset.type;
    const preset = {};
    if (target.dataset.clientId) preset.clientId = target.dataset.clientId;
    if (target.dataset.workId) preset.workId = target.dataset.workId;
    const lead = target.dataset.leadId ? data.leads.find(x => x.id === target.dataset.leadId) : null;
    if (lead && type === 'event') {
      preset.title = 'Seguimiento · ' + (lead.company || lead.name || 'oportunidad');
      preset.date = lead.nextDate || today;
      preset.kind = 'Llamada';
      preset.island = lead.island || '';
      preset.notes = 'Seguimiento comercial de ' + (lead.company || lead.name || 'la oportunidad') + (lead.phone ? ' · Teléfono: ' + lead.phone : '');
    }
    const client = preset.clientId ? data.clients.find(x => x.id === preset.clientId) : null;
    const work = preset.workId ? data.works.find(x => x.id === preset.workId) : null;
    if (type === 'work' && client && !preset.island) preset.island = client.island || '';
    if (type === 'event' && !preset.island) preset.island = work ? work.island || '' : client ? client.island || '' : '';
    if (type === 'work' && client) preset.name = 'Obra · ' + (client.company || client.name);
    if (type === 'quote') preset.title = 'Presupuesto · ' + (work ? work.name : client ? (client.company || client.name) : '');
    if (type === 'task') preset.title = (work ? 'Trabajo · ' + work.name : client ? 'Tarea · ' + (client.company || client.name) : '');
    if (type === 'event' && !preset.title && (work || client)) preset.title = (work ? 'Visita de obra · ' + work.name : 'Cita · ' + (client.company || client.name));
    if (type === 'document' && work) preset.title = 'Documento · ' + work.name;
    if (type === 'expense' && work) preset.title = 'Gasto de obra · ' + work.name;
    openForm(type, '', preset);
  }

  function quoteToInvoice(id) {
    const q = data.quotes.find(x => x.id === id);
    if (!q) return;
    const time = nowIso();
    const invoice = { id: uid(), title: q.title, number: '', clientId: q.clientId, workId: q.workId, date: today, due: '', amount: num(q.amount), items: Array.isArray(q.items) ? clone(q.items) : [], taxName: q.taxName || data.company.taxName || 'IGIC', taxRate: num(q.taxRate), status: 'Borrador', notes: q.notes || 'Creada desde presupuesto ' + (q.number || q.title), createdAt: time, updatedAt: time, sourceQuoteId: q.id };
    if (!commitChange(() => {
      data.invoices.unshift(invoice);
      const currentQuote = data.quotes.find(x => x.id === id);
      currentQuote.status = 'Aceptada';
      currentQuote.updatedAt = time;
    })) return;
    $('#modal-root').innerHTML = '';
    setView('finance');
    toast('Presupuesto convertido en factura borrador.', 'good');
  }

  function openPayment(invoiceId) {
    const invoice = data.invoices.find(x => x.id === invoiceId);
    if (!invoice) return;
    if (outstanding(invoice) <= 0) return toast('Esta factura ya está completamente cobrada.', 'good');
    openForm('payment', '', { invoiceId, amount: outstanding(invoice), date: today });
  }

  function mergeData(local, remote) {
    const result = normalize(local);
    COLLECTIONS.forEach(c => {
      const map = new Map();
      (local[c] || []).concat(remote[c] || []).forEach(item => {
        const old = map.get(item.id);
        if (!old || String(item.updatedAt || item.createdAt || '') > String(old.updatedAt || old.createdAt || '')) map.set(item.id, item);
      });
      const deletes = Object.assign({}, (local._meta && local._meta.deleted && local._meta.deleted[c]) || {}, (remote._meta && remote._meta.deleted && remote._meta.deleted[c]) || {});
      result[c] = Array.from(map.values()).filter(item => Number(deletes[item.id] || 0) <= new Date(item.updatedAt || item.createdAt || 0).getTime());
      result._meta.deleted[c] = deletes;
    });
    const localUpdated = Number(local._meta && local._meta.companyUpdated || 0);
    const remoteUpdated = Number(remote._meta && remote._meta.companyUpdated || 0);
    result.company = remoteUpdated > localUpdated ? remote.company : local.company;
    result._meta.companyUpdated = Math.max(localUpdated, remoteUpdated);
    return result;
  }

  async function initCloud() {
    const cfg = window.GESTION_CLIENTES_SUPABASE_CONFIG || {};
    if (!window.supabase || !cfg.url || !cfg.publishableKey) {
      cloudProblem = 'La conexión de nube no está configurada en esta instalación.';
      updateCloudPill('error');
      return;
    }
    try {
      supa = window.supabase.createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'gestion_clientes_auth_v1' } });
      const { data: result } = await supa.auth.getSession();
      cloudUser = result && result.session ? result.session.user : null;
      if (cloudUser) syncCloud(false);
      updateCloudPill();
    } catch (err) { console.warn('No se pudo iniciar la sincronización.', err); cloudProblem = cloudErrorMessage(err); updateCloudPill('error'); }
  }
  function cloudErrorMessage(error) {
    const code = String(error && error.code || '').toLowerCase();
    const message = String(error && error.message || error || '').toLowerCase();
    if (code === 'pgrst205' || code === '42p01' || /could not find the table|relation .* does not exist/.test(message)) {
      return 'Supabase no encuentra public.gestion_clientes. Descarga el SQL de esta app y ejecútalo una vez en el Editor SQL del proyecto; no modifica los datos de Control Laboral.';
    }
    if (/email_not_confirmed|email not confirmed|email confirmation/.test(code + ' ' + message)) {
      return 'Confirma el correo que Supabase envió al crear la cuenta. Después inicia sesión con esos mismos datos.';
    }
    if (/invalid_credentials|invalid login credentials|invalid email or password/.test(code + ' ' + message)) {
      return 'El correo o la contraseña no coinciden. Comprueba que usas la cuenta creada en el móvil y su contraseña de 6 caracteres.';
    }
    if (/weak_password|password.*(too short|at least|minimum)/.test(code + ' ' + message)) {
      return 'Supabase rechazó la contraseña al crear la cuenta. Usa la contraseña de la cuenta existente para iniciar sesión.';
    }
    if (/failed to fetch|network|fetcherror|timeout/.test(code + ' ' + message)) {
      return 'No se pudo conectar con Supabase. Comprueba internet e inténtalo de nuevo.';
    }
    if (/permission denied|row-level security|rls|42501/.test(code + ' ' + message)) {
      return 'Supabase bloqueó el acceso a la tabla. Ejecuta el SQL de configuración para aplicar los permisos privados.';
    }
    return 'No se pudo conectar. ' + String(error && error.message || 'Comprueba el correo, la conexión y la configuración de Supabase.');
  }
  function updateCloudPill(state) {
    const pill = $('#sync-pill');
    if (!pill) return;
    pill.dataset.state = state || (cloudUser ? 'ok' : 'local');
    $('#sync-label').textContent = state === 'busy' ? 'Sincronizando…' : state === 'error' ? 'Error de sincronización' : cloudUser ? 'Nube conectada' : 'Guardado en este dispositivo';
  }
  async function syncCloud(force) {
    if (!supa || !cloudUser || cloudBusy || !navigator.onLine) return;
    cloudBusy = true; updateCloudPill('busy');
    try {
      const result = await supa.from(CLOUD_TABLE).select('payload,updated_at').eq('user_id', cloudUser.id).maybeSingle();
      if (result.error) throw result.error;
      let remote = result.data && result.data.payload ? normalize(result.data.payload) : null;
      if (remote) data = mergeData(data, remote);
      const payload = clone(data);
      const saveResult = await supa.from(CLOUD_TABLE).upsert({ user_id: cloudUser.id, payload, updated_at: nowIso() }, { onConflict: 'user_id' });
      if (saveResult.error) throw saveResult.error;
      cloudProblem = '';
      cloudSetupRequired = false;
      localStorage.setItem(KEY, JSON.stringify(data));
      localStorage.setItem(KEY + '_cloud_at', nowIso());
      mirrorBridgeStorage();
      updateCloudPill('ok');
      if (force) toast('Sincronización completada.', 'good');
      if (view === 'settings') render();
    } catch (err) {
      console.error('Error de sincronización:', err);
      cloudProblem = cloudErrorMessage(err);
      const code = String(err && err.code || '').toLowerCase();
      cloudSetupRequired = code === 'pgrst205' || code === '42p01' || /could not find the table|relation .* does not exist/i.test(String(err && err.message || ''));
      updateCloudPill('error');
      if (force) toast(cloudProblem, 'bad');
      if (view === 'settings') render();
    } finally { cloudBusy = false; }
  }

  async function cloudLogin(form, mode) {
    if (!supa) { cloudProblem = 'No está disponible el cliente de nube. Recarga la app y comprueba la conexión.'; render(); return toast(cloudProblem, 'bad'); }
    try {
      const fd = new FormData(form);
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      cloudEmailDraft = email;
      const result = mode === 'signup'
        ? await supa.auth.signUp({ email, password })
        : await supa.auth.signInWithPassword({ email, password });
      if (result.error) {
        cloudProblem = cloudErrorMessage(result.error);
        render();
        return toast(cloudProblem, 'bad');
      }
      if (!result.data.session && mode === 'signup') {
        cloudUser = null;
        cloudProblem = 'Cuenta creada. Confirma el correo que Supabase envió antes de iniciar sesión.';
        updateCloudPill();
        render();
        return toast(cloudProblem, 'good');
      }
      if (!result.data.session) {
        cloudUser = null;
        cloudProblem = 'Supabase no devolvió una sesión. Confirma el correo de la cuenta y vuelve a intentarlo.';
        render();
        return toast(cloudProblem, 'bad');
      }
      cloudProblem = '';
      cloudUser = result.data && result.data.user ? result.data.user : null;
      updateCloudPill();
      await syncCloud(true);
      render();
    } catch (err) { cloudProblem = cloudErrorMessage(err); render(); toast(cloudProblem, 'bad'); }
  }
  async function cloudLogout() {
    if (supa) await supa.auth.signOut();
    cloudUser = null; cloudProblem = ''; updateCloudPill(); render(); toast('Sesión cerrada. Tus datos locales siguen disponibles.');
  }

  function toBase64Utf8(content) {
    const bytes = new TextEncoder().encode(String(content));
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }
  function download(name, content, type) {
    const mime = type || 'application/octet-stream';
    const encoded = toBase64Utf8(content);
    if (window.AndroidBridge && typeof window.AndroidBridge.saveFile === 'function') {
      window.AndroidBridge.saveFile(encoded, name, mime, String(Date.now()));
      return;
    }
    if (window.GestionClientesDesktopBridge && typeof window.GestionClientesDesktopBridge.saveFile === 'function') {
      window.GestionClientesDesktopBridge.saveFile(name, mime, encoded).then(saved => toast(saved ? 'Archivo guardado.' : 'No se guardó el archivo.', saved ? 'good' : 'bad'));
      return;
    }
    const blob = new Blob([content], { type: type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function backup() {
    const payload = { app: 'Gestión Clientes', exportedAt: nowIso(), data };
    download('gestion-clientes-copia-' + today + '.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('Copia de seguridad descargada.', 'good');
  }
  function restoreFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const incoming = normalize(parsed.data || parsed);
        if (!confirm('Restaurar sustituirá los datos actuales de esta instalación. ¿Continuar?')) return;
        if (commitChange(() => { data = incoming; })) { render(); toast('Copia restaurada correctamente.', 'good'); }
      } catch (_) { toast('El archivo no contiene una copia válida.', 'bad'); }
    };
    reader.readAsText(file);
  }
  function csvEscape(v) { let s = String(v == null ? '' : v); if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  function csvFor(collection) {
    const rows = data[collection] || [];
    if (!rows.length) return '\ufeffSin registros\n';
    const keys = Array.from(new Set(rows.flatMap(x => Object.keys(x).filter(k => !['id', 'createdAt', 'updatedAt'].includes(k)))));
    return '\ufeff' + [keys.map(csvEscape).join(';')].concat(rows.map(x => keys.map(k => {
      if (k === 'clientId') return csvEscape(selected(data.clients, x[k]));
      if (k === 'workId') return csvEscape(workName(x[k]));
      if (k === 'owner') return csvEscape(teamName(x[k]));
      return csvEscape(x[k]);
    }).join(';'))).join('\r\n');
  }
  function exportAll() {
    COLLECTIONS.forEach(c => { if (data[c].length) download('gestion-clientes-' + c + '-' + today + '.csv', csvFor(c), 'text/csv;charset=utf-8'); });
    toast('Exportación iniciada para los registros disponibles.', 'good');
  }
  function exportReport() {
    const groups = [
      ['Leads', data.leads], ['Clientes', data.clients], ['Obras', data.works], ['Tareas', data.tasks], ['Presupuestos', data.quotes], ['Facturas', data.invoices], ['Cobros', data.payments], ['Gastos', data.expenses]
    ];
    let lines = ['Sección;Registro;Estado;Relacionado;Importe;Fecha'];
    groups.forEach(([name, rows]) => rows.forEach(x => lines.push([name, x.name || x.title || x.number || '', x.stage || x.status || '', selected(data.clients, x.clientId) || workName(x.workId) || '', x.amount == null ? '' : x.amount, x.date || x.due || x.createdAt || ''].map(csvEscape).join(';'))));
    download('gestion-clientes-informe-' + today + '.csv', '\ufeff' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }
  function printPage() {
    if (window.AndroidBridge && typeof window.AndroidBridge.printReport === 'function') window.AndroidBridge.printReport();
    else window.print();
  }

  function handleAction(target) {
    const action = target.dataset.action;
    if (action === 'close-sidebar') { $('#sidebar').classList.remove('open'); return; }
    if (action === 'close-modal') { $('#modal-root').innerHTML = ''; return; }
    if (action === 'add-quote-line') { addQuoteLine(target.closest('form')); return; }
    if (action === 'remove-quote-line') {
      const form = target.closest('form');
      const row = target.closest('.quote-line-card');
      const list = form && $('[data-quote-line-list]', form);
      if (row && list) {
        row.remove();
        if (!list.children.length) list.innerHTML = quoteLineMarkup({ category: 'Mano de obra', description: '', quantity: '', unit: 'horas', unitPrice: '' });
        updateQuoteTotals(form);
      }
      return;
    }
    if (action === 'backdrop' && target === $('.modal-backdrop')) { $('#modal-root').innerHTML = ''; return; }
    if (action === 'new') { openForm(target.dataset.type, null, { category: target.dataset.category, kind: target.dataset.kind }); return; }
    if (action === 'quick-new') { openQuickNew(target); return; }
    if (action === 'edit') { openForm(target.dataset.type, target.dataset.id); return; }
    if (action === 'delete') { removeEntity(target.dataset.type, target.dataset.id); return; }
    if (action === 'detail') { closeGlobalSearch(true); renderDetail(target.dataset.type, target.dataset.id); $('#sidebar').classList.remove('open'); return; }
    if (action === 'convert-lead') { openConvertLead(target.dataset.id); return; }
    if (action === 'convert-lead-finish') { convertLead(target.dataset.id, target.dataset.createWork === 'true'); return; }
    if (action === 'advance-lead') { advanceLead(target.dataset.id); return; }
    if (action === 'reopen-lead') { updateLeadStage(target.dataset.id, 'Nuevo'); return; }
    if (action === 'quote-to-invoice') { quoteToInvoice(target.dataset.id); return; }
    if (action === 'payment') { openPayment(target.dataset.id); return; }
    if (action === 'toggle-task') {
      const t = data.tasks.find(x => x.id === target.dataset.id);
      if (t && commitChange(() => { t.status = t.status === 'Hecha' ? 'Pendiente' : 'Hecha'; t.updatedAt = nowIso(); })) render();
      return;
    }
    if (action === 'toggle-view-mode') { const key = target.dataset.listKey; if (key && viewModes[key]) { viewModes[key] = target.dataset.viewMode === 'board' ? 'board' : 'list'; render(); } return; }
    if (action === 'settings-tab') { settingsTab = target.dataset.tab || 'empresa'; if (view !== 'settings') { setView('settings'); return; } render(); return; }
    if (action === 'myday-shift') { const d = new Date((myDayDate || today) + 'T12:00:00'); d.setDate(d.getDate() + Number(target.dataset.delta || 0)); myDayDate = dateKey(d); render(); return; }
    if (action === 'myday-today') { myDayDate = today; render(); return; }
    if (action === 'month-shift') { const d = new Date(agendaMonth + '-01T12:00:00'); d.setMonth(d.getMonth() + Number(target.dataset.delta || 0)); agendaMonth = dateKey(d).slice(0, 7); render(); return; }
    if (action === 'month-today') { agendaMonth = today.slice(0, 7); render(); return; }
    if (action === 'backup') { backup(); return; }
    if (action === 'restore') { $('#restore-input').click(); return; }
    if (action === 'export-all') { exportAll(); return; }
    if (action === 'export-report') { exportReport(); return; }
    if (action === 'cloud-setup') { download('gestion-clientes-supabase-setup.sql', CLOUD_SETUP_SQL, 'text/plain;charset=utf-8'); toast('SQL de Gestión Clientes descargado. Ejecútalo en Supabase y vuelve a sincronizar.', 'good'); return; }
    if (action === 'toggle-theme') { toggleTheme(); return; }
    if (action === 'print') { printPage(); return; }
    if (action === 'cloud-sync') { syncCloud(true); return; }
    if (action === 'cloud-logout') { cloudLogout(); return; }
    const viewButton = target.closest('[data-view]');
    if (viewButton) setView(viewButton.dataset.view);
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('.document-link')) return;
    if (!event.target.closest('.global-search')) closeGlobalSearch(false);
    const nav = event.target.closest('[data-view]');
    if (nav) { event.preventDefault(); setView(nav.dataset.view); return; }
    const target = event.target.closest('[data-action]');
    if (target) {
      // A submit button has no data-action of its own, so its closest action
      // ancestor is the backdrop. Ignore clicks within the modal itself.
      if (target.dataset.action === 'backdrop' && event.target !== target) return;
      handleAction(target);
    }
  });
  document.addEventListener('submit', (event) => {
    if (event.target.id === 'entity-form') { event.preventDefault(); saveEntity(event.target); }
    else if (event.target.id === 'company-form') {
      event.preventDefault();
      const companyValues = {};
      new FormData(event.target).forEach((v, k) => { companyValues[k] = String(v).trim(); });
      companyValues.taxName = 'IGIC';
      companyValues.taxRate = num(companyValues.taxRate);
      if (commitChange(() => {
        Object.assign(data.company, companyValues);
        data._meta.companyUpdated = Date.now();
      })) { render(); toast('Datos de empresa guardados.', 'good'); }
    } else if (event.target.id === 'cloud-form') {
      event.preventDefault();
      const mode = event.submitter && event.submitter.dataset.cloudMode || 'login';
      cloudLogin(event.target, mode);
    }
  });
  document.addEventListener('input', (event) => {
    if (event.target.id === 'global-search-input') renderGlobalSearch(event.target.value);
    if (event.target.id === 'search-input') {
      searchText = event.target.value;
      const caret = event.target.selectionStart;
      render();
      const input = $('#search-input');
      if (input) { input.focus(); input.setSelectionRange(caret, caret); }
    }
    if (event.target.matches('[data-quote-field="unit"]')) event.target.dataset.autoUnit = 'false';
    if (event.target.form && event.target.form.id === 'entity-form' && $('[data-quote-line-list]', event.target.form)) updateQuoteTotals(event.target.form);
  });
  document.addEventListener('change', (event) => {
    if (event.target.id === 'filter-select') { filterValue = event.target.value; render(); }
    if (event.target.id === 'island-filter') { islandFilter = event.target.value || 'all'; render(); }
    if (event.target.dataset.moveType) { moveRecord(event.target.dataset.moveType, event.target.dataset.id, event.target.value); return; }
    if (event.target.form && event.target.form.id === 'entity-form' && event.target.name === 'island') event.target.dataset.inherited = 'false';
    if (event.target.form && event.target.form.id === 'entity-form' && ['clientId', 'workId'].includes(event.target.name)) {
      const form = event.target.form;
      const island = $('[name="island"]', form);
      if (island && (!island.value || island.dataset.inherited === 'true')) {
        const relatedWork = event.target.name === 'workId' ? data.works.find(item => item.id === event.target.value) : null;
        const relatedClientId = event.target.name === 'clientId' ? event.target.value : (relatedWork && relatedWork.clientId) || $('[name="clientId"]', form)?.value;
        const relatedClient = data.clients.find(item => item.id === relatedClientId);
        const inheritedIsland = (relatedWork && relatedWork.island) || (relatedClient && relatedClient.island) || '';
        if (inheritedIsland) { island.value = inheritedIsland; island.dataset.inherited = 'true'; }
      }
    }
    if (event.target.id === 'restore-input') restoreFile(event.target.files && event.target.files[0]);
    if (event.target.matches('[data-quote-field="category"]')) {
      const row = event.target.closest('.quote-line-card');
      const unit = row && $('[data-quote-field="unit"]', row);
      if (unit && unit.dataset.autoUnit !== 'false') unit.value = quoteDefaultUnit(event.target.value);
    }
    if (event.target.form && event.target.form.id === 'entity-form' && $('[data-quote-line-list]', event.target.form)) updateQuoteTotals(event.target.form);
  });
  document.addEventListener('focusin', event => {
    if (event.target.id === 'global-search-input' && event.target.value.trim()) renderGlobalSearch(event.target.value);
  });
  document.addEventListener('keydown', event => {
    const search = $('#global-search-input');
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      search.focus();
      search.select();
      renderGlobalSearch(search.value);
      return;
    }
    if (event.key === 'Escape' && (event.target === search || (event.target.closest && event.target.closest('.global-search-results')))) { closeGlobalSearch(false); search.focus(); return; }
    if (event.target === search && event.key === 'ArrowDown') {
      const first = $('.global-search-result');
      if (first) { event.preventDefault(); first.focus(); }
      return;
    }
    if (event.target.classList && event.target.classList.contains('global-search-result')) {
      const options = $$('.global-search-result');
      const index = options.indexOf(event.target);
      if (event.key === 'ArrowDown' && options[index + 1]) { event.preventDefault(); options[index + 1].focus(); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); (options[index - 1] || search).focus(); return; }
    }
    if (event.target === search && event.key === 'Enter') {
      const first = $('.global-search-result');
      if (first) { event.preventDefault(); first.click(); }
    }
  });
  $('#menu-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  window.addEventListener('online', () => { if (cloudUser) syncCloud(false); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && cloudUser) syncCloud(false); });
  setInterval(() => { if (cloudUser && !document.hidden) syncCloud(false); }, 60000);
  window.__gestionClientesNativeSaveResult = (requestId, saved) => toast(saved ? 'Archivo guardado.' : 'No se guardó el archivo.', saved ? 'good' : 'bad');
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(err => console.warn('No se pudo activar el modo sin conexión.', err));
  }
  applyTheme();
  render();
  initCloud();
})();
