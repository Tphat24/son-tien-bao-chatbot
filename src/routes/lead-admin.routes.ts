import { Router, type Response } from 'express';
import { z } from 'zod';
import { firstStr } from '../utils/http-params.js';
import {
  listLeads,
  getLead,
  updateLead,
  exportLeadsCsv,
  getLeadStats,
  type ListLeadsParams,
  type LeadStatus
} from '../services/lead-admin.service.js';
import { listSurfaceImagesByLead } from '../services/vision.service.js';
import { requireAuth, requirePermission, type AuthedRequest } from '../utils/auth-middleware.js';
import { writeAuditLog } from '../services/audit.service.js';

/**
 * Route quản lý khách hàng tiềm năng (lead) cho trang quản trị.
 *
 *   GET  /api/admin/leads              — danh sách (lọc, sắp xếp, phân trang)
 *   GET  /api/admin/leads/export       — xuất CSV
 *   GET  /api/admin/leads/:id          — chi tiết một lead
 *   PATCH /api/admin/leads/:id         — cập nhật (trạng thái, phân công, ghi chú, nhãn...)
 *
 * RBAC: cần quyền 'leads:read' để xem, 'leads:write' để sửa.
 */

export const leadAdminRouter = Router();

leadAdminRouter.use(requireAuth);

const LEAD_STATUSES = [
  'new',
  'uncontacted',
  'contacted',
  'consulting',
  'quoted',
  'negotiating',
  'won',
  'lost',
  'follow_up'
] as const;

function parseListParams(query: Record<string, unknown>): ListLeadsParams {
  const asString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;

  const page = Number(query.page);
  const pageSize = Number(query.pageSize);

  return {
    search: asString(query.search),
    status: asString(query.status) as LeadStatus | undefined,
    priority: asString(query.priority),
    assignedTo: asString(query.assignedTo),
    source: asString(query.source),
    sortBy: asString(query.sortBy) === 'updated_at' ? 'updated_at' : 'created_at',
    sortDir: asString(query.sortDir) === 'asc' ? 'asc' : 'desc',
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 200) : 25
  };
}

/* ------------------------------------------------------------------ */
/* Danh sách lead                                                       */
/* ------------------------------------------------------------------ */
leadAdminRouter.get(
  '/',
  requirePermission('leads:read'),
  async (req: AuthedRequest, res: Response) => {
    try {
      const result = await listLeads(parseListParams(req.query as Record<string, unknown>));
      res.json(result);
    } catch (error) {
      console.error('list_leads_failed', error);
      res.status(500).json({ error: 'list_leads_failed' });
    }
  }
);

/* ------------------------------------------------------------------ */
/* Xuất CSV                                                             */
/* ------------------------------------------------------------------ */
leadAdminRouter.get(
  '/export',
  requirePermission('leads:read'),
  async (req: AuthedRequest, res: Response) => {
    try {
      const csv = await exportLeadsCsv(parseListParams(req.query as Record<string, unknown>));
      // BOM để Excel mở đúng tiếng Việt UTF-8.
      const payload = `﻿${csv}`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="leads-${Date.now()}.csv"`);
      res.send(payload);
    } catch (error) {
      console.error('export_leads_failed', error);
      res.status(500).json({ error: 'export_leads_failed' });
    }
  }
);

/* ------------------------------------------------------------------ */
/* Thống kê dashboard                                                   */
/* ------------------------------------------------------------------ */
leadAdminRouter.get(
  '/stats',
  requirePermission('leads:read'),
  async (_req: AuthedRequest, res: Response) => {
    try {
      const stats = await getLeadStats();
      res.json(stats);
    } catch (error) {
      console.error('lead_stats_failed', error);
      res.status(500).json({ error: 'lead_stats_failed' });
    }
  }
);

/* ------------------------------------------------------------------ */
/* Chi tiết lead                                                        */
/* ------------------------------------------------------------------ */
leadAdminRouter.get(
  '/:id',
  requirePermission('leads:read'),
  async (req: AuthedRequest, res: Response) => {
    const lead = await getLead(firstStr(req.params.id));
    if (!lead) {
      res.status(404).json({ error: 'lead_not_found' });
      return;
    }
    res.json(lead);
  }
);

/* ------------------------------------------------------------------ */
/* Ảnh hiện trạng bề mặt khách gửi (mục 7) — nhân viên xem lại          */
/* ------------------------------------------------------------------ */
leadAdminRouter.get(
  '/:id/images',
  requirePermission('leads:read'),
  async (req: AuthedRequest, res: Response) => {
    try {
      const images = await listSurfaceImagesByLead(firstStr(req.params.id));
      res.json({ images });
    } catch (error) {
      console.error('list_surface_images_failed', error);
      res.status(500).json({ error: 'list_surface_images_failed' });
    }
  }
);

/* ------------------------------------------------------------------ */
/* Cập nhật lead                                                        */
/* ------------------------------------------------------------------ */
const updateSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  note: z.string().max(4000).nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  potential: z.enum(['cold', 'warm', 'hot']).nullable().optional(),
  productInterest: z.string().max(400).nullable().optional(),
  areaM2: z.number().positive().nullable().optional(),
  buyTime: z.string().max(120).nullable().optional()
});

leadAdminRouter.patch(
  '/:id',
  requirePermission('leads:write'),
  async (req: AuthedRequest, res: Response) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      return;
    }

    try {
      const updated = await updateLead(firstStr(req.params.id), parsed.data);
      if (!updated) {
        res.status(404).json({ error: 'lead_not_found' });
        return;
      }

      await writeAuditLog({
        actorId: req.staff?.sub,
        actorEmail: req.staff?.email,
        action: 'lead.update',
        entity: 'leads',
        entityId: firstStr(req.params.id),
        metadata: parsed.data,
        ip: (req.header('x-forwarded-for')?.split(',')[0] ?? req.ip ?? '').trim()
      });

      res.json(updated);
    } catch (error) {
      console.error('update_lead_failed', error);
      res.status(500).json({ error: 'update_lead_failed' });
    }
  }
);
