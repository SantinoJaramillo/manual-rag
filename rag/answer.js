/**
 * PURPOSE:
 *   Svara med RAG av hög kvalitet:
 *   - Förklaring (kort)
 *   - Prioriterade åtgärdssteg (3–6)
 *   - Sammanfattning
 *   - Källor (Titel – s. X)
 *   - Vänlig, teknisk ton + säkerhetstips när relevant
 *
 * USAGE:
 *   const { answer, sources } = await answerQuestion({ question, manualId, topK });
 */

import 'dotenv/config';
import OpenAI from 'openai';
import { retrieve } from '../retrieval/retrieve.js'; // <-- ändra vid behov

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ----------------------------- helpers ---------------------------------- */

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

/** Enkel efter-polering ifall modellen skulle glömma luft/sektioner */
function ensureReadable(answer = '') {
  const insertDoubleBreak = (s) =>
    s.replace(/(Förklaring:)/, '\n$1')
     .replace(/(Åtgärder:)/, '\n$1')
     .replace(/(Sammanfattning:)/, '\n$1')
     .replace(/(Källor:)/, '\n$1')
     .replace(/\n{3,}/g, '\n\n');

  return insertDoubleBreak(answer.trim());
}

/* ---------------------------- prompting --------------------------------- */

const SYSTEM_PROMPT = `
Du är en erfaren servicetekniker som hjälper användare att felsöka utifrån utdrag ur service-/drifthandböcker (“KÄLLOR”).

FÖRBUD:
- Hitta inte på information som inte stöds av källorna.
- Om källorna är otydliga eller otillräckliga: säg det och be om max 2 relevanta förtydliganden.

TONALITET:
- Skriv tydligt, tryggt och vänligt på svenska. Använd "du".
- Korta meningar. Undvik jargong om den inte finns i källorna.

SÄKERHET:
- Om en åtgärd kan vara riskfylld (el, värme, heta vätskor, underhåll som kräver frånslag): lägg till en rad
  "⚠️ Säkerhetstips: ..." med kort varning.

KRAV PÅ SVARET:
- Strukturera alltid så här (med tom rad mellan sektionerna):
  Förklaring:
  <2–5 meningar som beskriver troliga orsaker, i användarens ord>

  Åtgärder:
  1. <viktigaste steget först>
  2. <nästa>
  3. ...
  (3–6 steg. Var specifik. Hänvisa till begrepp i källorna.)

  Sammanfattning:
  <en mening som knyter ihop trolig orsak + vad man gör om problemet kvarstår>

  Källor:
  * Titel – s. X
  * (max 3–5 rader, viktigast först)

REGLER:
- Baseras endast på "KÄLLOR". Blanda inte in extern allmänkunskap.
- Gissa aldrig sidnummer. Om sidnummer saknas i utdraget, skriv "s. okänd".
`.trim();

function buildMessages({ question, chunks }) {
  const context = buildContext(chunks);
  const userContent = `
FRÅGA:
${question}

KÄLLOR (utdrag med metadata):
${context}

Instruktioner:
- Använd endast innehållet ovan.
- När du refererar i "Källor:", använd {titel, sida} från utdragen.
- Om flera utdrag kommer från samma titel med olika sidor, välj de viktigaste (≤3).
`.trim();

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
}

/* --------------------------- main function ------------------------------- */

/**
 * @param {{ question: string, manualId?: string, topK?: number }} params
 */
export async function answerQuestion({ question, manualId, topK = 8 }) {
  if (!question || !question.trim()) {
    return { answer: 'Fråga saknas.', sources: [] };
  }

  // 1) Hämta relevanta utdrag
  const chunks = await retrieve({ question, manualId, topK });

  // 2) Ingen träff → tydlig, hjälpsam respons
  if (!chunks || chunks.length === 0) {
    const guidance =
      'Jag hittar inget som besvarar frågan i källorna. Kan du specificera modell/avsnitt/sida eller ge fler nyckelord?';
    return { answer: guidance, sources: [] };
  }

  // 3) Bygg prompten
  const messages = buildMessages({ question, chunks });

  // 4) Kör modellen (låg temperatur för faktanärhet)
  const res = await openai.chat.completions.create({
    model: 'gpt-5',            // välj  modell här
    messages,
    temperature: 0.2,
    top_p: 1,
    max_tokens: 900,
    presence_penalty: 0,
    frequency_penalty: 0.1,
  });

  let answer = res?.choices?.[0]?.message?.content || '';
  answer = ensureReadable(answer);

  // 5) Returnera svaret + de utdrag som källor till UI
  return {
    answer,
    sources: chunks.map(c => ({
      manual_id: c.manual_id,
      title: c.title || 'Okänd titel',
      page: c.page ?? 'okänd',
      score: c.score ?? null,
      text: c.text ?? ''
    })),
  };
}
