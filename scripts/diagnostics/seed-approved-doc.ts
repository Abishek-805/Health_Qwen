/**
 * Seeds ONE fully-approved document into the RUNNING server's in-memory
 * repository via the real POST /api/discharge-documents endpoint.
 * Used to prepare the real-browser Step 6 download test.
 *
 * Usage: npx tsx scripts/diagnostics/seed-approved-doc.ts
 */
import { mockApprovedDoc } from '../../server/tests/fixtures/pdfTestDocument';

const BASE = 'http://localhost:3000';

async function run() {
  const res = await fetch(`${BASE}/api/discharge-documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mockApprovedDoc),
  });
  if (!res.ok) {
    console.error('Seed failed:', res.status, await res.text());
    process.exit(1);
  }
  const saved = await res.json();
  console.log(`Seeded approved document: id=${saved.id} patient=${saved.patientName} status=${saved.approvalStatus}`);

  const list = await fetch(`${BASE}/api/discharge-documents`);
  const docs: any[] = await list.json();
  console.log(`Repository now holds ${docs.length} document(s).`);
}

run().catch((e) => {
  console.error('Seed error:', e);
  process.exit(1);
});
