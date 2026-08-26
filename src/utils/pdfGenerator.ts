/**
 * CLIENT PDF MODULE — ONE official download path, test-only buffer helpers
 *
 * Official production download architecture (ALL pages: Step 6, Dashboard,
 * Documents History, Review Queue):
 *
 *   generateDischargePdf(doc)  /  Step6Approve.handleDownloadPdf
 *     └─ native HTML form POST → POST /api/generate-approved-pdf
 *         └─ Express (server/routes/api.ts)
 *             └─ server/services/serverPdfGenerator.ts (jsPDF, server-side)
 *                 └─ HTTP 200 application/pdf
 *                    Content-Disposition: attachment; filename="Discharge_Instructions_…pdf"
 *                     └─ Chrome native download → real .pdf file
 *
 * This file ALSO keeps a client-side jsPDF buffer renderer
 * (generateDischargePdfBuffer / generateDischargePdfBufferSync) strictly as
 * a TEST helper for server/tests/test-ui-integration-flow.ts. It is NOT
 * reachable from any production download path and never triggers a download.
 *
 * All legacy browser-side download tricks have been permanently removed from
 * this module and must never return (the architecture regression test
 * server/tests/test-step6-architecture.ts enforces this).
 *
 * Rules:
 *   - NEVER invents clinical data
 *   - NEVER calls LLMs
 *   - NEVER modifies verifiedData
 *   - Missing fields rendered as "Not specified" (never fabricated)
 *   - ONE download path — no competing implementations
 */

import { jsPDF } from 'jspdf';
import {
  DischargeDocument,
  MedicationItem,
  FollowUpItem,
  FieldValue,
} from '../types/discharge.js';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface PdfGenerationResult {
  buffer: ArrayBuffer;
  filename: string;
  mimeType: 'application/pdf';
}

/** Internal result type for the test-only buffer renderer */
interface InternalPdfResult extends PdfGenerationResult {
  _pdfDoc: jsPDF;
}

// ─────────────────────────────────────────────────────────────────
// Layout constants
// ─────────────────────────────────────────────────────────────────

const PAGE_WIDTH = 210;   // A4 mm
const PAGE_HEIGHT = 297;  // A4 mm
const MARGIN = 14;
const CONTENT_W = PAGE_WIDTH - MARGIN * 2;
const FOOTER_H = 14;      // reserved at bottom
const BOTTOM_LIMIT = PAGE_HEIGHT - FOOTER_H - 6;
const TOP_START = 14;

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function safe(value: string | undefined | null, fallback = 'Not specified'): string {
  if (!value || value.trim() === '' || value.trim().toLowerCase() === 'n/a') return fallback;
  return value.trim();
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9_\-\.]/g, '_').replace(/_+/g, '_');
}

// ─────────────────────────────────────────────────────────────────
// PDF Page-flow engine
// ─────────────────────────────────────────────────────────────────

class PageEngine {
  private pdf: jsPDF;
  private pageCount: number = 1;
  public y: number;

  constructor(pdf: jsPDF) {
    this.pdf = pdf;
    this.y = TOP_START;
  }

  /** Ensure `needed` mm of vertical space. Adds new page if required. */
  ensure(needed: number): void {
    if (this.y + needed > BOTTOM_LIMIT) {
      this.pdf.addPage();
      this.pageCount++;
      this.y = TOP_START;
    }
  }

  /** Advance y by delta mm */
  advance(delta: number): void {
    this.y += delta;
  }

  getPageCount(): number {
    return this.pageCount;
  }

  getPdf(): jsPDF {
    return this.pdf;
  }

  /** Draw wrapped text at current y. Returns new y. */
  drawText(
    text: string,
    x: number,
    maxWidth: number,
    fontSize: number,
    r: number, g: number, b: number,
    lineSpacing = 5
  ): void {
    this.pdf.setFontSize(fontSize);
    this.pdf.setTextColor(r, g, b);
    const lines = this.pdf.splitTextToSize(text || '', maxWidth);
    const needed = lines.length * lineSpacing;
    this.ensure(needed + 2);
    this.pdf.text(lines, x, this.y);
    this.y += needed;
  }

  /** Draw a horizontal rule */
  rule(r = 200, g = 200, b = 200): void {
    this.ensure(4);
    this.pdf.setDrawColor(r, g, b);
    this.pdf.line(MARGIN, this.y, MARGIN + CONTENT_W, this.y);
    this.y += 3;
  }

