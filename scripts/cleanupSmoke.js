/**
 * PURPOSE:
 *   Städa bort smoke-testdata i Pinecone.
 *
 * GÖR:
 *   1) Tar bort alla poster med metadata.title === "Smoke Test" i ditt namespace
 *   2) Tar bort den fasta (idempotenta) smoke-vektorn om du använder den
 *   3) (Valfritt) Kan radera HELA namespace om du avkommenterar raden längst ned
 *
 * KRÄVER (.env):
 *   PINECONE_API_KEY, PINECONE_INDEX, DEV_TENANT_ID
 */
import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';

async function main() {
  const { PINECONE_API_KEY, PINECONE_INDEX, DEV_TENANT_ID } = process.env;
  if (!PINECONE_API_KEY || !PINECONE_INDEX || !DEV_TENANT_ID) {
    throw new Error('Saknar env: PINECONE_API_KEY, PINECONE_INDEX, DEV_TENANT_ID');
  }

  const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
  const ns = String(DEV_TENANT_ID);

  console.log('Index     :', PINECONE_INDEX);
  console.log('Namespace :', ns);

  // Targeta namespace för dataoperationer
  const nsIndex = pc.index(PINECONE_INDEX).namespace(ns);

  // 1) Radera via metadata-filter (alla "Smoke Test") – använder deleteMany(filter)
  //    Obs: i v2/v6 raderas via "deleteMany" och filterobjekt (likhet)
  //    Docs: deleteMany + filter-exempel. 
  await nsIndex.deleteMany({ title: 'Smoke Test' });

  // 2) Radera den idempotenta smoketest-vektorn (om du kör fast ID i smokeTest.js)
  const SMOKE_ID = `${ns}:smoke:none:1`;
  try {
    await nsIndex.deleteOne(SMOKE_ID);
  } catch {
    // Ignorera om den inte finns
  }

  console.log('✅ Rensning klar.');

  // 3) (VALFRITT) Radera hela namespace (alla poster) på en gång:
  //    Kräver serverless-index. Använd sparsamt.
  //    await pc.index(PINECONE_INDEX).deleteNamespace(ns); // raderar allt i ns
}

main().catch((err) => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
