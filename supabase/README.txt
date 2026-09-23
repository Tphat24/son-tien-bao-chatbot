Chạy các file theo thứ tự trong Supabase SQL Editor:

1. 00_SMART_ADVISOR_SETUP.sql — dữ liệu lõi, cache, AI jobs và hội thoại.
2. 01_OA_UPGRADE.sql — quản trị, Zalo OA, báo giá, audit và bảng màu.
3. 02_ENTERPRISE_RAG.sql — pgvector, chunks và tìm kiếm cosine.
4. 03_OPERATIONS_UPGRADE.sql — rate limit dùng chung, cache embedding và lịch sử index RAG.

Các file được viết idempotent để có thể chạy lại khi triển khai môi trường mới.