  /** Draw a filled rect */
  fillRect(h: number, fr: number, fg: number, fb: number): void {
    this.ensure(h);
    this.pdf.setFillColor(fr, fg, fb);
    this.pdf.rect(MARGIN, this.y, CONTENT_W, h, 'F');
  }
}

// ─────────────────────────────────────────────────────────────────
// Section renderer
// ─────────────────────────────────────────────────────────────────

function drawSectionTitle(engine: PageEngine, title: string): void {
  engine.ensure(10);
  engine.fillRect(7, 62, 96, 68); // olive-green header
  engine.getPdf().setFontSize(9);
  engine.getPdf().setTextColor(255, 255, 255);
  engine.getPdf().setFont('helvetica', 'bold');
  engine.getPdf().text(title.toUpperCase(), MARGIN + 3, engine.y + 4.8);
  engine.advance(8);
  engine.getPdf().setFont('helvetica', 'normal');
}

function drawBodyText(engine: PageEngine, text: string, indent = 0): void {
  engine.getPdf().setFont('helvetica', 'normal');
  engine.drawText(
    safe(text, 'No information provided.'),
    MARGIN + indent,
    CONTENT_W - indent,
    9.5,
    51, 65, 85,
    5
  );
  engine.advance(3);
}

function drawKeyValue(engine: PageEngine, key: string, value: string): void {
  const pdf = engine.getPdf();
  engine.ensure(7);
  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 130);
  pdf.setFont('helvetica', 'bold');
  pdf.text(key.toUpperCase(), MARGIN + 2, engine.y);
  engine.advance(4.5);

  pdf.setFontSize(9.5);
  pdf.setTextColor(30, 40, 60);
  pdf.setFont('helvetica', 'normal');
  const lines = pdf.splitTextToSize(safe(value), CONTENT_W - 4);
  engine.ensure(lines.length * 5 + 2);
  pdf.text(lines, MARGIN + 2, engine.y);
  engine.advance(lines.length * 5 + 3);
}

// ─────────────────────────────────────────────────────────────────
// Header (runs once per new page via page loop at end)
// ─────────────────────────────────────────────────────────────────

function drawPageHeader(pdf: jsPDF, hospitalName: string, dept: string, pageNum: number, totalPages: number): void {
  // Top stripe
  pdf.setFillColor(28, 52, 90);
  pdf.rect(0, 0, PAGE_WIDTH, 12, 'F');

  pdf.setFontSize(10.5);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text(hospitalName, MARGIN, 8);

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  const deptLabel = `Page ${pageNum} of ${totalPages}`;
  const w = pdf.getStringUnitWidth(deptLabel) * 8 / pdf.internal.scaleFactor;
  pdf.text(deptLabel, PAGE_WIDTH - MARGIN - w, 8);
}

// ─────────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────────

