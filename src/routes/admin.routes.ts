import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/supabase.js';
import { env } from '../config/env.js';
import { createLead } from '../services/lead.service.js';

export const adminRouter = Router();
adminRouter.use((req, res, next) => {
  const token = req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (token !== env.ADMIN_API_KEY) return res.status(401).json({ error: 'unauthorized' });
  next();
});

adminRouter.get('/dashboard', async (_req, res) => {
  const [leads, requests, products, failed] = await Promise.all([
    db.from('leads').select('*', { count: 'exact', head: true }),
    db.from('dynamic_api_logs').select('*', { count: 'exact', head: true }),
    db.from('products').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('approval_status', 'approved'),
    db.from('dynamic_api_logs').select('*', { count: 'exact', head: true }).neq('status', 'success')
  ]);
  res.json({ leads: leads.count ?? 0, dynamicRequests: requests.count ?? 0, activeProducts: products.count ?? 0, fallbacks: failed.count ?? 0 });
});

adminRouter.get('/leads', async (_req, res) => {
  const { data, error } = await db.from('leads').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

adminRouter.get('/logs', async (_req, res) => {
  const { data, error } = await db.from('dynamic_api_logs').select('id,action,status,duration_ms,error_message,created_at').order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

adminRouter.post('/test-lead', async (req, res) => {
  const parsed = z.object({ need: z.string().default('Kiểm thử hệ thống'), phone: z.string().optional(), name: z.string().optional() }).parse(req.body ?? {});
  const lead = await createLead(parsed);
  res.json({ ok: true, lead });
});
