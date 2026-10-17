'use strict';

// Contract regression checks, not backend/application tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const spec = YAML.parse(fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8'), { uniqueKeys: true });
const snapshotSource = JSON.parse(fs.readFileSync(path.join(__dirname, '../database/trip-report-snapshot.schema.json'), 'utf8'));
const schemas = spec.components.schemas;
const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
const operations = Object.entries(spec.paths).flatMap(([url, item]) => Object.entries(item)
  .filter(([method]) => methods.has(method))
  .map(([method, operation]) => ({ url, method, operation })));

// Ensure the embedded Swagger snapshot stays identical to the canonical source,
// with only its local reference locations relocated into components/schemas.
function relocateReferences(value) {
  if (Array.isArray(value)) return value.map(relocateReferences);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      if (key === '$ref' && child.startsWith('#/$defs/')) {
        const name = child.slice('#/$defs/'.length);
        return [key, `#/components/schemas/TripReport${name[0].toUpperCase()}${name.slice(1)}`];
      }
      return [key, relocateReferences(child)];
    }));
  }
  return value;
}
const snapshotRoot = Object.fromEntries(Object.entries(snapshotSource)
  .filter(([key]) => !['$schema', '$id', '$defs'].includes(key)));
assert.deepEqual(schemas.TripReportSnapshot, relocateReferences(snapshotRoot), 'Snapshot root drift');
for (const [name, schema] of Object.entries(snapshotSource.$defs)) {
  const componentName = `TripReport${name[0].toUpperCase()}${name.slice(1)}`;
  assert.deepEqual(schemas[componentName], relocateReferences(schema), `Snapshot drift: ${name}`);
}

