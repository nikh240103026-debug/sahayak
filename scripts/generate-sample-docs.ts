/**
 * npm run sample-docs — write clearly synthetic documents (watermarked SAMPLE,
 * fictional names) to ./sample-docs for demos. Never use real documents in demos.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLE_VALUES, sampleDocuments } from "../e2e/support/sample-applicant";

async function main() {
  const dir = "sample-docs";
  mkdirSync(dir, { recursive: true });
  const docs = await sampleDocuments();
  for (const [kind, bytes] of Object.entries(docs)) {
    writeFileSync(join(dir, `sample-${kind.replace(/_/g, "-")}.pdf`), bytes);
  }
  writeFileSync(
    join(dir, "README.txt"),
    [
      "These are FICTIONAL SAMPLE documents for demos. They are not valid for any purpose.",
      `Applicant: ${SAMPLE_VALUES.full_name}, Demo ID ${SAMPLE_VALUES.demo_id}, date of birth 05/03/2004.`,
      "Upload them in the app when it asks for a marksheet, an income certificate and a Demo ID card.",
      "",
    ].join("\n"),
  );
  console.log(`Wrote ${Object.keys(docs).length} sample documents to ./${dir}`);
}

void main();
