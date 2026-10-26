import { HttpError } from '../../shared/http/http-error.ts';
export const minor = (value: string) => BigInt(value.replace('.', ''));
export function decimal(value: bigint, max = 999999999999n) { if (value < 0n || value > max)
    throw new HttpError(409, 'AMOUNT_LIMIT_EXCEEDED', 'The exact amount exceeds the supported range.'); return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`; }
export function splitAmount(amount: string, driverPercent: string) { const total = minor(amount); const driver = (total * minor(driverPercent) + 5000n) / 10000n; return { driverShareAmount: decimal(driver), companyShareAmount: decimal(total - driver) }; }
export function billingPeriod(month: string, now: Date) {
    if (!/^[2-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(month))
        throw new HttpError(422, 'VALIDATION_FAILED', 'Choose a valid billing month.');
    const [year, n] = month.split('-').map(Number) as [
        number,
        number
    ];
    const start = new Date(Date.UTC(year, n - 1, 1));
    const end = new Date(Date.UTC(year, n, 1));
    const from = new Date(start.getTime() - 19800000);
    const to = new Date(end.getTime() - 19800000);
    if (to > now)
        throw new HttpError(409, 'UNFINISHED_BILLING_MONTH', 'Only completed calendar months may be generated.');
    return { start, end, from, to };
}