const catalog = fs.readFileSync(path.join(__dirname, 'endpoint-reference.md'), 'utf8');
const operationIds = new Set();
for (const { url, method, operation } of operations) {
  assert.match(url, /^\/api\/v1\//);
  assert(!operationIds.has(operation.operationId), 'Duplicate operationId');
  operationIds.add(operation.operationId);
  assert.match(operation.operationId, /^[a-z][A-Za-z0-9]*$/);
  assert(operation['x-roles'].every((role) => ['admin', 'partner', 'driver', 'public'].includes(role)));
  assert(['P0', 'P1', 'P2'].includes(operation['x-priority']));
  assert(catalog.includes(`\`${operation.operationId}\``), 'Endpoint catalog drift');
  if (operation['x-roles'].includes('public')) assert.deepEqual(operation.security, []);
  else assert.deepEqual(operation.security || spec.security, [{ bearerAuth: [] }]);
  for (const segment of url.split('/').filter(Boolean)) {
    if (segment.startsWith('{')) assert.match(segment, /^\{[a-z][A-Za-z0-9]*\}$/);
    else assert.match(segment, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
  }
}
assert.equal((catalog.match(/^\| (GET|POST|PUT|PATCH|DELETE) \|/gm) || []).length, operations.length);
assert.deepEqual(spec.paths['/api/v1/trips/{tripId}/close-code/reveal'].post['x-roles'], ['partner']);
assert.deepEqual(spec.paths['/api/v1/trips/{tripId}/close'].post['x-roles'], ['driver']);
assert.equal(operations.filter(({ url }) => url.startsWith('/api/v1/reports/')).length, 7);
assert.equal(schemas.DocumentType.enum[1], 'aadhar', 'Preserve stored compatibility spelling');
assert(!JSON.stringify(schemas.Trip.properties).match(/otp|encrypted|password|storageKey/i));
assert(!JSON.stringify(schemas.TripReportSnapshot).match(/password|otp|storageKey/i));
for (const command of ['accept', 'reject']) {
  const parameters = spec.paths[`/api/v1/orders/{orderId}/${command}`].post.parameters;
  assert(parameters.some((p) => p.$ref === '#/components/parameters/IdempotencyKey'));
  assert(parameters.some((p) => p.$ref === '#/components/parameters/IfMatch'));
}
assert.equal(schemas.PositiveMoney.allOf[1].not.const, '0.00');
assert.equal(schemas.ExpenseInput.properties.category.default, 'other');
assert(!schemas.ExpenseInput.required.includes('category'));
assert(!schemas.ExpenseInput.required.includes('receiptAssetId'));
assert.equal(schemas.Statement.properties.approvals.maxItems, 2);

// The initial estimator is a local heuristic, not a maps-provider response.
assert(schemas.Estimate.properties.source.enum.includes('distance_heuristic'));
assert.deepEqual(schemas.HeuristicEstimateBasis, snapshotSource.$defs.heuristicBasis);
assert(schemas.CreateOrderRequest.properties.routeDistanceKm);
for (const field of ['averageSpeedKmh', 'policyVersion', 'durationMinutes', 'estimate']) {
  assert(!Object.hasOwn(schemas.CreateOrderRequest.properties, field), `Client must not set ${field}`);
}
for (const invalid of ['0.00', '-1.00', '20', '1e2', ' 20.00', '100000000.00']) {
  assert(!new RegExp(schemas.RouteDistanceKm.pattern).test(invalid), `Invalid distance accepted: ${invalid}`);
}
assert(new RegExp(schemas.RouteDistanceKm.pattern).test('20.00'));

// Reconcile the published examples across relational IDs and exact money. JSON
// Schema validation alone cannot enforce these domain invariants.
const exampleOf = (url, method) => spec.paths[url][method].responses['200'].content['application/json'].example;
const report = exampleOf('/api/v1/trip-reports/{reportId}', 'get');
const closure = exampleOf('/api/v1/trips/{tripId}/close', 'post');
function minorUnits(value) {
  assert.match(value, /^(?:0|[1-9][0-9]*)\.[0-9]{2}$/);
  return BigInt(value.replace('.', ''));
}
function checkHeuristicExample(estimate) {
  assert.equal(estimate.source, 'distance_heuristic');
  const distanceHundredths = minorUnits(estimate.heuristic.distanceKm);
  const speedHundredths = minorUnits(estimate.heuristic.averageSpeedKmh);
  assert(distanceHundredths > 0n && speedHundredths > 0n);
  assert.match(estimate.heuristic.policyVersion, /\S/);
  const roundedMinutes = (distanceHundredths * 60n + speedHundredths - 1n) / speedHundredths;
  assert.equal(BigInt(estimate.durationMinutes), roundedMinutes, 'Heuristic example arithmetic drift');
}
for (const estimate of [...schemas.Estimate.examples, report.trip.estimate, closure.trip.estimate]) {
  checkHeuristicExample(estimate);
}
assert.deepEqual(closure.trip.estimate.heuristic, report.trip.estimate.heuristic, 'Frozen heuristic evidence drift');
const payroll = report.payroll;
const amount = minorUnits(payroll.tripAmount);
const driverPercent = minorUnits(payroll.appliedDriverPercent);
const companyPercent = minorUnits(payroll.appliedCompanyPercent);
assert.equal(driverPercent + companyPercent, 10000n);
const roundedDriverShare = (amount * driverPercent + 5000n) / 10000n;
assert.equal(minorUnits(payroll.driverShareAmount), roundedDriverShare);
assert.equal(minorUnits(payroll.companyShareAmount), amount - roundedDriverShare);
assert.equal(minorUnits(payroll.totalAmount), amount);
assert.equal(minorUnits(report.walletCredit.amount), roundedDriverShare);
assert.equal(report.expenses.reduce((sum, expense) => sum + minorUnits(expense.amount), 0n), minorUnits(report.totalExpenseAmount));
assert(report.expenses.every((expense) => minorUnits(expense.amount) > 0n));
assert.equal(report.trip.driver.id, report.trip.expensesConfirmedByDriverId);
assert(Date.parse(report.trip.startedAt) <= Date.parse(report.trip.expensesConfirmedAt));
assert(Date.parse(report.trip.expensesConfirmedAt) <= Date.parse(report.trip.closedAt));
assert.equal((Date.parse(report.trip.closedAt) - Date.parse(report.trip.startedAt)) / 1000, report.trip.actualDurationSeconds);
assert.equal(closure.reportId, report.reportId);
assert.equal(closure.trip.id, report.trip.id);
assert.equal(closure.payroll.id, payroll.id);
assert.equal(closure.payroll.tripId, report.trip.id);
assert.equal(closure.payroll.driverId, report.trip.driver.id);
assert.equal(closure.payroll.companyId, report.trip.companyId);
assert.equal(closure.walletCredit.payrollRecordId, payroll.id);
assert.equal(closure.walletCredit.id, report.walletCredit.id);
assert.equal(closure.walletCredit.amount, report.walletCredit.amount);
assert.equal(closure.trip.closedAt, report.trip.closedAt);
assert.equal(closure.trip.currentDriver.id, closure.trip.currentDriverId);
console.log(`Contract checks passed: ${operations.length} operations; canonical snapshot parity; scoped commands; exact financial and heuristic examples.`);

// Provisioning credentials stay write-only; first-login restriction has an explicit lifecycle contract.
assert(schemas.User.required.includes('passwordChangeRequired'));
assert.equal(schemas.CreatePartnerRequest.properties.initialPassword.minLength, 15);
assert.equal(schemas.CreatePartnerRequest.properties.initialPassword.maxLength, 128);
assert.equal(schemas.CreatePartnerRequest.properties.initialPassword.writeOnly, true);
assert.deepEqual(schemas.ChangePasswordRequest.required, ['currentPassword', 'newPassword']);
assert.equal(schemas.ChangePasswordRequest.additionalProperties, false);
for (const field of ['currentPassword', 'newPassword']) assert.equal(schemas.ChangePasswordRequest.properties[field].writeOnly, true);
assert(spec.paths['/api/v1/users/me/password'].post.responses['204']);
assert(!spec.paths['/api/v1/users/me/password'].post.parameters?.some((p) => p.$ref === '#/components/parameters/IdempotencyKey'));
