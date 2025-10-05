/**
 * PURPOSE:
 *   Bygga ett svar (RAG) baserat på upphämtade chunks + strikt prompt.
 *
 * KÖR:
 *   const { answer, sources } = await answerQuestion({ question, manualId });
 *
 * GÖR:
 *   - Hämtar relevanta chunks via retrieve()
 *   - Bygger prompt som tvingar modellen att endast använda utdragen
 *   - Returnerar textsvar + de chunks som användes (för källor i UI)
 */
import 'dotenv/config';
import OpenAI from 'openai';
import { retrieve } from '../retrieval/retrieve.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildContext(chunks) {
  // Byt ut "Chunk" -> "Utdrag" för att undvika att modellen pratar om "Chunk" i svaret
  return chunks.map((c, i) => `### Utdrag ${i + 1}
Manual: ${c.title} | Sida: ${c.page}
---
${c.text}`).join('\n\n');
}

export async function answerQuestion({ question, manualId = null }) {
  const chunks = await retrieve({ question, topK: 8, manualId });
  const context = buildContext(chunks);

  const system = `Du är en hjälpassistent för servicetekniker.
VIKTIGT:
- Använd ENDAST de utdrag du fått.
- Om svaret inte finns i utdragen ska du svara exakt: "Jag hittar inte detta i manualen".
- När du ger råd, lägg till källhänvisning efter varje punkt i formatet: (Titel — sida X).
- Om flera sidor stöder samma punkt, ange den vanligaste eller mest relevanta sidan.
- Svara kort, konkret och på svenska. Prioritera punktlista.
- Svara inte med "Chunk" eller interna id:n; använd bara (Titel — sida X).`;

  const user = `Fråga: ${question}

Källutdrag (använd endast dessa):
${context}

Instruktioner för hur du svarar:
- Ge först en kort, praktisk åtgärdslista eller ett tydligt svar.
- Efter varje punkt ska du lägga en källhänvisning i formatet (Titel — sida X).
- Hämta "Titel" och "sida" från källutdragen. Om sidnummer saknas helt, skriv (Titel — sida okänd).
- Upprepa inte samma källa i onödan; välj den mest relevanta om flera matchar.`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.2
  });

  return {
    answer: res.choices[0].message.content,
    sources: chunks
  };
}
