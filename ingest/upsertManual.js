/**
 * PURPOSE:
 *   CLI-verktyg för att ladda in en PDF i Pinecone: PDF → sidor → chunks → embeddings → upsert.
 *
 * KÖR:
 *   node ingest/upsertManual.js ./manuals/min-manual.pdf 00000000-...-0100 "Min Manual"
 *   npm run ingest -- ./manuals/min-manual.pdf 00000000-...-0100 "Min Manual"
 *
 * GÖR:
 *   - Läser .env (tenant, API-nycklar, index)
 *   - Extraherar text från PDF **per sida**
 *   - Chunkar texten per sida
 *   - Skapar embeddings i batchar (OpenAI)
 *   - Upsertar vektorer till Pinecone (namespace = DEV_TENANT_ID)
 *   - Lagrar metadata: tenant_id, manual_id, **page**, title, chunk_text
 */

import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import pdfToPages from './pdfToPages.js';
import { chunkText } from './chunk.js';

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const INDEX = process.env.PINECONE_INDEX;
const TENANT = process.env.DEV_TENANT_ID;

// Kapa långa strängar för att hålla metadata rimlig i storlek
function truncate(str, max = 8000) {
  if (typeof str !== 'string') return String(str);
  return str.length > max ? str.slice(0, max) : str;
}

// Säker metadata: tar bort null/undefined, castar fel typ till sträng
function safeMeta(meta) {
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (Array.isArray(v) && v.every(x => typeof x === 'string')) {
      out[k] = v;
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

// Embedding i batch (billigare/snabbare än en och en)
async function embedBatch(texts) {
  const r = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts
  });
  return r.data.map(d => d.embedding);
}

export async function upsertManual({ pdfPath, manualId, title }) {
  const index = pc.index(INDEX).namespace(String(TENANT));

  console.log('📄 Läser PDF...', pdfPath);
  const pages = await pdfToPages(pdfPath); // [{ page: 1, text: '...' }, ...]

  console.log(`🧾 Antal sidor i PDF: ${pages.length}`);

  // Bygg alla chunks med sidnummer
  const chunkRecords = []; // { page, chunk_text }
  for (const { page, text } of pages) {
    const chunks = chunkText(text, { min: 250, max: 500, overlap: 0.12 });
    for (const c of chunks) {
      chunkRecords.push({ page, chunk_text: c });
    }
  }

  console.log('✂️  Chunkar text per sida... totala chunks:', chunkRecords.length);

  // Embeddings + upsert i batchar
  const batchSize = 64;
  for (let i = 0; i < chunkRecords.length; i += batchSize) {
    const slice = chunkRecords.slice(i, i + batchSize);

    const texts = slice.map(s => s.chunk_text);
    const embs = await embedBatch(texts);

    const vectors = embs.map((values, k) => {
      const { page, chunk_text } = slice[k];
      const id = `${TENANT}:${manualId}:${page}:${uuidv4()}`;

      const md = safeMeta({
        tenant_id: String(TENANT),
        manual_id: String(manualId || 'unknown'),
        page: Number(page), // ✅ korrekt sidnummer
        title: String(title || 'Manual'),
        chunk_text: truncate(chunk_text)
      });

      return { id, values, metadata: md };
    });

    await index.upsert(vectors);
    console.log(`⬆️  Upserted ${Math.min(i + batchSize, chunkRecords.length)}/${chunkRecords.length}`);
  }

  console.log(`✅ Klar: ${title} (${chunkRecords.length} chunks)`);
}

// CLI-stöd
if (process.argv[2]) {
  const pdfPath = process.argv[2];
  const manualId = process.argv[3] || uuidv4();
  const title = process.argv[4] || 'Manual';

  console.log('Reading PDF from:', pdfPath);

  upsertManual({ pdfPath, manualId, title }).catch(err => {
    console.error('Ingest failed:', err);
    process.exit(1);
  });
}
