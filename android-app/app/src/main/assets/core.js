(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GestionClientesCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COLLECTIONS = ['leads', 'clients', 'works', 'tasks', 'quotes', 'invoices', 'payments', 'expenses', 'events', 'documents', 'team'];
  const REQUIRED_BACKUP_COLLECTIONS = ['leads', 'clients', 'works', 'tasks', 'quotes', 'invoices'];

  function inspectBackup(value) {
    const wrapped = value && typeof value === 'object' && !Array.isArray(value)
      && value.app === 'Gestión Clientes' && value.data && typeof value.data === 'object';
    const candidate = wrapped ? value.data : value;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return { valid: false, error: 'El archivo no contiene datos de Gestión Clientes.' };
    }
    if (candidate.version !== 1 || !candidate.company || typeof candidate.company !== 'object' || Array.isArray(candidate.company)) {
      return { valid: false, error: 'El archivo no tiene una versión de datos compatible.' };
    }
    const missing = REQUIRED_BACKUP_COLLECTIONS.filter(name => !Array.isArray(candidate[name]));
    if (missing.length) return { valid: false, error: 'Faltan colecciones necesarias: ' + missing.join(', ') + '.' };
    if (COLLECTIONS.some(name => Array.isArray(candidate[name]) && candidate[name].some(row => !row || typeof row !== 'object' || row.id == null))) {
      return { valid: false, error: 'Hay registros sin identificador y no se puede restaurar con seguridad.' };
    }
    const counts = Object.fromEntries(COLLECTIONS.map(name => [name, Array.isArray(candidate[name]) ? candidate[name].length : 0]));
    return { valid: true, data: candidate, counts, wrapped };
  }

  function monthEndKey(monthKey) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''));
    if (!match) throw new Error('El mes debe tener el formato AAAA-MM.');
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) throw new Error('El mes no es válido.');
    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  }

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
  }

  function fingerprint(value) {
    const input = stableStringify(value);
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < input.length; index++) {
      const code = input.charCodeAt(index);
      first = Math.imul(first ^ code, 0x01000193);
      second = Math.imul(second ^ code, 0x85ebca6b);
    }
    return (first >>> 0).toString(16).padStart(8, '0') + (second >>> 0).toString(16).padStart(8, '0');
  }

  function makeSyncSnapshot(data) {
    const snapshot = {};
    COLLECTIONS.forEach(collection => {
      snapshot[collection] = {};
      (data && Array.isArray(data[collection]) ? data[collection] : []).forEach(item => {
        if (item && item.id != null) snapshot[collection][String(item.id)] = fingerprint(item);
      });
    });
    return { version: 1, records: snapshot };
  }

  function findSyncConflicts(snapshot, local, remote) {
    if (!snapshot || snapshot.version !== 1 || !snapshot.records) return [];
    const conflicts = [];
    COLLECTIONS.forEach(collection => {
      const base = snapshot.records[collection] || {};
      const localRows = new Map((local[collection] || []).filter(Boolean).map(item => [String(item.id), item]));
      const remoteRows = new Map((remote[collection] || []).filter(Boolean).map(item => [String(item.id), item]));
      const ids = new Set(Object.keys(base).concat(Array.from(localRows.keys()), Array.from(remoteRows.keys())));
      ids.forEach(id => {
        const localRow = localRows.has(id) ? localRows.get(id) : null;
        const remoteRow = remoteRows.has(id) ? remoteRows.get(id) : null;
        const localHash = localRow ? fingerprint(localRow) : null;
        const remoteHash = remoteRow ? fingerprint(remoteRow) : null;
        const localChanged = localHash !== (base[id] || null);
        const remoteChanged = remoteHash !== (base[id] || null);
        if (localChanged && remoteChanged && localHash !== remoteHash) {
          conflicts.push({ collection, recordId: id, localVersion: localRow, remoteVersion: remoteRow, localHash, remoteHash });
        }
      });
    });
    return conflicts;
  }

  function findUnbasedConflicts(local, remote) {
    const conflicts = [];
    COLLECTIONS.forEach(collection => {
      const localRows = new Map((local && local[collection] || []).filter(Boolean).map(item => [String(item.id), item]));
      const remoteRows = new Map((remote && remote[collection] || []).filter(Boolean).map(item => [String(item.id), item]));
      localRows.forEach((localVersion, id) => {
        const remoteVersion = remoteRows.get(id);
        if (!remoteVersion) return;
        const localHash = fingerprint(localVersion);
        const remoteHash = fingerprint(remoteVersion);
        if (localHash !== remoteHash) conflicts.push({ collection, recordId: id, localVersion, remoteVersion, localHash, remoteHash });
      });
    });
    return conflicts;
  }

  function numeric(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function financialMetrics(invoices, payments, expenses, monthKey) {
    const invoiceRows = Array.isArray(invoices) ? invoices : [];
    const paymentRows = Array.isArray(payments) ? payments : [];
    const expenseRows = Array.isArray(expenses) ? expenses : [];
    const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
    const summarizeInvoices = rows => rows.reduce((result, row) => {
      const base = Math.max(0, numeric(row.amount));
      const tax = Math.round((base * Math.max(0, numeric(row.taxRate)) / 100 + Number.EPSILON) * 100) / 100;
      result.base += base;
      result.tax += tax;
      result.total += base + tax;
      return result;
    }, { base: 0, tax: 0, total: 0 });
    const monthInvoices = invoiceRows.filter(row => String(row.date || '').slice(0, 7) === monthKey);
    const monthExpenses = expenseRows.filter(row => String(row.date || '').slice(0, 7) === monthKey);
    const all = summarizeInvoices(invoiceRows);
    const month = summarizeInvoices(monthInvoices);
    const costTotal = rows => round(rows.reduce((sum, row) => sum + Math.max(0, numeric(row.amount)), 0));
    return {
      baseInvoiced: round(all.base), taxCharged: round(all.tax), totalInvoiced: round(all.total),
      collected: round(paymentRows.reduce((sum, row) => sum + numeric(row.amount), 0)),
      recordedCosts: costTotal(expenseRows),
      monthBaseInvoiced: round(month.base), monthTaxCharged: round(month.tax), monthTotalInvoiced: round(month.total),
      monthRecordedCosts: costTotal(monthExpenses)
    };
  }

  function normalizeSupplierCost(price, options) {
    const opts = options || {};
    const isNet = !!(opts.explicitNet || opts.rowSaysNet);
    const rowRate = Number(opts.rowTaxRate);
    const fallbackRate = Math.max(0, numeric(opts.fallbackTaxRate));
    const taxRate = isNet ? 0 : Number.isFinite(rowRate) && rowRate >= 0 && rowRate <= 100 ? rowRate : fallbackRate;
    const includesTax = !isNet && !!(opts.explicitGross || opts.rowSaysTaxIncluded || opts.includesTax === true || opts.includesTax === 'gross');
    const amount = Math.max(0, numeric(price));
    const net = includesTax && taxRate > 0 ? amount / (1 + taxRate / 100) : amount;
    return { unitCost: Math.round((net + Number.EPSILON) * 100) / 100, taxRateApplied: includesTax ? taxRate : 0, includesTax };
  }

  return { COLLECTIONS, inspectBackup, monthEndKey, fingerprint, makeSyncSnapshot, findSyncConflicts, findUnbasedConflicts, financialMetrics, normalizeSupplierCost };
});
