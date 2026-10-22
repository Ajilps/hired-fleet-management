import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.ts';
import type { AuthConfig } from '../auth/index.ts';
import { bearer, identity, sendCommand } from '../orders/order-controller.ts';
import { parse, idSchema, pageSchema } from '../orders/order-validator.ts';
import { createStatementService } from './statement-service.ts';
const month = z.string().regex(/^[2-9][0-9]{3}-(0[1-9]|1[0-2])$/);
const listSchema = pageSchema.extend({ companyId: idSchema.optional(), status: z.enum(['draft', 'pending_verification', 'verified', 'published']).optional(), billingMonth: month.optional() });
const generateSchema = z.strictObject({ companyId: idSchema, billingMonth: month });
const versionSchema = z.strictObject({ contentVersion: z.number().int().positive().max(2147483647) });
export function createStatementRouter(client: PrismaClient, auth: AuthConfig, key: Uint8Array) {
    const router = Router();
    const service = createStatementService(client, auth, key);
    router.get('/statements', async (req, res) => { res.json(await service.list(bearer(req), parse(listSchema, req.query))); });
    router.get('/statements/:statementId', async (req, res) => { res.json(await service.get(bearer(req), parse(idSchema, req.params.statementId))); });
    router.post('/statements', async (req, res) => { sendCommand(res, await service.generate(identity(req, res), parse(generateSchema, req.body))); });
    for (const action of ['regenerate', 'submit', 'approvals', 'publish'] as const)
        router.post(`/statements/:statementId/${action}`, async (req, res) => { sendCommand(res, await service.command(identity(req, res), parse(idSchema, req.params.statementId), action, parse(versionSchema, req.body))); });
    return router;
}
