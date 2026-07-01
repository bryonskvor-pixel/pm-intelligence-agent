import fs from 'node:fs';
import { embedText } from '../src/lib/cloudflare.js';

const [, , chunksPath, ndjsonOutPath] = process.argv;
if (!chunksPath || !ndjsonOutPath) {
  console.error('Usage: node embed_and_insert.js <chunks.json> <out.ndjson>');
  process.exit(1);
}

async function main() {
  const chunks = JSON.parse(fs.readFileSync(chunksPath, 'utf8'));
  const vectors = await embedText(chunks.map((c) => c.text));
  const lines = chunks.map((c, i) =>
    JSON.stringify({
      id: c.id,
      values: vectors[i],
      metadata: { model_id: c.model_id, section: c.section, text: c.text },
    })
  );
  fs.writeFileSync(ndjsonOutPath, lines.join('\n') + '\n');
  console.log(`Wrote ${lines.length} vectors to ${ndjsonOutPath}`);
}

main().catch((err) => {
  console.error('Embedding failed:', err);
  process.exit(1);
});
