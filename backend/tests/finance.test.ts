import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitAmount, billingPeriod, decimal } from '../src/modules/trips/financial-values.ts';
test('exact half-up split preserves all paise including zero and maximum', () => {
    assert.deepEqual(splitAmount('0.01', '50.00'), { driverShareAmount: '0.01', companyShareAmount: '0.00' });
    assert.deepEqual(splitAmount('0.03', '50.00'), { driverShareAmount: '0.02', companyShareAmount: '0.01' });
    assert.deepEqual(splitAmount('0.00', '33.33'), { driverShareAmount: '0.00', companyShareAmount: '0.00' });
    assert.deepEqual(splitAmount('9999999999.99', '99.99'), { driverShareAmount: '9998999999.99', companyShareAmount: '1000000.00' });
    assert.throws(() => decimal(1000000000000n));
});
test('billing months use IST exclusive instants and reject ongoing months', () => {
    const p = billingPeriod('2024-02', new Date('2024-03-01T00:00:00Z'));
    assert.equal(p.from.toISOString(), '2024-01-31T18:30:00.000Z');
    assert.equal(p.to.toISOString(), '2024-02-29T18:30:00.000Z');
    assert.throws(() => billingPeriod('2026-10', new Date('2026-10-22T00:00:00Z')));
    assert.throws(() => billingPeriod('2026-13', new Date()));
});
test('large frozen statement responses retain secret screening without relaxing request/audit limits', async () => {
    const { validateOutcome, canonicalJson } = await import('../src/modules/commands/command-validation.ts');
    const outcome = { outcome: 'succeeded' as const, response: { status: 200, body: { items: Array.from({ length: 500 }, () => ({ tripAmount: '100.01', driverShareAmount: '30.00', companyShareAmount: '70.01', description: 'Synthetic line content' })) } }, audit: [{ entityType: 'statement', entityId: '11111111-1111-4111-8111-111111111111', action: 'statement.generated', after: { status: 'draft' } }] };
    assert.throws(() => validateOutcome(outcome), /storage limit/);
    assert.equal((validateOutcome(outcome, 4 * 1024 * 1024).body as {
        items: unknown[];
    }).items.length, 500);
    assert.throws(() => canonicalJson(outcome.response.body), /storage limit/);
    assert.throws(() => validateOutcome({ ...outcome, response: { status: 200, body: { ...outcome.response.body, closeCode: 'synthetic-secret' } } }, 4 * 1024 * 1024), /Sensitive fields/);
});
