/**
 * PURPOSE:
 *   Givet en naturlig fråga: hämta mest relevanta chunks från Pinecone.
 *
 * KÖR:
 *   const hits = await retrieve({ question: 'Hur sätter jag standby?', topK: 8, manualId });
 *
 * GÖR:
 *   - Embeddar frågan (OpenAI)
 *   - Queryar Pinecone (namespace = DEV_TENANT_ID)
 *   - (Valfritt) Begränsar sökningen med metadatafilter (manual_id)
 *   - Returnerar normaliserade träffar: { score, page, title, text, manual_id }
 */
import 'dotenv/config';
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

const INDEX = process.env.PINECONE_INDEX;
const TENANT = process.env.DEV_TENANT_ID;

async function embed(text) {
  const r = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text
  });
  return r.data[0].embedding;
}

export async function retrieve({ question, topK = 8, manualId = null }) {
  const vector = await embed(question);
  const index = pc.index(INDEX).namespace(String(TENANT));

  // Skicka ENDAST filter om manualId finns, och casta till sträng
  const filter = manualId ? { manual_id: String(manualId) } : undefined;

  const res = await index.query({
    vector,
    topK: Number(topK) || 8,
    includeMetadata: true,
    filter
  });

  return (res.matches || []).map(m => ({
    score: m.score,
    page: m.metadata?.page ?? 0,
    title: m.metadata?.title ?? 'Okänd manual',
    text: m.metadata?.chunk_text ?? '',
    manual_id: m.metadata?.manual_id ?? null
  }));
}
