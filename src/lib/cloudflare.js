const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

function assertConfigured() {
  if (!ACCOUNT_ID || !API_TOKEN) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set');
  }
}

async function cfFetch(path, options = {}) {
  assertConfigured();
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(`Cloudflare API error: ${JSON.stringify(json.errors)}`);
  }
  return json.result;
}

export async function d1Query(databaseId, sql, params = []) {
  const result = await cfFetch(`/d1/database/${databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify({ sql, params }),
  });
  return result[0].results;
}

export async function embedText(texts) {
  const result = await cfFetch('/ai/run/@cf/baai/bge-base-en-v1.5', {
    method: 'POST',
    body: JSON.stringify({ text: texts }),
  });
  return result.data;
}

export async function vectorizeQuery(indexName, vector, { topK = 5, returnMetadata = 'all' } = {}) {
  const result = await cfFetch(`/vectorize/v2/indexes/${indexName}/query`, {
    method: 'POST',
    body: JSON.stringify({ vector, topK, returnMetadata }),
  });
  return result.matches;
}
