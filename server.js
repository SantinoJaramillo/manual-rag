/**
 * PURPOSE:
 *   Minimal Express-API som exponerar RAG på POST /api/chat
 *
 * KÖR:
 *   npm start
 *   → http://localhost:8787
 *
 * ENDPOINT:
 *   POST /api/chat
 *   Body: { "question": "text", "manualId": "optional-manual-uuid" }
 *   Response: { "answer": "text", "sources": [{ manual_id, title, page, score }, ...] }
 *
 * NOTIS:
 *   - Aktiverar CORS så att din frontend kan anropa under utveckling.
 *   - Parar JSON-body.
 *   - Fångar fel och returnerar 400/500 vid behov.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { answerQuestion } from './rag/answer.js';

const app = express();

/* ✅ Tillåt din frontend-domän (one.com) att prata med backend */
app.use(cors({
  origin: 'https://santinojaramillo.com',
  methods: ['GET', 'POST'],
}));

app.use(express.json());

app.post('/api/chat', async (req, res) => {
  try {
    const { question, manualId } = req.body || {};
    if (!question) {
      return res.status(400).json({ error: 'question is required' });
    }

    const result = await answerQuestion({ question, manualId });

    res.json({
      answer: result.answer,
      sources: result.sources.map(s => ({
        manual_id: s.manual_id,
        title: s.title,
        page: s.page,
        score: s.score
      }))
    });
  } catch (e) {
    console.error('API error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ✅ En enkel hälsokontroll (valfritt men praktiskt) */
app.get('/', (_, res) => res.send('OK'));
app.get('/health', (_, res) => res.json({ ok: true }));

const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log(`🚀 API listening on http://localhost:${port}`);
  console.log('POST /api/chat med { "question": "...", "manualId": "..." }');
});
