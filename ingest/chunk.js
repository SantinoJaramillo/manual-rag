/**
 * PURPOSE:
 *   Dela upp lång text i överlappande bitar ("chunks") för embeddings.
 *
 * PARAMS:
 *   - min/max: ungefärlig ordlängd per chunk (t.ex. 250–500)
 *   - overlap: hur stor överlappning så att kontext inte tappas (0.1–0.15)
 *
 * TIPS:
 *   - Mindre chunks (200–350 ord) → mer precisa, men fler API-calls
 *   - Större chunks (400–600 ord) → billigare, men kan bli "noisigare"
 */
export function chunkText(text, { min = 250, max = 500, overlap = 0.12 } = {}) {
  const words = text.split(/\s+/);
  const target = Math.floor((min + max) / 2); // mittpunkten, t.ex. 375
  const step = Math.max(1, Math.floor(target * (1 - overlap))); // hur långt vi hoppar

  const chunks = [];
  for (let i = 0; i < words.length; i += step) {
    const slice = words.slice(i, i + target);
    if (!slice.length) break;
    chunks.push(slice.join(' '));
  }
  return chunks;
}
