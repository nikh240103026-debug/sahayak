import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import type { Profile } from "@app/shared";

/**
 * A clearly fictional applicant used by tests and demos. Every document is
 * watermarked SAMPLE. None of these values belong to a real person.
 */
export const SAMPLE_VALUES: Record<string, string> = {
  full_name: "Ananya Rao",
  father_name: "Suresh Rao",
  date_of_birth: "2004-03-05",
  gender: "Female",
  category: "OBC",
  mobile: "9876543210",
  email: "ananya.sample@example.com",
  demo_id: "DEMO-4821-1937",
  state: "Maharashtra",
  district: "Pune",
  institution_name: "Shivneri Junior College of Science (Demo)",
  course: "B.Sc. Physics",
  year_of_study: "2",
  previous_exam: "Higher Secondary Certificate (Class XII)",
  board: "Maharashtra State Board (Sample)",
  passing_year: "2024",
  previous_percentage: "85.4",
  annual_family_income: "185000",
  income_certificate_number: "INC-2026-004512",
  bank_account_holder: "Ananya Rao",
  bank_account_number: "123456789012",
  bank_ifsc: "DEMO0001234",
};

export function confirmedProfile(values: Record<string, string> = SAMPLE_VALUES): Profile {
  const at = "2026-11-01T00:00:00.000Z";
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, { value: v, source: "manual", confirmed: true, confirmedAt: at }]),
  );
}

const FIXED_DATE = new Date("2026-10-01T00:00:00Z");

/** A small text-layer PDF with a diagonal SAMPLE watermark. Deterministic bytes for stable fixtures. */
export async function samplePdf(title: string, lines: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(FIXED_DATE);
  pdf.setModificationDate(FIXED_DATE);
  pdf.setProducer("sample-docs");
  pdf.setCreator("sample-docs");
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText("SAMPLE", {
    x: 120,
    y: 300,
    size: 120,
    font: bold,
    color: rgb(0.85, 0.2, 0.2),
    opacity: 0.18,
    rotate: degrees(35),
  });
  page.drawText(title, { x: 50, y: 780, size: 18, font: bold, color: rgb(0.1, 0.15, 0.2) });
  page.drawText("FICTIONAL SAMPLE DOCUMENT - NOT VALID FOR ANY PURPOSE", { x: 50, y: 758, size: 9, font, color: rgb(0.7, 0.1, 0.1) });
  lines.forEach((line, i) => page.drawText(line, { x: 50, y: 720 - i * 22, size: 12, font, color: rgb(0.1, 0.15, 0.2) }));
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

export async function sampleDocuments(v: Record<string, string> = SAMPLE_VALUES) {
  return {
    marksheet: await samplePdf("Statement of Marks (Sample)", [
      `Board: ${v.board}`,
      `Examination: ${v.previous_exam}`,
      `Candidate name: ${v.full_name}`,
      `Father's name: ${v.father_name}`,
      `Date of birth: 05/03/2004`,
      `Institution: ${v.institution_name}`,
      `Year of passing: ${v.passing_year}`,
      `Overall percentage: ${v.previous_percentage}%`,
    ]),
    income_certificate: await samplePdf("Income Certificate (Sample)", [
      `Certificate No.: ${v.income_certificate_number}`,
      `Issued to: ${v.father_name}`,
      `Annual family income: Rs. 1,85,000/-`,
      `Place: Pune (fictional office)`,
    ]),
    id_proof: await samplePdf("Demo ID Card (Sample)", [
      `Demo ID: ${v.demo_id}`,
      `Name: ${v.full_name}`,
      `Date of birth: 05/03/2004`,
      `Gender: ${v.gender}`,
      `Address: Kothrud, ${v.district}, ${v.state}`,
    ]),
  };
}
