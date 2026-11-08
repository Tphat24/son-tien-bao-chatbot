import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(process.env.QA_PACKAGE_ROOT ? resolve(process.env.QA_PACKAGE_ROOT, 'package.json') : import.meta.url);
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
const id = '00000000-0000-4000-8000-000000000001';
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table leads(id uuid primary key);
    create table knowledge_documents(id uuid primary key, tenant_id text, title text, content text, content_hash text, approval_status text, page_type text);
    create function touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now();return new;end $$;`);
  const sql = await readFile(new URL('../supabase/05_SALES_ASSISTANCE.sql', import.meta.url), 'utf8');
  await db.exec(sql); await db.exec(sql);
  await db.query(`insert into chat_answer_reviews(id,tenant_id,session_id,question,answer,needs_review,reason) values($1,'default','session','Cách chọn sơn nội thất?','Chưa đủ thông tin',true,'no_data')`, [id]);
  await assert.rejects(db.query(`select publish_chat_answer_review($1,'default',$1)`, [id]));
  await db.query(`update chat_answer_reviews set status='draft',faq_question='Cách chọn sơn nội thất?',corrected_answer='Chọn theo bề mặt và hướng dẫn kỹ thuật đã được xác minh.' where id=$1`, [id]);
  await assert.rejects(db.query(`select publish_chat_answer_review($1,'other',$1)`, [id]));
  await db.query(`select publish_chat_answer_review($1,'default',$1)`, [id]);
  await db.query(`select publish_chat_answer_review($1,'default',$1)`, [id]);
  assert.equal((await db.query('select count(*)::int as n from knowledge_documents')).rows[0].n, 1);
  assert.equal((await db.query('select approval_status from knowledge_documents')).rows[0].approval_status, 'approved');
  assert.equal((await db.query('select status from chat_answer_reviews')).rows[0].status, 'resolved');
  const collision = '00000000-0000-4000-8000-000000000002';
  await db.query(`insert into knowledge_documents(id,tenant_id) values($1,'other')`, [collision]);
  await db.query(`insert into chat_answer_reviews(id,tenant_id,session_id,question,answer,faq_question,corrected_answer,status,needs_review) values($1,'default','session','Hỏi về loại sơn?','Phản hồi gốc','Câu hỏi đã kiểm tra','Đáp án đầy đủ đã đối chiếu tài liệu','draft',true)`, [collision]);
  await assert.rejects(db.query(`select publish_chat_answer_review($1,'default',$1)`, [collision]));
  assert.equal((await db.query('select status from chat_answer_reviews where id=$1', [collision])).rows[0].status, 'draft');
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query(`select has_table_privilege($1,'chat_answer_reviews','select') as allowed`, [role])).rows[0].allowed, false);
    assert.equal((await db.query(`select has_function_privilege($1,'publish_chat_answer_review(uuid,text,uuid)','execute') as allowed`, [role])).rows[0].allowed, false);
  }
  await db.query(`insert into chat_answer_reviews(id,tenant_id,session_id,question,answer,created_at) values(gen_random_uuid(),'default','old','Câu hỏi cũ','Trả lời cũ',now()-interval '100 days')`);
  await db.exec('select cleanup_unflagged_chat_answers()');
  assert.equal((await db.query('select count(*)::int as n from chat_answer_reviews')).rows[0].n, 2);
  console.log('PASS migration idempotence, private storage, explicit draft requirements, tenant scope, approval idempotence, atomic rollback, and retention');
} finally { await db.close(); }
