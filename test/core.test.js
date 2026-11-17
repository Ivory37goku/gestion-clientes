'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core.js');

function emptyBackup() {
  return {
    version: 1,
    company: {},
    leads: [], clients: [], works: [], tasks: [], quotes: [], invoices: [],
    payments: [], expenses: [], events: [], documents: [], team: []
  };
}

test('backup restore rejects empty objects and malformed records', () => {
  assert.equal(Core.inspectBackup({}).valid, false);
  assert.equal(Core.inspectBackup({ app: 'Other', data: emptyBackup() }).valid, false);
  const malformed = emptyBackup();
  malformed.clients.push({ name: 'Sin id' });
  assert.equal(Core.inspectBackup({ app: 'Gestión Clientes', data: malformed }).valid, false);
});

test('backup inspector accepts current export envelope and counts every collection', () => {
  const backup = emptyBackup();
  backup.leads.push({ id: 'L-1', name: 'Lead' });
  const inspected = Core.inspectBackup({ app: 'Gestión Clientes', exportedAt: '2026-11-17', data: backup });
  assert.equal(inspected.valid, true);
  assert.equal(inspected.counts.leads, 1);
  assert.equal(inspected.counts.quotes, 0);
});

test('agenda month end is calendar correct across daylight-saving months', () => {
  assert.equal(Core.monthEndKey('2024-03'), '2024-03-31');
  assert.equal(Core.monthEndKey('2024-10'), '2024-10-31');
  assert.equal(Core.monthEndKey('2026-02'), '2026-02-28');
  assert.throws(() => Core.monthEndKey('2026-13'));
});

test('sync conflict detector keeps both changed versions when both differ from baseline', () => {
  const base = { version: 1, company: {}, leads: [{ id: 'L1', name: 'Antes', updatedAt: 'a' }] };
  const snapshot = Core.makeSyncSnapshot(base);
  const local = { leads: [{ id: 'L1', name: 'Local', updatedAt: 'b' }] };
  const remote = { leads: [{ id: 'L1', name: 'Nube', updatedAt: 'c' }] };
  const conflicts = Core.findSyncConflicts(snapshot, local, remote);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].localVersion.name, 'Local');
  assert.equal(conflicts[0].remoteVersion.name, 'Nube');
});

test('sync conflict detector ignores a single-device edit', () => {
  const snapshot = Core.makeSyncSnapshot({ leads: [{ id: 'L1', name: 'Antes' }] });
  const local = { leads: [{ id: 'L1', name: 'Local' }] };
  const remote = { leads: [{ id: 'L1', name: 'Antes' }] };
  assert.equal(Core.findSyncConflicts(snapshot, local, remote).length, 0);
});

test('first cloud link up preserves divergent records even without a saved baseline', () => {
  const conflicts = Core.findUnbasedConflicts(
    { leads: [{ id: 'L1', name: 'Este equipo' }, { id: 'L2', name: 'Solo local' }] },
    { leads: [{ id: 'L1', name: 'Nube' }, { id: 'L3', name: 'Solo nube' }] }
  );
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].localVersion.name, 'Este equipo');
  assert.equal(conflicts[0].remoteVersion.name, 'Nube');
});

test('financial totals separate net base, IGIC, cash received and recorded costs', () => {
  const metrics = Core.financialMetrics(
    [{ amount: 1000, taxRate: 7, date: '2026-11-01' }],
    [{ amount: 500 }],
    [{ amount: 100, date: '2026-11-04' }, { amount: 40, date: '2026-10-31' }],
    '2026-11'
  );
  assert.equal(metrics.baseInvoiced, 1000);
  assert.equal(metrics.taxCharged, 70);
  assert.equal(metrics.totalInvoiced, 1070);
  assert.equal(metrics.collected, 500);
  assert.equal(metrics.recordedCosts, 140);
  assert.equal(metrics.monthRecordedCosts, 100);
});

test('supplier tax mode uses each row rate and explicit net headers prevent double subtraction', () => {
  assert.deepEqual(Core.normalizeSupplierCost(107, { includesTax: 'gross', rowTaxRate: 7, fallbackTaxRate: 21 }), {
    unitCost: 100, taxRateApplied: 7, includesTax: true
  });
  assert.deepEqual(Core.normalizeSupplierCost(121, { includesTax: 'gross', rowTaxRate: 21, fallbackTaxRate: 7 }), {
    unitCost: 100, taxRateApplied: 21, includesTax: true
  });
  assert.deepEqual(Core.normalizeSupplierCost(107, { includesTax: 'gross', explicitNet: true, rowTaxRate: 7, fallbackTaxRate: 7 }), {
    unitCost: 107, taxRateApplied: 0, includesTax: false
  });
  assert.deepEqual(Core.normalizeSupplierCost(100, { includesTax: 'gross', rowTaxRate: 0, fallbackTaxRate: 7 }), {
    unitCost: 100, taxRateApplied: 0, includesTax: true
  });
});
