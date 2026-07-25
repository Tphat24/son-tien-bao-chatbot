import { Router, type Response } from 'express';
import { z } from 'zod';
import { firstStr } from '../utils/http-params.js';
import {
  createQuotation,
  getQuotation,
  listQuotations,
  updateQuotationStatus,
  renderQuotationHtml,
  type QuotationStatus
} from '../services/quotation.service.js';
import { requireAuth, requirePermission, type AuthedRequest } from '../utils/auth-middleware.js';
import { writeAuditLog } from '../services/audit.service.js';

/**
 * Route quản lý báo giá chính thức.
 *
 *   GET  /api/quotations              — danh sách (lọc theo trạng thái, phân trang)
 *   POST /api/quotations              — tạo báo giá mới
 *   GET  /api/quotations/:id          — chi tiết báo giá (kèm items)
 *   POST /api/quotations/:id/status   — đổi trạng thái (sent/accepted/rejected...)
 *   GET  /api/quotations/:id/print    — HTML báo giá khổ A4 để in/lưu PDF
 *
 * RBAC:
 *   - Xem: quotation.view (sales, manager, super_admin, viewer)
 *   - Tạo/sửa: quotation.manage (sales, manager, super_admin)
 *
 * Lưu ý chi phí: không dùng thư viện PDF nặng. Backend trả HTML chuẩn in
 * (CSS @media print, khổ A4); admin bấm "In" trong trình duyệt để lưu PDF.
 */

export const quotationRouter = Router();

const QUOTATION_STATUSES: QuotationStatus[] = ['draft', 'sent', 'accepted', 'rejected', 'expired'];

const itemSchema = z.object({
  productId: z.string().uuid().optional(),
  productName: z.string().min(1).max(300),
  packageText: z.string().max(200).optional(),
  unitPrice: z.number().min(0).max(1_000_000_000),
  quantity: z.number().min(0.01).max(100_000)
});

const createSchema = z.object({
  leadId: z.string().uuid().optional(),
  customerName: z.string().max(200).optional(),
  customerPhone: z.string().max(30).optional(),
  customerArea: z.string().max(300).optional(),
  projectType: z.string().max(200).optional(),
  areaM2: z.number().min(0).max(1_000_000).optional(),
  needConstruction: z.boolean().optional(),
  note: z.string().max(2000).optional(),
  discount: z.number().min(0).max(1_000_000_000).optional(),
  shippingFee: z.number().min(0).max(1_000_000_000).optional(),
  validDays: z.number().int().min(1).max(365).optional(),
  items: z.array(itemSchema).min(1).max(50)
});

/* ------------------------------------------------------------------ */
/* Danh sách báo giá                                                   */
/* ------------------------------------------------------------------ */
quotationRouter.get(
  '/',
  requireAuth,
  requirePermission('quotation.view'),
  async (req: AuthedRequest, res: Response) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

    const validStatus =
      status && QUOTATION_STATUSES.includes(status as QuotationStatus)
        ? (status as QuotationStatus)
        : undefined;

    const result = await listQuotations({ status: validStatus, page, pageSize });
    res.json(result);
  }
);

/* ------------------------------------------------------------------ */
/* Tạo báo giá                                                         */
/* ------------------------------------------------------------------ */
quotationRouter.post(
  '/',
  requireAuth,
  requirePermission('quotation.manage'),
  async (req: AuthedRequest, res: Response) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
      return;
    }

    const quotation = await createQuotation(parsed.data, req.staff?.sub);

    await writeAuditLog({
      actorId: req.staff?.sub,
      actorEmail: req.staff?.email,
      action: 'quotation.create',
      entity: 'quotations',
      entityId: quotation.id,
      metadata: { code: quotation.code, total: quotation.total }
    });

    res.status(201).json(quotation);
  }
);

/* ------------------------------------------------------------------ */
/* Chi tiết báo giá                                                    */
/* ------------------------------------------------------------------ */
quotationRouter.get(
  '/:id',
  requireAuth,
  requirePermission('quotation.view'),
  async (req: AuthedRequest, res: Response) => {
    const result = await getQuotation(firstStr(req.params.id));
    if (!result) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(result);
  }
);

/* ------------------------------------------------------------------ */
/* Đổi trạng thái                                                      */
/* ------------------------------------------------------------------ */
quotationRouter.post(
  '/:id/status',
  requireAuth,
  requirePermission('quotation.manage'),
  async (req: AuthedRequest, res: Response) => {
    const parsed = z
      .object({ status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired']) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_status' });
      return;
    }

    await updateQuotationStatus(firstStr(req.params.id), parsed.data.status);

    await writeAuditLog({
      actorId: req.staff?.sub,
      actorEmail: req.staff?.email,
      action: 'quotation.status',
      entity: 'quotations',
      entityId: firstStr(req.params.id),
      metadata: { status: parsed.data.status }
    });

    res.json({ ok: true });
  }
);

/* ------------------------------------------------------------------ */
/* HTML in báo giá (A4) — admin lưu PDF từ trình duyệt                 */
/* ------------------------------------------------------------------ */
quotationRouter.get(
  '/:id/print',
  requireAuth,
  requirePermission('quotation.view'),
  async (req: AuthedRequest, res: Response) => {
    const html = await renderQuotationHtml(firstStr(req.params.id));
    if (!html) {
      res.status(404).send('Không tìm thấy báo giá');
      return;
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.send(html);
  }
);
