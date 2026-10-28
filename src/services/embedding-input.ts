export const EMBEDDING_DIMENSIONS = 768;
export const EMBEDDING_INPUT_VERSION = 'retrieval-v2';

export function embeddingInput(model: string, contents: string[], taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT', title?: string) {
  const embedding2 = /^gemini-embedding-2(?:$|-)/.test(model.replace(/^models\//, ''));
  return {
    // Explicit Content objects keep batch items separate, including Embedding 2.
    contents: contents.map((content) => ({
      role: 'user',
      parts: [{ text: embedding2
        ? taskType === 'RETRIEVAL_QUERY'
          ? `task: search result | query: ${content}`
          : `title: ${title || 'none'} | text: ${content}`
        : content }]
    })),
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      ...(!embedding2 ? { taskType, ...(taskType === 'RETRIEVAL_DOCUMENT' && title ? { title } : {}) } : {})
    }
  };
}

export function normalizeEmbedding(values: number[] | undefined): number[] {
  if (values?.length !== EMBEDDING_DIMENSIONS || !values.every(Number.isFinite)) {
    throw new Error(`Expected a finite ${EMBEDDING_DIMENSIONS}-dimension embedding`);
  }
  const norm = Math.hypot(...values);
  if (norm === 0) throw new Error('Embedding vector must not be zero');
  return values.map((value) => value / norm);
}
