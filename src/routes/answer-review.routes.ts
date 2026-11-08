import { Router } from 'express';
import { z } from 'zod';
import { firstStr } from '../utils/http-params.js';
import { requireAuth, requirePermission, type AuthedRequest } from '../utils/auth-middleware.js';
import { listAnswerReviews, updateAnswerReview, publishAnswerReview } from '../services/answer-review.service.js';
import { startKnowledgeReindex } from '../services/knowledge-admin.service.js';
import { writeAuditLog } from '../services/audit.service.js';

export const answerReviewRouter = Router();
answerReviewRouter.use(requireAuth);
answerReviewRouter.get('/', requirePermission('knowledge.read'), async (req, res) => {
  const input = z.object({ status: z.enum(['open', 'draft', 'resolved', 'dismissed']).optional(), page: z.coerce.number().int().min(1).default(1) }).safeParse(req.query);
  if (!input.success) { res.status(400).json({ error: 'invalid_query' }); return; }
  try { res.json(await listAnswerReviews(input.data)); }
  catch { res.status(503).json({ error: 'review_storage_unavailable', message: 'Chưa đọc được hàng chờ. Kiểm tra migration 05 và kết nối dữ liệu.' }); }
});
answerReviewRouter.patch('/:id', requirePermission('knowledge.write'), async (req: AuthedRequest, res) => {
  const id = z.string().uuid().safeParse(firstStr(req.params.id));
  const input = z.object({ status: z.enum(['open', 'draft', 'dismissed']).optional(), faqQuestion: z.string().trim().min(10).max(1200).optional(), correctedAnswer: z.string().trim().min(20).max(12000).optional() }).refine((value) => Object.keys(value).length > 0).safeParse(req.body);
  if (!id.success || !input.success) { res.status(400).json({ error: 'invalid_review' }); return; }
  if (!await updateAnswerReview(id.data, input.data)) { res.status(409).json({ error: 'review_missing_or_resolved' }); return; }
  await writeAuditLog({ actorId: req.staff?.sub, action: 'answer_review.update', entity: 'chat_answer_reviews', entityId: id.data });
  res.json({ ok: true });
});
answerReviewRouter.post('/:id/publish', requirePermission('knowledge.write'), async (req: AuthedRequest, res) => {
  const id = z.string().uuid().safeParse(firstStr(req.params.id));
  if (!id.success || !z.object({ confirmed: z.literal(true) }).safeParse(req.body).success) { res.status(400).json({ error: 'explicit_review_confirmation_required' }); return; }
  try {
    const documentId = await publishAnswerReview(id.data, req.staff!.sub);
    await writeAuditLog({ actorId: req.staff?.sub, action: 'answer_review.publish', entity: 'knowledge_documents', entityId: documentId });
    let reindexStarted = false;
    try { await startKnowledgeReindex(); reindexStarted = true; } catch { /* Keep the approved FAQ; expose the need to reindex manually. */ }
    res.json({ ok: true, documentId, reindexStarted });
  } catch { res.status(409).json({ error: 'review_not_publishable', message: 'Cần lưu câu hỏi và đáp án đã kiểm tra trước khi duyệt.' }); }
});
