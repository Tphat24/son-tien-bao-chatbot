// Optional PostgreSQL integration QA: npm install --no-save @electric-sql/pglite @electric-sql/pglite-pgvector
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(process.env.QA_PACKAGE_ROOT ? resolve(process.env.QA_PACKAGE_ROOT, 'package.json') : import.meta.url);
const { PGlite } = require('@electric-sql/pglite');
const { vector } = require('@electric-sql/pglite-pgvector');
const { unaccent } = require('@electric-sql/pglite/contrib/unaccent');
const db = new PGlite({ extensions: { vector, unaccent } });
const vectorValue = JSON.stringify([1, ...Array(767).fill(0)]);
const documentId = '00000000-0000-0000-0000-000000000001';
try {
  await db.exec(`create schema extensions; create role service_role bypassrls; create role anon; create role authenticated;
    create table public.knowledge_documents (id uuid primary key default gen_random_uuid(), title text not null,
    content text not null, source_url text, content_hash text, approval_status text, updated_at timestamptz default now());`);
  await db.exec(await readFile(new URL('../supabase/02_ENTERPRISE_RAG.sql', import.meta.url), 'utf8'));
  const migration = await readFile(new URL('../supabase/04_RETRIEVAL_V2.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // idempotent migration
  await db.query(`insert into knowledge_documents(id,title,content,source_url,content_hash,approval_status,tenant_id)
    values ($1,'Chống thấm sân thượng','Thi công chống thấm theo tài liệu.','https://sontienbao.com/a','hash','approved','default'),
    ('00000000-0000-0000-0000-000000000002','Tài liệu khác tenant','Chống thấm bí mật',null,'hash','approved','other'),
    ('00000000-0000-0000-0000-000000000003','Tài liệu chưa duyệt','Chống thấm chưa duyệt',null,'hash','pending','default')`, [documentId]);
  for (const [id, tenant, model] of [[documentId, 'default', 'gemini-embedding-2'], [documentId, 'default', 'gemini-embedding-001'],
    ['00000000-0000-0000-0000-000000000002', 'other', 'gemini-embedding-2'], ['00000000-0000-0000-0000-000000000003', 'default', 'gemini-embedding-2']]) {
    await db.query(`insert into knowledge_chunks(tenant_id,knowledge_document_id,chunk_index,title,content,content_hash,embedding_model,embedding,metadata)
      values($1,$2,0,'Chống thấm sân thượng','Thi công chống thấm theo tài liệu.','hash',$3,$4::extensions.vector,'{"input_version":"retrieval-v2"}')`, [tenant, id, model, vectorValue]);
  }
  const rows = (await db.query(`select * from match_knowledge_chunks_v2($1::extensions.vector, 0.62, 20, 'default','gemini-embedding-2','retrieval-v2')`, [vectorValue])).rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].document_id, documentId);
  const legacy = (await db.query(`select * from match_knowledge_chunks($1::extensions.vector)`, [vectorValue])).rows;
  assert.equal(legacy.length, 1); // excludes the new model even though it has the same dimension
  for (const query of ['chong tham', 'chống thấm']) {
    const found = (await db.query(`select * from search_knowledge_chunks_lexical($1,20,'default','gemini-embedding-2','retrieval-v2')`, [query])).rows;
    assert.equal(found.length, 1); assert.equal(found[0].document_id, documentId);
  }
  assert.equal((await db.query(`select * from search_knowledge_chunks_lexical('   ')`)).rows.length, 0);
  await db.query(`update knowledge_documents set content_hash='changed' where id=$1`, [documentId]);
  assert.equal((await db.query(`select * from match_knowledge_chunks_v2($1::extensions.vector)`, [vectorValue])).rows.length, 0);
  await db.query(`update knowledge_documents set content_hash='hash' where id=$1`, [documentId]);
  console.log('PASS migrations, model isolation, tenant isolation, approvals, stale hashes and Vietnamese accent-insensitive FTS');

  const chunk = { tenant_id: 'default', knowledge_document_id: documentId, chunk_index: 0,
    content: 'Nội dung mới.', content_hash: 'hash', embedding_model: 'gemini-embedding-2', embedding: JSON.parse(vectorValue), metadata: { input_version: 'retrieval-v2' } };
  const replace = (chunks, tenant = 'default') => db.query(`select replace_knowledge_document_chunks($1,$2,'gemini-embedding-2','Thi công chống thấm theo tài liệu.','Chống thấm sân thượng',$3::jsonb)`, [documentId, tenant, JSON.stringify(chunks)]);
  const count = async () => (await db.query(`select content from knowledge_chunks where knowledge_document_id=$1 and embedding_model='gemini-embedding-2'`, [documentId])).rows;
  await assert.rejects(replace([{ ...chunk, embedding: [1, 2] }]));
  assert.equal((await count())[0].content, 'Thi công chống thấm theo tài liệu.');
  await assert.rejects(replace([chunk], 'other'));
  await assert.rejects(replace([{ ...chunk, tenant_id: 'other' }]));
  await replace([chunk]);
  assert.equal((await count())[0].content, 'Nội dung mới.');
  assert.equal((await db.query(`select * from knowledge_chunks where knowledge_document_id=$1 and embedding_model='gemini-embedding-001'`, [documentId])).rows.length, 1);
  await db.query(`update knowledge_documents set approval_status='rejected' where id=$1`, [documentId]);
  await assert.rejects(replace([chunk]));
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query(`select has_function_privilege($1, 'public.search_knowledge_chunks_lexical(text,integer,text,text,text)', 'execute') as allowed`, [role])).rows[0].allowed, false);
    assert.equal((await db.query(`select has_function_privilege($1, 'public.replace_knowledge_document_chunks(uuid,text,text,text,text,jsonb)', 'execute') as allowed`, [role])).rows[0].allowed, false);
  }
  console.log('PASS atomic replacement rollback, model rollback index, changed approvals and service-only RPC permissions');
} finally { await db.close(); }
