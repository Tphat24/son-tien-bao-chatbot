import { indexApprovedKnowledge } from '../src/services/rag.service.js';

const tenantId = process.argv[2];

indexApprovedKnowledge(tenantId)
  .then((result) => {
    console.log(`RAG index complete: ${result.documents} documents, ${result.chunks} chunks, ${result.skipped} unchanged.`);
  })
  .catch((error) => {
    console.error('RAG indexing failed:', error);
    process.exitCode = 1;
  });