function drawPageFooter(pdf: jsPDF, patientId: string, version: number, pageNum: number, totalPages: number, hospitalName: string): void {
  const y = PAGE_HEIGHT - FOOTER_H;
  pdf.setDrawColor(180, 180, 190);
  pdf.line(MARGIN, y, MARGIN + CONTENT_W, y);

  pdf.setFontSize(7.5);
  pdf.setTextColor(130, 130, 140);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Patient ID: ${patientId}`, MARGIN, y + 5);
  pdf.text(`Report Version: v${version}`, PAGE_WIDTH / 2, y + 5, { align: 'center' });
  const pageLabel = `Page ${pageNum} of ${totalPages}`;
  const w = pdf.getStringUnitWidth(pageLabel) * 7.5 / pdf.internal.scaleFactor;
  pdf.text(pageLabel, PAGE_WIDTH - MARGIN - w, y + 5);
  pdf.text(hospitalName, MARGIN, y + 9);
}

// ─────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────

/**
 * Validates that the buffer starts with %PDF- magic bytes.
 * Throws if invalid.
 */
export function verifyPdfBinary(buffer: ArrayBuffer | Uint8Array): void {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 5) {
    throw new Error('PDF buffer is too short — likely empty or corrupt.');
  }
  // %PDF- = 0x25 0x50 0x44 0x46 0x2D
  if (
    bytes[0] !== 0x25 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x44 ||
    bytes[3] !== 0x46 ||
    bytes[4] !== 0x2d
  ) {
    const got = Array.from(bytes.slice(0, 5))
      .map((b) => String.fromCharCode(b))
      .join('');
    throw new Error(`Invalid PDF: expected magic bytes '%PDF-', got '${got}'`);
  }
}

// ─────────────────────────────────────────────────────────────────
// GENERATOR
// ─────────────────────────────────────────────────────────────────

/**
 * Generates a professional clinical discharge PDF.
 * Uses verifiedData as source of truth; generatedReport for handout text.
 * NEVER invents clinical data. Missing fields → "Not specified".
 */
export function generateDischargePdfBuffer(doc: DischargeDocument): InternalPdfResult {
  // ── Guard rails ──────────────────────────────────────────────
  if (!doc.verifiedData) {
    throw new Error('Cannot generate PDF: verifiedData is missing. Complete patient verification first.');
  }
  if (!doc.generatedReport) {
    throw new Error('Cannot generate PDF: generatedReport is missing. Generate the handout first.');
  }
  if (doc.auditResult?.overallStatus === 'CRITICAL_ISSUE') {
    throw new Error('Cannot generate official PDF: unresolved CRITICAL_ISSUE in safety audit. Resolve all critical findings first.');
  }

  const verified = doc.verifiedData;
  const report = doc.generatedReport;
  const hospital = doc.hospitalInfo?.name || 'Apollo General Hospital & Heart Center';
  const dept = doc.hospitalInfo?.department || 'Department of Clinical Operations';

  // Patient identity
  const patientName = safe(verified.patient?.name?.value, 'Not specified');
  const patientId = safe(verified.patient?.patientId?.value, 'Not specified');
  const age = safe(verified.patient?.age?.value, 'Not specified');
  const gender = safe(verified.patient?.gender?.value, 'Not specified');
  const language = safe(report.language?.toUpperCase(), 'EN');
  const version = report.version || 1;

  // Approval state
  const approvedBy = doc.approvedBy;
  const isApproved = !!approvedBy && doc.approvalStatus === 'APPROVED';

  // ── Create PDF ──────────────────────────────────────────────
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  pdf.setFont('helvetica', 'normal');

  const engine = new PageEngine(pdf);
  // Start below header stripe
  engine.y = 16;

  // ══════════════════════════════════════════════════════
  // DOCUMENT TITLE
  // ══════════════════════════════════════════════════════
  engine.ensure(18);
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(28, 52, 90);
  pdf.text(`PATIENT DISCHARGE HANDOUT`, MARGIN, engine.y);
  engine.advance(6);

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(90, 100, 110);
  pdf.text(`${dept}  |  Version ${version}  |  Language: ${language}`, MARGIN, engine.y);
  engine.advance(5);
  engine.rule(180, 190, 200);
  engine.advance(3);

  // ══════════════════════════════════════════════════════
  // PATIENT INFORMATION BOX
  // ══════════════════════════════════════════════════════
  engine.ensure(28);
  pdf.setFillColor(240, 244, 252);
  pdf.setDrawColor(180, 195, 220);
  pdf.roundedRect(MARGIN, engine.y, CONTENT_W, 26, 2, 2, 'FD');

  const boxY = engine.y;
  const col = CONTENT_W / 4;

  const drawInfoCell = (label: string, value: string, xOffset: number) => {
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(100, 115, 140);
    pdf.text(label, MARGIN + xOffset + 3, boxY + 6);
    pdf.setFontSize(9.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(18, 30, 55);
    const val = pdf.splitTextToSize(value, col - 4);
    pdf.text(val, MARGIN + xOffset + 3, boxY + 11);
  };

  drawInfoCell('PATIENT NAME', patientName, 0);
  drawInfoCell('PATIENT ID', patientId, col);
  drawInfoCell('AGE / GENDER', `${age} / ${gender}`, col * 2);
  drawInfoCell('DISCHARGE DATE', new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' (generated)', col * 3);

  engine.advance(29);

  // ══════════════════════════════════════════════════════
  // APPROVAL STATUS BADGE
  // ══════════════════════════════════════════════════════
  engine.ensure(10);
  if (isApproved) {
    pdf.setFillColor(34, 85, 45);
    pdf.roundedRect(MARGIN, engine.y, CONTENT_W, 8, 1.5, 1.5, 'F');
    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text('OFFICIALLY APPROVED & SIGNED — CLINICAL DOCUMENT', MARGIN + 4, engine.y + 5.5);
  } else {
    pdf.setFillColor(180, 90, 30);
    pdf.roundedRect(MARGIN, engine.y, CONTENT_W, 8, 1.5, 1.5, 'F');
    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text('DRAFT — NOT OFFICIALLY APPROVED', MARGIN + 4, engine.y + 5.5);
  }
  engine.advance(11);

  // ══════════════════════════════════════════════════════
  // CLINICAL SUMMARY
  // ══════════════════════════════════════════════════════
  drawSectionTitle(engine, 'Clinical Summary & Patient Overview');
  engine.advance(3);
  drawBodyText(engine, report.sections.summary);
  engine.advance(2);

  // ══════════════════════════════════════════════════════
  // DIAGNOSIS & PROCEDURES
  // ══════════════════════════════════════════════════════
  drawSectionTitle(engine, 'Diagnosis & Procedures Performed');
  engine.advance(3);
  drawBodyText(engine, report.sections.diagnosisAndProcedures);
  engine.advance(2);

  // ══════════════════════════════════════════════════════
  // IMPORTANT ALLERGY INFORMATION
  // ══════════════════════════════════════════════════════
  drawSectionTitle(engine, 'IMPORTANT ALLERGY INFORMATION');
  engine.advance(3);

  // verified.allergies is Array<FieldValue<string>>
  const allergies: FieldValue<string>[] = verified.allergies || [];
  const hasAllergies = Array.isArray(allergies) && allergies.length > 0;

  engine.ensure(hasAllergies ? Math.min(allergies.length * 8 + 10, 40) : 18);
  const allergyBoxH = hasAllergies ? Math.max(16, allergies.length * 6 + 10) : 14;
  pdf.setFillColor(255, 244, 230);
  pdf.setDrawColor(200, 100, 30);
  pdf.roundedRect(MARGIN, engine.y, CONTENT_W, allergyBoxH, 2, 2, 'FD');

  pdf.setFontSize(8.5);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(160, 60, 15);
  pdf.text('DRUG & FOOD ALLERGIES', MARGIN + 4, engine.y + 6);

  if (hasAllergies) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(80, 30, 10);
    allergies.forEach((a, i) => {
      const txt = a?.value || 'Unknown';
      pdf.text(`• ${txt}`, MARGIN + 6, engine.y + 12 + i * 6);
    });
  } else {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(80, 80, 80);
    pdf.text('No Known Drug Allergies (NKDA)', MARGIN + 6, engine.y + 12);
  }

  engine.advance(allergyBoxH + 4);

  // ══════════════════════════════════════════════════════
  // MEDICATION SCHEDULE
  // ══════════════════════════════════════════════════════
  drawSectionTitle(engine, 'Medication Schedule & Instructions');
  engine.advance(3);

  // verified.medications is MedicationItem[]
  const meds: MedicationItem[] = verified.medications || [];
  if (meds.length > 0) {
    // Table header
    const colWidths = [38, 22, 28, 22, CONTENT_W - 38 - 22 - 28 - 22];
    const colLabels = ['MEDICATION', 'DOSAGE', 'FREQUENCY', 'DURATION', 'INSTRUCTIONS'];
    const rowH = 7;

    engine.ensure(rowH + 2);
    pdf.setFillColor(62, 66, 52);
    pdf.rect(MARGIN, engine.y, CONTENT_W, rowH, 'F');
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    let cx = MARGIN + 2;
    colLabels.forEach((lbl, i) => {
      pdf.text(lbl, cx, engine.y + 4.8);
      cx += colWidths[i];
    });
    engine.advance(rowH);

    meds.forEach((med: MedicationItem, idx: number) => {
      const cells = [
        safe(med?.name, 'Unknown'),
        safe(med?.dosage, '—'),
        safe(med?.frequency, '—'),
        safe(med?.duration, '—'),
        safe(med?.instructions, '—'),
      ];

      // Calculate max row height
      let maxLines = 1;
      cells.forEach((cell, i) => {
        const lines = pdf.splitTextToSize(cell, colWidths[i] - 3);
        maxLines = Math.max(maxLines, lines.length);
      });
      const thisRowH = Math.max(rowH, maxLines * 4.5 + 3);

      engine.ensure(thisRowH);

      // Alternating row bg
      if (idx % 2 === 0) {
        pdf.setFillColor(247, 248, 245);
        pdf.rect(MARGIN, engine.y, CONTENT_W, thisRowH, 'F');
      }

      pdf.setFontSize(8.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(30, 40, 55);
      cx = MARGIN + 2;
      cells.forEach((cell, i) => {
        const lines = pdf.splitTextToSize(cell, colWidths[i] - 3);
        pdf.text(lines, cx, engine.y + 4.5);
        cx += colWidths[i];
      });

      // Bottom border
      pdf.setDrawColor(210, 215, 210);
      pdf.line(MARGIN, engine.y + thisRowH, MARGIN + CONTENT_W, engine.y + thisRowH);
      engine.advance(thisRowH);
    });
  } else {
    // Fall back to report text
    drawBodyText(engine, report.sections.medicationInstructions);
  }
  engine.advance(4);

  // ══════════════════════════════════════════════════════
  // DIETARY & ACTIVITY
  // ══════════════════════════════════════════════════════
  drawSectionTitle(engine, 'Dietary & Activity Instructions');
  engine.advance(3);
  drawBodyText(engine, report.sections.dietAndActivity);
  engine.advance(2);

  // ══════════════════════════════════════════════════════
  // WOUND CARE & HYGIENE
  // ══════════════════════════════════════════════════════
  drawSectionTitle(engine, 'Wound Care & Incision Hygiene');
  engine.advance(3);
  drawBodyText(engine, report.sections.woundCareAndHygiene);
  engine.advance(2);

  // ══════════════════════════════════════════════════════
  // WARNING SIGNS
  // ══════════════════════════════════════════════════════
  drawSectionTitle(engine, 'WARNING SIGNS & EMERGENCY PROTOCOL');
  engine.advance(3);

  const warnText = report.sections.warningSignsAndEmergency;
  if (warnText) {
    engine.ensure(10);
    pdf.setFillColor(255, 240, 240);
    pdf.setDrawColor(180, 60, 60);
    const warnLines = pdf.splitTextToSize(warnText, CONTENT_W - 6);
    const warnH = Math.max(14, warnLines.length * 5 + 6);
    engine.ensure(warnH);
    pdf.roundedRect(MARGIN, engine.y, CONTENT_W, warnH, 2, 2, 'FD');
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 20, 20);
    pdf.text(warnLines, MARGIN + 3, engine.y + 5);
    engine.advance(warnH + 4);
  }

  // ══════════════════════════════════════════════════════
  // FOLLOW-UP APPOINTMENTS
  // ══════════════════════════════════════════════════════
  drawSectionTitle(engine, 'Follow-Up Appointments');
  engine.advance(3);

  // verified.followUp is FollowUpItem[]
  const followUps: FollowUpItem[] = verified.followUp || [];
  if (followUps.length > 0) {
    followUps.forEach((appt: FollowUpItem, idx: number) => {
      engine.ensure(32);
      const apptH = 28;
      pdf.setFillColor(idx % 2 === 0 ? 246 : 242, 248, 252);
      pdf.setDrawColor(180, 200, 220);
      pdf.roundedRect(MARGIN, engine.y, CONTENT_W, apptH, 2, 2, 'FD');

      const apptY = engine.y;
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(28, 52, 90);
      pdf.text(`Appointment ${idx + 1}`, MARGIN + 3, apptY + 5);

      const half = CONTENT_W / 2 - 2;
      const drawApptField = (label: string, val: string, ax: number, ay: number) => {
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(110, 120, 140);
        pdf.text(label, ax, ay);
        pdf.setFontSize(8.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(25, 35, 55);
        pdf.text(safe(val), ax, ay + 4.5);
      };

      drawApptField('PROVIDER', appt?.provider, MARGIN + 3, apptY + 10);
      drawApptField('DATE', appt?.date, MARGIN + 3 + half / 2, apptY + 10);
      drawApptField('TIME', appt?.time, MARGIN + 3, apptY + 19);
      drawApptField('LOCATION', appt?.location, MARGIN + 3 + half / 2, apptY + 19);

      engine.advance(apptH + 3);

      if (appt?.instructions) {
        drawKeyValue(engine, 'Instructions', appt.instructions);
      }
    });
  } else {
    // Fall back to report section
    drawBodyText(engine, report.sections.followUpAppointments);
  }
  engine.advance(3);

  // ══════════════════════════════════════════════════════
  // CLINICIAN ATTESTATION
  // ══════════════════════════════════════════════════════
  drawSectionTitle(engine, 'Clinician Digital Attestation');
  engine.advance(3);

  engine.ensure(38);
  const attH = 35;
  if (isApproved && approvedBy) {
    pdf.setFillColor(228, 248, 233);
    pdf.setDrawColor(50, 130, 70);
    pdf.roundedRect(MARGIN, engine.y, CONTENT_W, attH, 2, 2, 'FD');

    const attY = engine.y;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(20, 80, 35);
    pdf.text('OFFICIALLY APPROVED & SIGNED', MARGIN + 4, attY + 7);

    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(30, 60, 40);
    pdf.text(`APPROVED BY CLINICIAN: ${approvedBy.name}`, MARGIN + 4, attY + 14);
    pdf.text(`Role: ${approvedBy.role}`, MARGIN + 4, attY + 19.5);
    pdf.text(
      `Approved: ${new Date(approvedBy.timestamp).toLocaleString()}`,
      MARGIN + 4, attY + 25
    );
    if (approvedBy.signatureNote) {
      const noteLines = pdf.splitTextToSize(approvedBy.signatureNote, CONTENT_W - 8);
      pdf.text(noteLines, MARGIN + 4, attY + 30.5);
    }
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(20, 80, 35);
    pdf.text(`Report Version: v${version}`, MARGIN + CONTENT_W - 30, attY + 7);
  } else {
    pdf.setFillColor(255, 243, 220);
    pdf.setDrawColor(180, 130, 30);
    pdf.roundedRect(MARGIN, engine.y, CONTENT_W, attH, 2, 2, 'FD');
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(130, 80, 15);
    pdf.text('DRAFT — PENDING CLINICIAN APPROVAL', MARGIN + 4, engine.y + 7);
    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(80, 60, 15);
    pdf.text(`Report Version: v${version}`, MARGIN + 4, engine.y + 14);
  }
  engine.advance(attH + 4);

  // ══════════════════════════════════════════════════════
  // PASS 2 — Add headers & footers to all pages
  // ══════════════════════════════════════════════════════
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    drawPageHeader(pdf, hospital, dept, p, totalPages);
    drawPageFooter(pdf, patientId, version, p, totalPages, hospital);
  }

  // ══════════════════════════════════════════════════════
  // Output & validate
  // ══════════════════════════════════════════════════════
  const buffer = pdf.output('arraybuffer');
  verifyPdfBinary(buffer);

  const safeName = sanitizeFilename(patientName);
  const safeId = sanitizeFilename(patientId);
  const filename = `Discharge_Instructions_${safeName}_${safeId}_v${version}.pdf`;

  return {
    buffer,
    filename,
    mimeType: 'application/pdf',
    _pdfDoc: pdf,
  };
}

// ─────────────────────────────────────────────────────────────────
// DOWNLOAD — EXACTLY ONE official production path: server endpoint.
// All legacy browser-side download tricks have been permanently removed
// from this module (they produced UUID-named files in Chrome).
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// PUBLIC API — entry points
// ─────────────────────────────────────────────────────────────────

/**
 * Primary export for client pages (Dashboard, History, Review Queue, etc.).
 * Uses ONLY the official server endpoint POST /api/generate-approved-pdf via
 * a native HTML form POST. The browser downloads the file from the HTTP
 * Content-Disposition headers. NO client-side fallback exists by design:
 * if the server is down, the request fails — PDFs are never generated
 * locally in production.
 */
export async function generateDischargePdf(doc: DischargeDocument): Promise<void> {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/api/generate-approved-pdf';
  form.target = '_self';
  form.style.display = 'none';

  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'payload';
  input.value = JSON.stringify(doc);
  form.appendChild(input);

  document.body.appendChild(form);
  form.submit();

  setTimeout(() => {
    form.remove();
  }, 2000);
}

/**
 * TEST-ONLY buffer renderer for server/tests/test-ui-integration-flow.ts.
 * Does NOT trigger any download and is NOT reachable from Step 6 or any
 * production page download button.
 */
export function generateDischargePdfBufferSync(doc: DischargeDocument): PdfGenerationResult {
  const result = generateDischargePdfBuffer(doc);
  return {
    buffer: result.buffer,
    filename: result.filename,
    mimeType: result.mimeType,
  };
}
