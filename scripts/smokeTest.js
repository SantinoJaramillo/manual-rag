/**
 * PURPOSE:
 *   Idempotent smoke test: embed → upsert (fixed ID) → query ("hej" and exact text).
 *
 * RUN:
 *   npm run smoke
 */

import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const REQUIRED = ['OPENAI_API_KEY', 'PINECONE_API_KEY', 'PINECONE_INDEX', 'DEV_TENANT_ID'];
for (const k of REQUIRED) if (!process.env[k]) throw new Error(`Missing ${k} in .env`);

const INDEX = process.env.PINECONE_INDEX;
const TENANT = process.env.DEV_TENANT_ID;
const INCLUDE_VALUES = String(process.env.INCLUDE_VALUES || '').toLowerCase() === 'true';

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function embed(text) {
  const r = await openai.embeddings.create({
    model: 'text-embedding-3-small', // 1536-dim
    input: text,
  });
  return r.data[0].embedding;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('Index     :', INDEX);
  console.log('Namespace :', TENANT);

  const index = pc.index(INDEX).namespace(String(TENANT));

  // ---- Upsert (idempotent: fast ID, ingen UUID) ---------------------------
  const text = 'Hej världen';
  const values = await embed(text);
  const SMOKE_ID = `${TENANT}:smoke:none:1`; // <— fast ID, skriver över tidigare smoke-vektor

  // metadata får inte innehålla null/undefined
  await index.upsert([{
    id: SMOKE_ID,
    values,
    metadata: {
      tenant_id: String(TENANT),
      manual_id: 'none',
      page: 1,
      title: 'Smoke Test',
      chunk_text: text,
    },
  }]);

  // Vänta lite så vektorn blir sökbar (eventual consistency)
  await sleep(800);

  // ---- Query 1: liknande ord ("hej") --------------------------------------
  const q1 = 'Hej';
  const qEmb1 = await embed(q1);
  const res1 = await index.query({
    vector: qEmb1,
    topK: 3,
    includeMetadata: true,
    includeValues: INCLUDE_VALUES, // sätt INCLUDE_VALUES=true i .env om du vill se vektorvärden
  });
  console.log(`\n🔎 Matches for "${q1}":`, JSON.stringify(res1.matches || [], null, 2));

  // ---- Query 2: exakt samma text ("Hej världen") --------------------------
  const q2 = 'Hej världen';
  const qEmb2 = await embed(q2);
  const res2 = await index.query({
    vector: qEmb2,
    topK: 3,
    includeMetadata: true,
    includeValues: INCLUDE_VALUES,
  });
  console.log(`\n🔎 Matches for "${q2}":`, JSON.stringify(res2.matches || [], null, 2));

  console.log('\n✅ Klar. Du bör se högre score för den exakta frågan.');
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
