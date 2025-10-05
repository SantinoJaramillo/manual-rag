import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';

async function main() {
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const stats = await pc.index(process.env.PINECONE_INDEX).describeIndexStats();
  console.log(JSON.stringify(stats, null, 2));
}
main().catch(console.error);
