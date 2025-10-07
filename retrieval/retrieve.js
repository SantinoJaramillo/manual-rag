/**
 * PURPOSE:
 *   Givet en fråga: hämta relevanta chunks från Pinecone, städa upp dem och
 *   returnera normaliserade träffar för RAG-prompten.
 *
 * USAGE:
 *   const hits = await retrieve({ question, topK: 8, manualId, minScore: 0.3 });
 */

import 'dotenv/config';
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

const {
  OPENAI_API_KEY,
  PINECONE_API_KEY,
  PINECONE_INDEX,
  DEV_TENANT_ID,
} = process.env;

if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
if (!PINECONE_API_KEY) throw new Error('Missing PINECONE_API_KEY');
if (!PINECONE_INDEX) throw new Error('Missing PINECONE_INDEX');
if (!DEV_TENANT_ID) throw new Error('Missing DEV_TENANT_ID');

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const pc = new Pinecone({ apiKey: PINECONE_API_KEY });

const INDEX = PINECONE_INDEX;
const TENANT = String(DEV_TENANT_ID);

/** Liten städare för whitespace */
function clean(text = '') {
  return String(text)
    .replace(/\s+/g, ' ')
    .replace(/\u00A0/g, ' ') // non-breaking space
    .trim();
}

/** Plocka sidnummer robust från olika nycklar */
function getPage(meta = {}) {
  const p =
    meta.page ??
    meta.page_number ??
    meta.pageNum ??
    meta.pageIndex ??
    null;
  // säkerställ heltal om möjligt
  if (p == null) return null;
  const n = Number(p);
  return Number.isFinite(n) ? n : null;
}

/** Embedding för frågan */
async function embed(text) {
  const r = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return r.data[0].embedding;
}

/**
 * Huvudfunktion
 * @param {{
 *  question: string,
 *  topK?: number,
 *  manualId?: string | null,
 *  minScore?: number,        // filtrera bort svaga träffar (0–1)
 *  maxPerTitle?: number      // begränsa hur många per titel (diversitet)
 * }} params
 */
export async function retrieve({
  question,
  topK = 8,
  manualId = null,
  minScore = 0.0,
  maxPerTitle = 3,
}) {
  if (!question || !question.trim()) return [];

  const vector = await embed(question);
  const index = pc.index(INDEX).namespace(TENANT);

  const filter = manualId ? { manual_id: String(manualId) } : undefined;

  const res = await index.query({
    vector,
    topK: Number(topK) || 8,
    includeMetadata: true,
    filter,
  });

  const matches = Array.isArray(res?.matches) ? res.matches : [];

  // 1) Normalisera
  let items = matches.map((m) => {
    const meta = m.metadata || {};
    const title = clean(meta.title || 'Okänd manual');
    const page = getPage(meta);
    const text = clean(meta.chunk_text || meta.text || '');
    return {
      score: m.score ?? null,
      page,                     // kan vara null om okänt
      title,
      text,
      manual_id: meta.manual_id ?? null,
    };
  });

  // 2) Score-filter (skär bort svaga)
  if (typeof minScore === 'number' && minScore > 0) {
    items = items.filter((x) => (x.score ?? 0) >= minScore);
  }

  // 3) Deduplicera på (title + page + text) för att undvika dubbletter
  const seen = new Set();
  items = items.filter((x) => {
    const key = `${x.title}::${x.page ?? 'nopage'}::${x.text.slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 4) Diversifiera: max X per titel (hjälper modellen att få bredd)
  if (typeof maxPerTitle === 'number' && maxPerTitle > 0) {
    const perTitleCount = new Map();
    items = items.filter((x) => {
      const c = perTitleCount.get(x.title) ?? 0;
      if (c >= maxPerTitle) return false;
      perTitleCount.set(x.title, c + 1);
      return true;
    });
  }

  // 5) Sortera efter score (högst först)
  items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return items;
}
