/**
 * PURPOSE:
 *   Create (or confirm) the Pinecone index used for embeddings.
 *
 * USAGE:
 *   npm run create-index
 *
 * WHAT IT DOES:
 *   - Reads PINECONE_API_KEY + PINECONE_INDEX from .env
 *   - Creates a serverless Pinecone index if it does not exist
 *   - Uses dimension=1536 (OpenAI text-embedding-3-small), metric=cosine
 *
 * OUTPUT:
 *   Logs whether the index was created or already exists.
 *
 * GOTCHAS:
 *   - Embedding dimension MUST match your model (1536 for text-embedding-3-small).
 *   - Region is set in code (aws/us-east-1); change if needed.
 *   - Safe to run multiple times (idempotent).
 */



// Läser .env automatiskt (OPENAI_API_KEY, PINECONE_API_KEY, PINECONE_INDEX)
import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';

// Skapar en Pinecone-klient med din API-nyckel
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

async function main() {
  // Namn på indexet vi vill ha (från .env)
  const name = process.env.PINECONE_INDEX;

  // Embedding-dimension: 1536 för OpenAI "text-embedding-3-small"
  // (Om du byter embeddingsmodell måste detta matcha!)
  const dimension = 1536;

  // Likhetsmått: cosine funkar bra för text-embeddings (Kolla om det finns andra alternativ)
  const metric = 'cosine';

  // Kolla om index redan finns för att undvika fel
  const listed = await pc.listIndexes();
  const exists = listed.indexes?.some(i => i.name === name);

  if (!exists) {
    // Skapar ett serverless-index (smidigt vid utveckling)
    await pc.createIndex({
      name,
      dimension,
      metric,
      spec: { serverless: { cloud: 'aws', region: 'us-east-1' } }
    });
    console.log(`✅ Created index: ${name}`);
  } else {
    console.log(`ℹ️ Index already exists: ${name}`);
  }
}

main().catch((err) => {
  console.error('Failed to create index:', err);
  process.exit(1);
});
