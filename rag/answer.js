/**
 * PURPOSE:
 *   Bygga ett svar (RAG) baserat på upphämtade chunks + strikt prompt.
 *
 * KÖR:
 *   const { answer, sources } = await answerQuestion({ question, manualId, topK });
 *
 * RETURNERAR:
 *   - answer: textsvar från modellen
 *   - sources: de chunks vi skickade in (för källvisning i UI)
 */

import 'dotenv/config';
import OpenAI from 'openai';
import { retrieve } from '../retrieval/retrieve.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Bygger upp käll-kontext som modellen får läsa */
function buildContext(chunks = []) {
  return chunks
    .map((c, i) => {
      const title = c.title || 'Okänd titel';
      const page = (c.page ?? 'okänd');
      const text = (c.text || '').trim();
      return [
        `### Utdrag ${i + 1}`,
        `titel: ${title}`,
        `sida: ${page}`,
        `text:`,
        text
      ].join('\n');
    })
    .join('\n\n');
}

/** System-prompt som tvingar modellen hålla sig till källor */
const SYSTEM_PROMPT = `
Du är en erfaren servicetekniker som hjälper användare att lösa tekniska problem utifrån utdrag ur servicehandböcker (“KÄLLOR”).

FÖRBUD:
- Hitta inte på svar som inte stöds av källorna.
- Om källorna är otydliga: säg det, och föreslå vad användaren kan kontrollera eller fråga om istället.

KRAV PÅ SVAR:
- Skriv vänligt men tekniskt korrekt. Använd "du" när du ger instruktioner.
- Om en åtgärd kan vara farlig (t.ex. rör el, värme eller underhåll), lägg till en varning: ⚠️ Säkerhetstips: ...
- Förklara först kort vad felet kan bero på (sammanhang, orsak).
- Ge sedan en prioriterad lista med 3–6 steg (viktigast först) för felsökning/åtgärd.
- Skriv på tydlig, vardaglig svenska som en servicetekniker skulle förklara det.
- Avsluta med en kort sammanfattning: vad är troliga orsaker + vad man bör göra om problemet kvarstår.
- Lägg till "Källor:" med *Titel – s. X*.

FORMAT:
Förklaring:
1. ...
2. ...
3. ...
Sammanfattning:
...
Källor:
* ...
`


/** Bygger meddelanden till chat-modellen */
function buildMessages({ question, chunks }) {
  const context = buildContext(chunks);
  const userContent = `
FRÅGA:
${question}

KÄLLOR (utdrag med metadata):
${context}

Instruktioner:
- Använd endast innehållet ovan.
- När du refererar till källor i "Källor:"-listan, använd deras metadata {titel, sida}.
- Om flera utdrag kommer från samma titel med olika sidor, visa viktigaste sidorna (helst ≤3).
`.trim();

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
}

/**
 * Huvudfunktion: hämtar chunks, bygger prompt, anropar modellen.
 * @param {{question: string, manualId?: string, topK?: number}} params
 */
export async function answerQuestion({ question, manualId, topK = 8 }) {
  if (!question || !question.trim()) {
    return { answer: 'Fråga saknas.', sources: [] };
  }

  // 1) Hämta relevanta utdrag
  const chunks = await retrieve({ question, manualId, topK });

  // 2) Om vi inte hittar något – var tydlig och be om förtydligande
  if (!chunks || chunks.length === 0) {
    return {
      answer:
        'Jag hittar inget som svarar på frågan i källorna. Kan du förtydliga vad du söker (modell, avsnitt, sida eller nyckelord)?',
      sources: []
    };
  }

  // 3) Bygg prompten
  const messages = buildMessages({ question, chunks });

  // 4) Kör modellen (håll temperaturen låg för faktakrav)
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.2,
    top_p: 1,
    max_tokens: 800,
    presence_penalty: 0,
    frequency_penalty: 0.1,
  });

  const answer = res?.choices?.[0]?.message?.content?.trim() || 'Inget svar returnerades.';

  // 5) Returnera svaret + de chunks vi använde som källor i UI
  return {
    answer,
    // Här returnerar vi chunksen vi skickade. Om du vill "snäva in"
    // till de 3–5 viktigaste för käll-listan i UI, filtrera här.
    sources: chunks.map(c => ({
      manual_id: c.manual_id,
      title: c.title || 'Okänd titel',
      page: c.page ?? null,
      score: c.score ?? null,
      text: c.text ?? ''
    }))
  };
}
