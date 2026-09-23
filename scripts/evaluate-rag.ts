import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { env } from '../src/config/env.js';
import { retrieveAdvisorContext } from '../src/services/advisor-context.service.js';
import { normalizeText } from '../src/utils/text.js';

type EvaluationCase = { question: string; expectedTerms: string[] };
const cases = JSON.parse(await readFile(new URL('../evals/rag-cases.json', import.meta.url), 'utf8')) as EvaluationCase[];
const results: Array<Record<string, unknown>> = [];

for (const item of cases) {
  const started = Date.now();
  try {
    const context = await retrieveAdvisorContext(item.question);
    const corpus = normalizeText([
      ...context.products.map((product) => `${product.name} ${product.description ?? ''} ${product.use_case ?? ''} ${product.coverage_text ?? ''}`),
      ...context.knowledge.map((document) => `${document.title} ${document.content}`)
    ].join(' '));
    const matchedTerms = item.expectedTerms.filter((term) => corpus.includes(normalizeText(term)));
    results.push({
      question: item.question,
      passed: matchedTerms.length > 0,
      matchedTerms,
      expectedTerms: item.expectedTerms,
      retrievalMode: context.retrieval.mode,
      vectorMatches: context.retrieval.vectorMatches,
      topSimilarity: context.retrieval.topSimilarity,
      sources: context.knowledge.map((document) => document.source_url).filter(Boolean).slice(0, 4),
      durationMs: Date.now() - started
    });
  } catch (error) {
    results.push({ question: item.question, passed: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started });
  }
}

const passed = results.filter((item) => item.passed).length;
const passRate = Math.round((passed / results.length) * 1000) / 10;
console.log(JSON.stringify({ tenant: env.RAG_TENANT_ID, passed, total: results.length, passRate, results }, null, 2));
if (passRate < 75) process.exitCode = 1;
