(function () {
  'use strict';

  const KEY = 'gestion_clientes_data_v1';
  const CLOUD_TABLE = 'gestion_clientes';
  const COLLECTIONS = ['leads', 'clients', 'works', 'tasks', 'quotes', 'invoices', 'payments', 'expenses', 'events', 'documents', 'team'];
  const TITLES = { dashboard: 'Resumen', agenda: 'Agenda', leads: 'Leads', clients: 'Clientes', works: 'Obras', tasks: 'Tareas', quotes: 'Presupuestos', finance: 'Facturas y gastos', documents: 'Documentos', reports: 'Informes', settings: 'Ajustes y equipo' };
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
  let syncTimer = null;
  let cloudBusy = false;
  let settingsTab = 'empresa';
  let agendaMonth = today.slice(0, 7);

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
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $('#crumb-title').textContent = TITLES[view] || 'Resumen';
    $('#sidebar').classList.remove('open');
    render();
  }
  function $$(s, root) { return Array.from((root || document).querySelectorAll(s)); }
  function clientName(id) { const x = data.clients.find(r => r.id === id); return x ? (x.company || x.name) : ''; }
  function workName(id) { const x = data.works.find(r => r.id === id); return x ? x.name : ''; }
  function teamName(id) { const x = data.team.find(r => r.id === id); return x ? x.name : ''; }
  function total(row) { return Math.max(0, num(row.amount)) * (1 + Math.max(0, num(row.taxRate)) / 100); }
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
    const initials = (data.company.owner || data.company.name || '37').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
    $('#user-avatar').textContent = initials;
    $('#user-avatar-top').textContent = initials;
    $('#today-label').textContent = new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
    const overdue = data.tasks.filter(t => t.status !== 'Hecha' && t.due && t.due < today).length;
    const leadsDue = data.leads.filter(l => l.stage !== 'Ganado' && l.stage !== 'Perdido' && l.nextDate && l.nextDate <= today).length;
    $('#tasks-count').textContent = overdue ? String(overdue) : '';
    $('#leads-count').textContent = leadsDue ? String(leadsDue) : '';
    $('#agenda-count').textContent = String(upcomingCount() || '');
    const root = $('#view-root');
    root.innerHTML = view === 'dashboard' ? renderDashboard()
      : view === 'agenda' ? renderAgenda()
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
  function newBtn(type, label) { return btn('<span>＋</span>' + esc(label), 'new', 'btn-primary', ' data-type="' + type + '"'); }
  function empty(title, copy, type, label) {
    return '<div class="empty"><strong>' + esc(title) + '</strong>' + esc(copy) + (type ? newBtn(type, label || 'Crear primero') : '') + '</div>';
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
    const hero = '<section class="hero"><div><p class="eyebrow">' + esc(new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })) + '</p><h1>' + (data.company.name ? 'Hola, <span style="color:var(--brand)">' + esc(data.company.owner || data.company.name) + '</span>' : 'Tu empresa, <span style="color:var(--brand)">en orden.</span>') + '</h1><p>Un vistazo claro a las oportunidades, las obras y los compromisos que mueven el negocio.</p></div><div class="hero-actions">' + newBtn('lead', 'Nuevo lead') + newBtn('task', 'Nueva tarea') + '</div></section>';
    const kpis = '<div class="kpis">' +
      kpi('Leads abiertos', openLeads.length, money(weighted) + ' en oportunidades', '✳') +
      kpi('Obras en curso', activeWorks, data.works.length + ' obras en total', '▦') +
      kpi('Por cobrar', money(outstandingTotal), data.invoices.filter(i => outstanding(i) > 0).length + ' facturas pendientes', '€') +
      kpi('Tareas pendientes', data.tasks.filter(t => t.status !== 'Hecha').length, dueTasks.filter(t => t.due < today).length + ' fuera de plazo', '☷') + '</div>';
    const tasksContent = dueTasks.length ? '<div class="list">' + dueTasks.map(t => row(t.title, (workName(t.workId) || selected(data.clients, t.clientId) || 'Sin obra asignada') + ' · vence ' + dateFmt(t.due), t.status, '<span class="row-date">' + esc(dateFmt(t.due, { day: '2-digit', month: 'short' })) + '</span>', '', t.id, 'task')).join('') + '</div>' : empty('Sin tareas próximas', 'Crea tareas y asígnalas a una obra para tenerlas a mano.', 'task', 'Crear tarea');
    const leadContent = followups.length ? '<div class="list">' + followups.map(l => row(l.name || l.company, (l.company && l.name ? l.company + ' · ' : '') + 'seguimiento ' + dateFmt(l.nextDate), l.stage, '<span class="row-amount">' + esc(money(l.value)) + '</span>', '', l.id, 'lead')).join('') + '</div>' : empty('Sin seguimientos programados', 'Añade una fecha de seguimiento a un lead.', 'lead', 'Añadir lead');
    const worksContent = workRows.length ? '<div class="list">' + workRows.map(w => row(w.name, selected(data.clients, w.clientId) + (w.end ? ' · entrega ' + dateFmt(w.end) : ''), w.status, '<span class="row-amount">' + esc(money(w.budget)) + '</span>', '', w.id, 'work')).join('') + '</div>' : empty('Aún no hay obras', 'Las obras de tu empresa aparecerán aquí.', 'work', 'Crear obra');
    return setup + hero + kpis + card('Embudo comercial', pipeline, openLeads.length + ' oportunidades activas', '<button class="text-link" data-view="leads">Ver leads →</button>') + '<div class="grid-2" style="margin-top:14px">' + card('Tareas por delante', tasksContent, 'Fechas límite más próximas', '<button class="text-link" data-view="tasks">Todas →</button>') + card('Seguimientos comerciales', leadContent, 'No dejes enfriar una oportunidad', '<button class="text-link" data-view="leads">Todos →</button>') + '</div><div style="margin-top:14px">' + card('Obras activas', worksContent, 'Proyectos que están en marcha', '<button class="text-link" data-view="works">Ver obras →</button>') + '</div>';
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
  function renderListView(key) {
    const cfg = PAGE_CONFIG[key];
    if (!cfg) return renderDashboard();
    const headerActions = newBtn(cfg.type, 'Nuevo ' + cfg.singular);
    const head = header(key === 'leads' ? 'VENTAS' : key === 'works' ? 'PROYECTOS' : key === 'tasks' ? 'ORGANIZACIÓN' : key === 'quotes' ? 'ADMINISTRACIÓN' : key === 'documents' ? 'ARCHIVO' : 'RELACIONES', cfg.title, cfg.sub, headerActions);
    let items = data[cfg.collection].slice();
    const q = searchText.toLocaleLowerCase('es');
    if (q) items = items.filter(x => JSON.stringify(x).toLocaleLowerCase('es').includes(q));
    if (filterValue !== 'all') items = items.filter(x => (x.stage || x.status || x.priority || x.kind) === filterValue);
    if (key === 'tasks') items.sort((a, b) => (a.status === 'Hecha') - (b.status === 'Hecha') || (a.due || '9999').localeCompare(b.due || '9999'));
    else items.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
    const search = '<div class="toolbar"><div class="search"><input id="search-input" type="search" value="' + esc(searchText) + '" placeholder="Buscar ' + esc(cfg.title.toLowerCase()) + '..." aria-label="Buscar ' + esc(cfg.title.toLowerCase()) + '"></div>' + (cfg.fields ? '<select id="filter-select" aria-label="Filtrar por estado"><option value="all">Todos los estados</option>' + STATUS[cfg.filter].map(s => '<option' + (filterValue === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + (key === 'tasks' ? '<option' + (filterValue === 'Alta' ? ' selected' : '') + '>Alta</option><option' + (filterValue === 'Media' ? ' selected' : '') + '>Media</option><option' + (filterValue === 'Baja' ? ' selected' : '') + '>Baja</option>' : '') + '</select>' : '') + '<span class="muted small">' + items.length + (items.length === 1 ? ' registro' : ' registros') + '</span></div>';
    const content = items.length ? '<div class="list">' + items.map(x => renderListRow(key, x)).join('') + '</div>' : empty(q || filterValue !== 'all' ? 'No se encontraron resultados' : 'Todavía no hay registros', q ? 'Prueba con otra búsqueda.' : 'Crea el primero para empezar a organizarlo.', cfg.type, 'Crear ' + cfg.singular);
    return head + '<section class="card">' + search + content + '</section>';
  }

  function renderListRow(key, x) {
    if (key === 'leads') return row(x.name || x.company, (x.company && x.name ? x.company + ' · ' : '') + (x.source || 'Origen sin indicar') + (x.nextDate ? ' · próximo paso ' + dateFmt(x.nextDate) : ''), x.stage, amountEnd(x.value, x.owner ? teamName(x.owner) : ''), '', x.id, 'lead');
    if (key === 'clients') return row(x.company || x.name, [x.name && x.company ? x.name : '', x.email, x.phone, data.works.filter(w => w.clientId === x.id).length + ' obras'].filter(Boolean).join(' · '), '', '<span class="row-date">' + esc(x.city || '') + '</span>', '', x.id, 'client');
    if (key === 'works') return '<div class="row-item" data-action="detail" data-type="work" data-id="' + esc(x.id) + '"><div class="row-main"><div class="row-title">' + esc(x.name) + badge(x.status) + '</div><div class="row-sub">' + esc(selected(data.clients, x.clientId) + (x.address ? ' · ' + x.address : '') + (x.end ? ' · entrega ' + dateFmt(x.end) : '')) + '</div><div class="progress" style="margin-top:8px"><i style="width:' + Math.min(100, Math.max(0, num(x.progress))) + '%"></i></div></div><div class="row-end"><div><div class="row-amount">' + esc(money(x.budget)) + '</div><div class="row-date">' + esc(Math.round(num(x.progress)) + '% completado') + '</div></div></div></div>';
    if (key === 'tasks') return '<div class="row-item"><button class="tiny-btn ' + (x.status === 'Hecha' ? '' : 'danger') + '" data-action="toggle-task" data-id="' + esc(x.id) + '" aria-label="' + (x.status === 'Hecha' ? 'Reabrir' : 'Marcar hecha') + '">' + (x.status === 'Hecha' ? '✓' : '○') + '</button><div class="row-main" data-action="detail" data-type="task" data-id="' + esc(x.id) + '"><div class="row-title">' + esc(x.title) + badge(x.status) + badge(x.priority || 'Media') + '</div><div class="row-sub">' + esc(workName(x.workId) || selected(data.clients, x.clientId) || 'Sin proyecto') + (x.owner ? ' · ' + teamName(x.owner) : '') + '</div></div><div class="row-end"><span class="row-date">' + esc(x.due ? 'Vence ' + dateFmt(x.due) : 'Sin fecha') + '</span></div></div>';
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
      return header('PERSONALIZACIÓN', 'Ajustes y equipo', 'Configura los datos de tu negocio y cómo quieres trabajar.') + nav +
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
      return header('PERSONAS', 'Ajustes y equipo', 'Organiza responsables y asignaciones.') + nav + card('Equipo', list, 'Personas que pueden aparecer como responsables', newBtn('team', 'Añadir persona'));
    }
    const cloudPanel = '<div class="card"><div class="card-head"><div><h2>Sincronización privada</h2><p>Usa tu cuenta para mantener una copia actualizada entre dispositivos.</p></div><span class="badge ' + (cloudUser ? 'green' : '') + '">' + esc(cloudUser ? cloudUser.email : 'Desconectado') + '</span></div>' +
      (cloudUser ? '<p class="modal-note">Los cambios se sincronizan en segundo plano cuando hay conexión. Las copias locales siguen disponibles sin internet.</p><div class="head-actions"><button class="btn btn-primary" data-action="cloud-sync">Sincronizar ahora</button><button class="btn" data-action="cloud-logout">Cerrar sesión</button></div>' :
        '<p class="modal-note">El almacenamiento y las copias JSON funcionan sin cuenta. Para sincronizar, crea una cuenta privada o inicia sesión.</p><form id="cloud-form"><div class="fields"><div class="field"><label for="cloud-email">Correo</label><input id="cloud-email" name="email" type="email" autocomplete="username" required></div><div class="field"><label for="cloud-password">Contraseña</label><input id="cloud-password" name="password" type="password" autocomplete="current-password" minlength="8" required></div></div><div class="head-actions" style="margin-top:12px"><button class="btn btn-primary" type="submit" data-cloud-mode="login">Iniciar sesión</button><button class="btn" type="submit" data-cloud-mode="signup">Crear cuenta</button></div></form>') +
      '<p class="modal-note" style="margin-top:14px">La sincronización necesita configurar una tabla propia en Supabase. Consulta <code>supabase-setup.sql</code>.</p></div>';
    const dataPanel = '<div class="card"><div class="card-head"><div><h2>Copias y exportaciones</h2><p>Conserva tus datos o llévalos a otra instalación.</p></div></div><div class="head-actions"><button class="btn btn-primary" data-action="backup">Descargar copia JSON</button><button class="btn" data-action="restore">Restaurar copia</button><button class="btn" data-action="export-all">Exportar registros CSV</button><input id="restore-input" type="file" accept="application/json,.json" hidden></div><p class="modal-note" style="margin-top:12px">La copia JSON incluye todos los registros, relaciones, configuración e historial de cobros.</p></div>';
    return header('DATOS', 'Ajustes y equipo', 'Copias de seguridad y sincronización en tus dispositivos.') + nav + '<div class="stack">' + dataPanel + cloudPanel + card('Almacenamiento', '<div class="row-item"><div class="row-main"><div class="row-title">Datos locales</div><div class="row-sub">Guardados automáticamente en este dispositivo.</div></div><span class="badge green">Activo</span></div>', 'Sin conexión disponible') + '</div>';
  }
  function settingsField(name, label, value, type, size, placeholder) {
    return '<div class="field ' + (size || '') + '"><label for="co-' + name + '">' + esc(label) + '</label><input id="co-' + name + '" name="' + name + '" type="' + (type || 'text') + '" value="' + esc(value == null ? '' : value) + '"' + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '></div>';
  }

  function renderDetail(type, id) {
    const map = { lead: 'leads', client: 'clients', work: 'works', task: 'tasks', quote: 'quotes', invoice: 'invoices', expense: 'expenses', event: 'events', document: 'documents', team: 'team', payment: 'payments' };
    const collection = map[type];
    const item = collection && data[collection].find(x => x.id === id);
    if (!item) return;
    const title = item.name || item.company || item.title || item.number || item.kind || 'Detalle';
    const facts = [];
    const add = (label, value) => { if (value !== '' && value != null) facts.push('<div class="row-item"><div class="row-main"><div class="row-sub">' + esc(label) + '</div><div class="row-title">' + esc(value) + '</div></div></div>'); };
    if (type === 'lead') { add('Empresa', item.company); add('Estado', item.stage); add('Teléfono', item.phone); add('Correo', item.email); add('Origen', item.source); add('Valor estimado', money(item.value)); add('Próximo seguimiento', dateFmt(item.nextDate)); add('Notas', item.notes); }
    if (type === 'client') { add('Contacto', item.name); add('CIF / NIF', item.taxId); add('Teléfono', item.phone); add('Correo', item.email); add('Dirección', item.address); add('Notas', item.notes); }
    if (type === 'work') { add('Cliente', selected(data.clients, item.clientId)); add('Estado', item.status); add('Dirección', item.address); add('Inicio', dateFmt(item.start)); add('Entrega prevista', dateFmt(item.end)); add('Presupuesto', money(item.budget)); add('Avance', num(item.progress) + '%'); add('Responsable', teamName(item.owner)); add('Notas', item.notes); }
    if (type === 'task') { add('Estado', item.status); add('Prioridad', item.priority); add('Obra', workName(item.workId)); add('Cliente', selected(data.clients, item.clientId)); add('Fecha límite', dateFmt(item.due)); add('Responsable', teamName(item.owner)); add('Descripción', item.description); }
    if (type === 'quote') { add('Cliente', selected(data.clients, item.clientId)); add('Obra', workName(item.workId)); add('Estado', item.status); add('Fecha', dateFmt(item.date)); add('Válido hasta', dateFmt(item.validUntil)); add('Base imponible', money(item.amount)); add(item.taxName || (num(item.taxRate) === 21 ? 'Impuesto anterior' : 'IGIC'), num(item.taxRate) + '%'); add('Total', money(total(item))); add('Descripción', item.notes); }
    if (type === 'invoice') { add('Cliente', selected(data.clients, item.clientId)); add('Obra', workName(item.workId)); add('Estado', item.status); add('Emisión', dateFmt(item.date)); add('Vencimiento', dateFmt(item.due)); add('Base imponible', money(item.amount)); add(item.taxName || (num(item.taxRate) === 21 ? 'Impuesto anterior' : 'IGIC'), num(item.taxRate) + '%'); add('Total', money(total(item))); add('Cobrado', money(paidFor(item))); add('Pendiente', money(outstanding(item))); add('Descripción', item.notes); }
    if (type === 'expense') { add('Categoría', item.category); add('Proveedor', item.vendor); add('Fecha', dateFmt(item.date)); add('Importe', money(item.amount)); add('Obra', workName(item.workId)); add('Notas', item.notes); }
    if (type === 'event') { add('Fecha', dateFmt(item.date)); add('Hora', item.time); add('Tipo', item.kind); add('Responsable', teamName(item.owner)); add('Notas', item.notes); }
    if (type === 'document') { add('Tipo', item.kind); add('Relacionado con', workName(item.workId) || selected(data.clients, item.clientId)); add('Enlace', item.url); add('Notas', item.notes); }
    if (type === 'team') { add('Puesto', item.role); add('Correo', item.email); add('Teléfono', item.phone); add('Estado', item.active === false ? 'Inactivo' : 'Activo'); }
    if (type === 'payment') { add('Factura', selected(data.invoices, item.invoiceId)); add('Fecha', dateFmt(item.date)); add('Método', item.method); add('Importe', money(item.amount)); add('Notas', item.notes); }
    const related = type === 'client' ? data.works.filter(x => x.clientId === id).map(x => '<button class="row-item" data-action="detail" data-type="work" data-id="' + esc(x.id) + '"><span class="row-main"><span class="row-title">' + esc(x.name) + badge(x.status) + '</span><span class="row-sub">' + esc(money(x.budget)) + '</span></span></button>').join('')
      : type === 'work' ? data.tasks.filter(x => x.workId === id).map(x => '<button class="row-item" data-action="detail" data-type="task" data-id="' + esc(x.id) + '"><span class="row-main"><span class="row-title">' + esc(x.title) + badge(x.status) + '</span><span class="row-sub">' + esc(x.due ? dateFmt(x.due) : 'Sin fecha') + '</span></span></button>').join('') : '';
    const extraActions = type === 'lead' && !item.clientId ? '<button class="btn btn-primary btn-sm" data-action="convert-lead" data-id="' + esc(id) + '">Convertir en cliente + obra</button>' : type === 'quote' && item.status !== 'Rechazada' ? '<button class="btn btn-primary btn-sm" data-action="quote-to-invoice" data-id="' + esc(id) + '">Crear factura</button>' : type === 'invoice' && outstanding(item) > 0 ? '<button class="btn btn-primary btn-sm" data-action="payment" data-id="' + esc(id) + '">Registrar cobro</button>' : '';
    const modal = '<div class="modal-backdrop" data-action="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div class="modal-head"><h2 id="detail-title">' + esc(title) + '</h2><button class="close-btn" data-action="close-modal" aria-label="Cerrar">×</button></div><div class="modal-body"><div class="list">' + facts.join('') + '</div>' + (related ? '<div style="margin-top:16px"><div class="card-head"><h2>' + (type === 'client' ? 'Obras del cliente' : 'Tareas de la obra') + '</h2></div><div class="list">' + related + '</div></div>' : '') + '</div><div class="modal-foot"><div>' + extraActions + '</div><div><button class="btn btn-danger btn-sm" data-action="delete" data-type="' + type + '" data-id="' + esc(id) + '">Eliminar</button><button class="btn btn-primary btn-sm" data-action="edit" data-type="' + type + '" data-id="' + esc(id) + '">Editar</button></div></div></section></div>';
    $('#modal-root').innerHTML = modal;
  }

  const FIELDS = {
    lead: [
      ['name', 'Nombre de contacto', 'text', true], ['company', 'Empresa', 'text'], ['phone', 'Teléfono', 'tel'], ['email', 'Correo', 'email'], ['source', 'Origen', 'select', false, ['Recomendación', 'Web', 'Llamada', 'Redes sociales', 'Visita', 'Otro']], ['stage', 'Estado del lead', 'select', false, STATUS.lead], ['value', 'Valor estimado (€)', 'number'], ['probability', 'Probabilidad (%)', 'number'], ['nextDate', 'Próximo seguimiento', 'date'], ['owner', 'Responsable', 'team'], ['notes', 'Notas', 'textarea', false, null, 'full']
    ],
    client: [
      ['company', 'Empresa / nombre comercial', 'text', true], ['name', 'Persona de contacto', 'text'], ['taxId', 'CIF / NIF', 'text'], ['phone', 'Teléfono', 'tel'], ['email', 'Correo', 'email'], ['address', 'Dirección', 'text', false, null, 'full'], ['notes', 'Notas', 'textarea', false, null, 'full']
    ],
    work: [
      ['name', 'Nombre de la obra', 'text', true], ['clientId', 'Cliente', 'client', true], ['status', 'Estado', 'select', false, STATUS.work], ['address', 'Dirección de la obra', 'text', false, null, 'full'], ['start', 'Fecha de inicio', 'date'], ['end', 'Fecha prevista de entrega', 'date'], ['budget', 'Presupuesto (€)', 'number'], ['progress', 'Avance (%)', 'number'], ['owner', 'Responsable', 'team'], ['notes', 'Descripción / notas', 'textarea', false, null, 'full']
    ],
    task: [
      ['title', 'Tarea', 'text', true], ['workId', 'Obra relacionada', 'work'], ['clientId', 'Cliente', 'client'], ['due', 'Fecha límite', 'date'], ['priority', 'Prioridad', 'select', false, ['Alta', 'Media', 'Baja']], ['status', 'Estado', 'select', false, STATUS.task], ['owner', 'Responsable', 'team'], ['description', 'Descripción', 'textarea', false, null, 'full']
    ],
    quote: [
      ['title', 'Concepto / asunto', 'text', true], ['number', 'Número de presupuesto', 'text'], ['clientId', 'Cliente', 'client', true], ['workId', 'Obra relacionada', 'work'], ['date', 'Fecha', 'date'], ['validUntil', 'Válido hasta', 'date'], ['amount', 'Base imponible (€)', 'number', true], ['taxRate', 'IGIC (%)', 'number'], ['status', 'Estado', 'select', false, STATUS.quote], ['notes', 'Detalle y condiciones', 'textarea', false, null, 'full']
    ],
    invoice: [
      ['title', 'Concepto / asunto', 'text', true], ['number', 'Número de factura', 'text'], ['clientId', 'Cliente', 'client', true], ['workId', 'Obra relacionada', 'work'], ['date', 'Fecha de emisión', 'date'], ['due', 'Fecha de vencimiento', 'date'], ['amount', 'Base imponible (€)', 'number', true], ['taxRate', 'IGIC (%)', 'number'], ['status', 'Estado', 'select', false, STATUS.invoice], ['notes', 'Detalle', 'textarea', false, null, 'full']
    ],
    expense: [
      ['title', 'Concepto del gasto', 'text', true], ['category', 'Categoría', 'select', false, ['Materiales', 'Personal', 'Transporte', 'Herramientas', 'Subcontrata', 'Suministros', 'Otros']], ['vendor', 'Proveedor', 'text'], ['date', 'Fecha', 'date'], ['amount', 'Importe (€)', 'number', true], ['workId', 'Obra relacionada', 'work'], ['paid', 'Estado de pago', 'select', false, ['Pendiente', 'Pagado']], ['notes', 'Notas', 'textarea', false, null, 'full']
    ],
    event: [
      ['title', 'Título', 'text', true], ['date', 'Fecha', 'date', true], ['time', 'Hora', 'time'], ['kind', 'Tipo', 'select', false, ['Reunión', 'Llamada', 'Visita de obra', 'Entrega', 'Otro']], ['owner', 'Responsable', 'team'], ['clientId', 'Cliente', 'client'], ['workId', 'Obra', 'work'], ['notes', 'Notas', 'textarea', false, null, 'full']
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
      control = '<select id="' + id + '" name="' + name + '"' + req + '>' + list.map(x => '<option' + (String(selectedValue == null ? '' : selectedValue) === String(x) ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>';
    } else if (kind === 'client') control = '<select id="' + id + '" name="' + name + '"' + req + '>' + optionHtml(data.clients, value, 'Selecciona cliente') + '</select>';
    else if (kind === 'work') control = '<select id="' + id + '" name="' + name + '"' + req + '>' + optionHtml(data.works, value, 'Sin obra asociada') + '</select>';
    else if (kind === 'team') control = '<select id="' + id + '" name="' + name + '"' + req + '>' + optionHtml(personOption(), value, 'Sin asignar') + '</select>';
    else if (kind === 'invoice') control = '<select id="' + id + '" name="' + name + '"' + req + '>' + optionHtml(data.invoices, value, 'Selecciona factura') + '</select>';
    else control = '<input id="' + id + '" name="' + name + '" type="' + kind + '" value="' + esc(value == null ? '' : value) + '"' + (kind === 'number' ? ' step="0.01" min="0"' : '') + req + '>';
    return '<div class="field ' + (size || '') + '"><label for="' + id + '">' + esc(label) + '</label>' + control + '</div>';
  }

  function openForm(type, id, preset) {
    const collection = TYPE_COLLECTION[type];
    if (!collection || !FIELDS[type]) return;
    const old = id ? data[collection].find(x => x.id === id) : null;
    const item = Object.assign({}, old || {}, preset || {});
    if (!old) {
      if (['quote', 'invoice'].includes(type)) { item.date = item.date || today; item.taxRate = item.taxRate == null ? data.company.taxRate : item.taxRate; item.status = item.status || (type === 'quote' ? 'Borrador' : 'Borrador'); }
      if (type === 'lead') item.stage = item.stage || 'Nuevo';
      if (type === 'work') { item.status = item.status || 'Pendiente'; item.progress = 0; }
      if (type === 'task') { item.status = item.status || 'Pendiente'; item.priority = item.priority || 'Media'; }
      if (type === 'expense') { item.date = item.date || today; item.paid = item.paid || 'Pendiente'; }
      if (type === 'event' || type === 'payment') item.date = item.date || today;
      if (type === 'team') item.active = true;
    }
    const title = id ? 'Editar ' + TYPE_LABEL[type] : TYPE_TITLE[type];
    const form = '<div class="modal-backdrop" data-action="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="form-title"><div class="modal-head"><h2 id="form-title">' + esc(title) + '</h2><button class="close-btn" data-action="close-modal" aria-label="Cerrar">×</button></div><form id="entity-form" data-type="' + type + '" data-id="' + esc(id || '') + '"><div class="modal-body"><p class="modal-note">Los campos marcados son necesarios para guardar el registro.</p><div class="fields">' + FIELDS[type].map(s => fieldMarkup(s, item[s[0]])).join('') + '</div></div><div class="modal-foot"><div>' + (id ? '<button type="button" class="btn btn-danger btn-sm" data-action="delete" data-type="' + type + '" data-id="' + esc(id) + '">Eliminar</button>' : '') + '</div><div><button type="button" class="btn" data-action="close-modal">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div></div></form></section></div>';
    $('#modal-root').innerHTML = form;
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
    if (['quote', 'invoice'].includes(type) && !form.dataset.id) values.taxName = data.company.taxName || 'IGIC';
    if (type === 'invoice' && values.status === 'Pagada') values.status = 'Emitida';
    if (type === 'lead' && values.probability === 0) values.probability = defaultProbability(values.stage);
    const id = form.dataset.id;
    const time = nowIso();
    const index = id ? data[collection].findIndex(x => x.id === id) : -1;
    if (id && index < 0) { toast('No se encontró el registro. Actualiza la lista e inténtalo de nuevo.', 'bad'); return; }
    if (!commitChange(() => {
      if (id) data[collection][index] = Object.assign({}, data[collection][index], values, { updatedAt: time });
      else data[collection].unshift(Object.assign({ id: uid(), createdAt: time, updatedAt: time }, values));
    })) return;
    $('#modal-root').innerHTML = '';
    render();
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

  function convertLead(id) {
    const lead = data.leads.find(x => x.id === id);
    if (!lead) return;
    if (!confirm('Se creará un cliente y una obra con los datos del lead. ¿Continuar?')) return;
    const time = nowIso();
    const client = { id: uid(), name: lead.name || '', company: lead.company || lead.name || '', phone: lead.phone || '', email: lead.email || '', notes: lead.notes || '', createdAt: time, updatedAt: time, sourceLeadId: lead.id };
    const work = { id: uid(), name: lead.company ? 'Obra · ' + lead.company : 'Nueva obra · ' + lead.name, clientId: client.id, status: 'Pendiente', budget: num(lead.value), progress: 0, notes: 'Creada desde el lead. Completa dirección, fechas y alcance.', createdAt: time, updatedAt: time, sourceLeadId: lead.id };
    if (!commitChange(() => {
      data.clients.unshift(client);
      data.works.unshift(work);
      const currentLead = data.leads.find(x => x.id === id);
      currentLead.stage = 'Ganado';
      currentLead.clientId = client.id;
      currentLead.workId = work.id;
      currentLead.updatedAt = time;
    })) return;
    $('#modal-root').innerHTML = '';
    render();
    toast('Lead convertido. Ya tienes el cliente y su nueva obra.', 'good');
  }

  function quoteToInvoice(id) {
    const q = data.quotes.find(x => x.id === id);
    if (!q) return;
    const time = nowIso();
    const invoice = { id: uid(), title: q.title, number: '', clientId: q.clientId, workId: q.workId, date: today, due: '', amount: num(q.amount), taxName: q.taxName || data.company.taxName || 'IGIC', taxRate: num(q.taxRate), status: 'Borrador', notes: q.notes || 'Creada desde presupuesto ' + (q.number || q.title), createdAt: time, updatedAt: time, sourceQuoteId: q.id };
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
    if (!window.supabase || !cfg.url || !cfg.publishableKey) return;
    try {
      supa = window.supabase.createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'gestion_clientes_auth_v1' } });
      const { data: result } = await supa.auth.getSession();
      cloudUser = result && result.session ? result.session.user : null;
      if (cloudUser) syncCloud(false);
      updateCloudPill();
    } catch (err) { console.warn('No se pudo iniciar la sincronización.', err); }
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
      localStorage.setItem(KEY, JSON.stringify(data));
      localStorage.setItem(KEY + '_cloud_at', nowIso());
      mirrorBridgeStorage();
      updateCloudPill('ok');
      if (force) toast('Sincronización completada.', 'good');
      if (view === 'settings') render();
    } catch (err) {
      console.error('Error de sincronización:', err);
      updateCloudPill('error');
      if (force) toast('No se pudo sincronizar. Revisa la conexión y la tabla de Supabase.', 'bad');
    } finally { cloudBusy = false; }
  }

  async function cloudLogin(form, mode) {
    if (!supa) return toast('No está disponible el cliente de nube.', 'bad');
    try {
      const fd = new FormData(form);
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      const result = mode === 'signup'
        ? await supa.auth.signUp({ email, password })
        : await supa.auth.signInWithPassword({ email, password });
      if (result.error) return toast(result.error.message || 'No se pudo iniciar sesión.', 'bad');
      if (!result.data.session && mode === 'signup') {
        cloudUser = null;
        updateCloudPill();
        return toast('Cuenta creada. Revisa el correo para confirmar el acceso.', 'good');
      }
      cloudUser = result.data && result.data.user ? result.data.user : null;
      updateCloudPill();
      await syncCloud(true);
      render();
    } catch (err) { toast(err.message || 'No se pudo conectar con la nube.', 'bad'); }
  }
  async function cloudLogout() {
    if (supa) await supa.auth.signOut();
    cloudUser = null; updateCloudPill(); render(); toast('Sesión cerrada. Tus datos locales siguen disponibles.');
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
  function printPage() { window.print(); }

  function handleAction(target) {
    const action = target.dataset.action;
    if (action === 'close-modal') { $('#modal-root').innerHTML = ''; return; }
    if (action === 'backdrop' && target === $('.modal-backdrop')) { $('#modal-root').innerHTML = ''; return; }
    if (action === 'new') { openForm(target.dataset.type); return; }
    if (action === 'edit') { openForm(target.dataset.type, target.dataset.id); return; }
    if (action === 'delete') { removeEntity(target.dataset.type, target.dataset.id); return; }
    if (action === 'detail') { renderDetail(target.dataset.type, target.dataset.id); return; }
    if (action === 'convert-lead') { convertLead(target.dataset.id); return; }
    if (action === 'quote-to-invoice') { quoteToInvoice(target.dataset.id); return; }
    if (action === 'payment') { openPayment(target.dataset.id); return; }
    if (action === 'toggle-task') {
      const t = data.tasks.find(x => x.id === target.dataset.id);
      if (t && commitChange(() => { t.status = t.status === 'Hecha' ? 'Pendiente' : 'Hecha'; t.updatedAt = nowIso(); })) render();
      return;
    }
    if (action === 'settings-tab') { settingsTab = target.dataset.tab || 'empresa'; if (view !== 'settings') { setView('settings'); return; } render(); return; }
    if (action === 'month-shift') { const d = new Date(agendaMonth + '-01T12:00:00'); d.setMonth(d.getMonth() + Number(target.dataset.delta || 0)); agendaMonth = dateKey(d).slice(0, 7); render(); return; }
    if (action === 'month-today') { agendaMonth = today.slice(0, 7); render(); return; }
    if (action === 'backup') { backup(); return; }
    if (action === 'restore') { $('#restore-input').click(); return; }
    if (action === 'export-all') { exportAll(); return; }
    if (action === 'export-report') { exportReport(); return; }
    if (action === 'print') { printPage(); return; }
    if (action === 'cloud-sync') { syncCloud(true); return; }
    if (action === 'cloud-logout') { cloudLogout(); return; }
    const viewButton = target.closest('[data-view]');
    if (viewButton) setView(viewButton.dataset.view);
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('.document-link')) return;
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
    if (event.target.id === 'search-input') {
      searchText = event.target.value;
      const caret = event.target.selectionStart;
      render();
      const input = $('#search-input');
      if (input) { input.focus(); input.setSelectionRange(caret, caret); }
    }
  });
  document.addEventListener('change', (event) => {
    if (event.target.id === 'filter-select') { filterValue = event.target.value; render(); }
    if (event.target.id === 'restore-input') restoreFile(event.target.files && event.target.files[0]);
  });
  $('#menu-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  window.addEventListener('online', () => { if (cloudUser) syncCloud(false); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && cloudUser) syncCloud(false); });
  setInterval(() => { if (cloudUser && !document.hidden) syncCloud(false); }, 60000);
  window.__gestionClientesNativeSaveResult = (requestId, saved) => toast(saved ? 'Archivo guardado.' : 'No se guardó el archivo.', saved ? 'good' : 'bad');
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(err => console.warn('No se pudo activar el modo sin conexión.', err));
  }
  render();
  initCloud();
})();
