import { db } from '../db/supabase.js';

/**
 * Ghi audit log cho các hành động quản trị quan trọng (yêu cầu mục 16).
 *
 * Không ghi mật khẩu, token hay dữ liệu nhạy cảm vào metadata.
 * Hàm này không được ném lỗi ra ngoài để tránh làm hỏng luồng chính.
 */
export async function writeAuditLog(input: {
  actorId?: string;
  actorEmail?: string;
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}): Promise<void> {
  try {
    await db.from('audit_logs').insert({
      actor_id: input.actorId ?? null,
      actor_email: input.actorEmail ?? null,
      action: input.action,
      entity: input.entity ?? null,
      entity_id: input.entityId ?? null,
      metadata: input.metadata ?? null,
      ip: input.ip ?? null
    });
  } catch (error) {
    console.error('audit_log_failed', error);
  }
}
