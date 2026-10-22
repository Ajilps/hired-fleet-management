import { Router } from 'express';
import type { PrismaClient } from '../../generated/prisma/client.ts';
import type { AuthConfig } from '../auth/index.ts';
import type { OrderCodeCipher } from '../orders/order-code.ts';
import { identity, bearer, sendCommand } from '../orders/order-controller.ts';
import { parse, idSchema } from '../orders/order-validator.ts';
import { assignSchema, amountSchema, emptySchema, expenseSchema, expensePatchSchema, confirmSchema, closeSchema } from './trip-validator.ts';
import { createLiveTripService } from './trip-service.ts';
import { createFinanceRouter } from './finance-routes.ts';
export function createLiveTripRouter(client: PrismaClient, auth: AuthConfig, key: Uint8Array, cipher?: OrderCodeCipher, origins: string[] = []) {
    const service = createLiveTripService(client, auth, key, cipher, origins);
    const router = Router();
    const principal = (req: Parameters<typeof identity>[0], res: Parameters<typeof identity>[1]) => ({ ...identity(req, res), origin: req.get('Origin'), csrfGuard: req.get('X-CSRF-Guard') });
    router.post('/trips/:tripId/assignments', async (req, res) => { sendCommand(res, await service.assign(principal(req, res), parse(idSchema, req.params.tripId), parse(assignSchema, req.body))); });
    router.patch('/trips/:tripId/amount', async (req, res) => { sendCommand(res, await service.amount(principal(req, res), parse(idSchema, req.params.tripId), parse(amountSchema, req.body))); });
    router.post('/trips/:tripId/start', async (req, res) => { if (req.body !== undefined)
        parse(emptySchema, req.body); sendCommand(res, await service.start(principal(req, res), parse(idSchema, req.params.tripId))); });
    router.get('/trips/:tripId/expenses', async (req, res) => { const value = await service.readExpenses(bearer(req), parse(idSchema, req.params.tripId)); res.setHeader('ETag', value.etag); res.json(value.body); });
    router.post('/trips/:tripId/expenses', async (req, res) => { sendCommand(res, await service.expense(principal(req, res), parse(idSchema, req.params.tripId), 'create', parse(expenseSchema, req.body))); });
    router.patch('/trips/:tripId/expenses/:expenseId', async (req, res) => { sendCommand(res, await service.expense(principal(req, res), parse(idSchema, req.params.tripId), 'update', parse(expensePatchSchema, req.body), parse(idSchema, req.params.expenseId))); });
    router.delete('/trips/:tripId/expenses/:expenseId', async (req, res) => { if (req.body !== undefined)
        parse(emptySchema, req.body); sendCommand(res, await service.expense(principal(req, res), parse(idSchema, req.params.tripId), 'delete', {}, parse(idSchema, req.params.expenseId))); });
    router.post('/trips/:tripId/expense-confirmation', async (req, res) => { sendCommand(res, await service.confirm(principal(req, res), parse(idSchema, req.params.tripId), parse(confirmSchema, req.body))); });
    router.post('/trips/:tripId/close-code/reveal', async (req, res) => { if (req.body !== undefined)
        parse(emptySchema, req.body); res.json(await service.reveal(principal(req, res), parse(idSchema, req.params.tripId))); });
    router.post('/trips/:tripId/close', async (req, res) => { sendCommand(res, await service.close(principal(req, res), parse(idSchema, req.params.tripId), parse(closeSchema, req.body))); });
    router.use(createFinanceRouter(client, auth, key));
    return router;
}
