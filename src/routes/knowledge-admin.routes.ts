import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requirePermission, type AuthedRequest } from '../utils/auth-middleware.js';
import { firstStr } from '../utils/http-params.js';
import { writeAuditLog } from '../services/audit.service.js';
import {
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  getKnowledgeDocument,
  getKnowledgeOperationsSummary,
  listKnowledgeDocuments,
  startKnowledgeReindex,
  updateKnowledgeDocument
} from '../services/knowledge-admin.service.js';

export const knowledgeAdminRouter = Router();
knowledgeAdminRouter.use(requireAuth);

const approval = z.enum(['pending', 'approved', 'rejected']);
const inputSchema = z.object({
  title: z.string().trim().min(2).max(300),
  content: z.string().trim().min(20).max(100_000),
  sourceUrl: z.string().url().max(1000).optional().or(z.literal('')),
  pageType: z.string().trim().min(1).max(80).optional(),
  approvalStatus: approval.optional()
});

knowledgeAdminRouter.get('/operations', requirePermission('knowledge.read'), async (_req, res) => {
  try { res.json(await getKnowledgeOperationsSummary()); }
  catch (error) { res.status(500).json({ error: 'operations_failed', message: String(error) }); }
});

knowledgeAdminRouter.post('/reindex', requirePermission('knowledge.reindex'), async (req: AuthedRequest, res: Response) => {
  const job = await startKnowledgeReindex();
  await writeAuditLog({ actorId: req.staff?.sub, actorEmail: req.staff?.email, action: 'knowledge.reindex', entity: 'knowledge', entityId: job.id });
  res.status(job.alreadyRunning ? 200 : 202).json(job);
});

knowledgeAdminRouter.get('/', requirePermission('knowledge.read'), async (req, res) => {
  const parsed = z.object({
    q: z.string().trim().max(200).optional(), approval: approval.optional(),
    page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25)
  }).safeParse(req.query);
  if (!parsed.success) return void res.status(400).json({ error: 'invalid_query' });
  res.json(await listKnowledgeDocuments({ search: parsed.data.q, approval: parsed.data.approval, page: parsed.data.page, pageSize: parsed.data.pageSize }));
});

knowledgeAdminRouter.get('/:id', requirePermission('knowledge.read'), async (req, res) => {
  const item = await getKnowledgeDocument(firstStr(req.params.id));
  if (!item) return void res.status(404).json({ error: 'not_found' });
  res.json(item);
});

knowledgeAdminRouter.post('/', requirePermission('knowledge.write'), async (req: AuthedRequest, res: Response) => {
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
  const item = await createKnowledgeDocument(parsed.data);
  await writeAuditLog({ actorId: req.staff?.sub, actorEmail: req.staff?.email, action: 'knowledge.create', entity: 'knowledge_documents', entityId: item.id });
  res.status(201).json(item);
});

knowledgeAdminRouter.patch('/:id', requirePermission('knowledge.write'), async (req: AuthedRequest, res: Response) => {
  const parsed = inputSchema.partial().safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
  const id = firstStr(req.params.id);
  const item = await updateKnowledgeDocument(id, parsed.data);
  await writeAuditLog({ actorId: req.staff?.sub, actorEmail: req.staff?.email, action: 'knowledge.update', entity: 'knowledge_documents', entityId: id });
  res.json(item);
});

knowledgeAdminRouter.delete('/:id', requirePermission('knowledge.write'), async (req: AuthedRequest, res: Response) => {
  const id = firstStr(req.params.id);
  await deleteKnowledgeDocument(id);
  await writeAuditLog({ actorId: req.staff?.sub, actorEmail: req.staff?.email, action: 'knowledge.delete', entity: 'knowledge_documents', entityId: id });
  res.json({ ok: true });
});
