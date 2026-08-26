import { createRequire } from 'module';
import { createWorker } from 'tesseract.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { normalizeText, NormalizedTextResult } from './textNormalizationService.js';

let pdfParse: any;
try {
  const req = typeof require !== 'undefined' ? require : createRequire(import.meta.url || 'file:///' + __filename);
  pdfParse = req('pdf-parse');
} catch {
  pdfParse = null;
}

export interface OcrQualityMetrics {
  characterCount: number;
  wordCount: number;
  nonAlphanumericRatio: number;
  singleCharTokenRatio: number;
  qualityStatus: 'EXCELLENT' | 'GOOD' | 'POOR' | 'UNUSABLE';
  score: number;
}

export interface DocumentSourceResult {
  originalText: string;
  sourceText: string;
  normalizedText: string;
  sourceType: 'pdf' | 'image' | 'text';
  extractionMethod: 'pdf-parse' | 'tesseract-ocr' | 'paddle-ocr' | 'direct-text';
  pageCount?: number;
  ocrQuality?: OcrQualityMetrics;
}

/**
 * Generic OCR Quality Gate Diagnostic Function.
 * Evaluates raw text for generic structural quality markers without patient/drug-specific rules.
 */
export function calculateOcrQuality(rawText: string, pageCount: number = 1): OcrQualityMetrics {
  const text = (rawText || '').trim();
  const characterCount = text.length;

  if (characterCount === 0) {
    return {
      characterCount: 0,
      wordCount: 0,
      nonAlphanumericRatio: 1.0,
      singleCharTokenRatio: 1.0,
      qualityStatus: 'UNUSABLE',
      score: 0,
    };
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  const wordCount = tokens.length;

  // Generic metric 1: Non-alphanumeric ratio (ignoring normal punctuation: . , - : / ( ) % )
  const garbledPunctuation = text.replace(/[\w\s\.,\-\:\/\%\(\)]/g, '');
  const nonAlphanumericRatio = garbledPunctuation.length / Math.max(1, characterCount);

  // Generic metric 2: Single-character token ratio (excluding valid isolated chars like 'a', 'A', 'I', and digits)
  const singleCharTokens = tokens.filter(
    (t) => t.length === 1 && !/^[aAI0-9]$/.test(t)
  ).length;
  const singleCharTokenRatio = singleCharTokens / Math.max(1, wordCount);

  let score = 100;

  // Deduct for garbled punctuation
  score -= Math.min(60, Math.round(nonAlphanumericRatio * 200));

  // Deduct for single-character noise tokens
  score -= Math.min(40, Math.round(singleCharTokenRatio * 150));

  // Deduct if character count per page is abnormally low (< 40 chars per page)
  const avgCharPerPage = characterCount / Math.max(1, pageCount);
  if (avgCharPerPage < 40) {
    score -= 30;
  }

  score = Math.max(0, Math.min(100, score));

  let qualityStatus: 'EXCELLENT' | 'GOOD' | 'POOR' | 'UNUSABLE';
  if (score >= 80 && avgCharPerPage >= 60) {
    qualityStatus = 'EXCELLENT';
  } else if (score >= 55) {
    qualityStatus = 'GOOD';
  } else if (score >= 30) {
    qualityStatus = 'POOR';
  } else {
    qualityStatus = 'UNUSABLE';
  }

  return {
    characterCount,
    wordCount,
    nonAlphanumericRatio: Math.round(nonAlphanumericRatio * 1000) / 1000,
    singleCharTokenRatio: Math.round(singleCharTokenRatio * 1000) / 1000,
    qualityStatus,
    score,
  };
}

export async function extractDocumentSource(input: {
  fileBuffer?: Buffer;
  mimeType?: string;
  fileName?: string;
  textInput?: string;
}): Promise<DocumentSourceResult> {
  // Case 1: Plain text input provided directly
  if (input.textInput && input.textInput.trim().length > 0) {
    const norm = normalizeText(input.textInput);
    return {
      originalText: norm.originalText,
      sourceText: norm.originalText,
      normalizedText: norm.normalizedText,
      sourceType: 'text',
      extractionMethod: 'direct-text',
      ocrQuality: calculateOcrQuality(norm.normalizedText, 1),
    };
  }

  if (!input.fileBuffer || input.fileBuffer.length === 0) {
    return {
      originalText: '',
      sourceText: '',
      normalizedText: '',
      sourceType: 'text',
      extractionMethod: 'direct-text',
      ocrQuality: calculateOcrQuality('', 1),
    };
  }

  const mimeType = input.mimeType || '';
  const fileName = input.fileName || '';
  const isPdf = mimeType.includes('pdf') || fileName.endsWith('.pdf');
  const isImage = mimeType.includes('image') || /\.(png|jpg|jpeg|webp)$/i.test(fileName);

  // Case 2: PDF Document
  if (isPdf) {
    console.log(`[PDF DEBUG] Processing PDF upload: fileName=${fileName} mimeType=${mimeType} bufferBytes=${input.fileBuffer.length}`);
    const pdfRes = await processPdfBuffer(input.fileBuffer);

    console.log(`[PDF DEBUG] PDF extraction complete: method=${pdfRes.extractionMethod} textLength=${pdfRes.normalizedText.length} pageCount=${pdfRes.pageCount} quality=${pdfRes.ocrQuality?.qualityStatus}`);
    if (pdfRes.normalizedText) {
      console.log(`[PDF DEBUG] sourceTextPreview (first 500 chars):\n${pdfRes.normalizedText.substring(0, 500)}`);
    } else {
      console.warn('[PDF DEBUG] WARNING: PDF extraction produced 0 readable characters.');
    }

    return pdfRes;
  }

  // Case 3: Image Document (PNG / JPG / WEBP)
  if (isImage) {
    console.log(`[IMAGE DEBUG] Processing image upload: fileName=${fileName} mimeType=${mimeType} bufferBytes=${input.fileBuffer.length}`);
    try {
      const ocrRes = await runMultiEngineOcr(input.fileBuffer, 1);
      const norm = normalizeText(ocrRes.text);
      const ocrQuality = calculateOcrQuality(norm.normalizedText, 1);

      console.log(`[IMAGE DEBUG] Image OCR text length: ${norm.normalizedText.length} method=${ocrRes.method} quality=${ocrQuality.qualityStatus}`);
      return {
        originalText: norm.originalText,
        sourceText: norm.originalText,
        normalizedText: norm.normalizedText,
        sourceType: 'image',
        extractionMethod: ocrRes.method,
        ocrQuality,
      };
    } catch (err) {
      console.warn('[IMAGE DEBUG] Local image OCR warning:', err);
    }
  }

  // Fallback text decoding for text buffers
  try {
    const rawText = input.fileBuffer.toString('utf-8').trim();
    const norm = normalizeText(rawText);
    return {
      originalText: norm.originalText,
      sourceText: norm.originalText,
      normalizedText: norm.normalizedText,
      sourceType: 'text',
      extractionMethod: 'direct-text',
      ocrQuality: calculateOcrQuality(norm.normalizedText, 1),
    };
  } catch {
    return {
      originalText: '',
      sourceText: '',
      normalizedText: '',
      sourceType: 'text',
      extractionMethod: 'direct-text',
      ocrQuality: calculateOcrQuality('', 1),
    };
  }
}

async function processPdfBuffer(fileBuffer: Buffer): Promise<DocumentSourceResult> {
  let digitalText = '';
  let pageCount = 0;
  let pdfInstance: any = null;

  // 1. Digital Text Extraction via pdf-parse v2 / v1
  try {
    if (pdfParse) {
      if (pdfParse.PDFParse) {
        // pdf-parse v2 API
        pdfInstance = new pdfParse.PDFParse({ data: fileBuffer });
        if (typeof pdfInstance.load === 'function') {
          await pdfInstance.load();
        }
        if (typeof pdfInstance.getText === 'function') {
          const res = await pdfInstance.getText();
          if (typeof res === 'string') {
            digitalText = res.trim();
          } else if (res && typeof res.text === 'string') {
            digitalText = res.text.trim();
            pageCount = res.total || res.pages?.length || 0;
          }
        }
      } else {
        // pdf-parse v1 API fallback
        const fn = typeof pdfParse === 'function' ? pdfParse : pdfParse.default;
        if (typeof fn === 'function') {
          const res = await fn(fileBuffer);
          digitalText = (res?.text || '').trim();
          pageCount = res?.numpages || 0;
        }
      }
    }
  } catch (err: any) {
    console.warn('[PDF DEBUG] Digital text extraction warning:', err?.message || err);
  }

  const digitalNorm = normalizeText(digitalText);
  const digitalQuality = calculateOcrQuality(digitalNorm.normalizedText, pageCount || 1);

  // If digital text is sufficient (>= 30 chars), use it directly
  if (digitalNorm.normalizedText.length >= 30) {
    return {
      originalText: digitalNorm.originalText,
      sourceText: digitalNorm.originalText,
      normalizedText: digitalNorm.normalizedText,
      sourceType: 'pdf',
      extractionMethod: 'pdf-parse',
      pageCount,
      ocrQuality: digitalQuality,
    };
  }

  // 2. Scanned PDF Fallback via Multi-Engine OCR (Tesseract / PaddleOCR) on PDF Page Screenshots
  console.log('[PDF DEBUG] Digital text insufficient (< 30 chars). Attempting scanned PDF page OCR...');
  let ocrCombinedText = '';
  let selectedMethod: 'tesseract-ocr' | 'paddle-ocr' = 'tesseract-ocr';

  try {
    if (pdfInstance && typeof pdfInstance.getScreenshot === 'function') {
      const screenshots = await pdfInstance.getScreenshot();
      const pages = screenshots?.pages || [];
      pageCount = pages.length || pageCount;

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        if (page?.data) {
          const pageBuffer = Buffer.from(page.data);
          const ocrRes = await runMultiEngineOcr(pageBuffer, pageCount || 1);
          selectedMethod = ocrRes.method;
          if (ocrRes.text) {
            ocrCombinedText += (ocrCombinedText ? '\n\n' : '') + ocrRes.text;
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('[PDF DEBUG] Scanned PDF page OCR warning:', err?.message || err);
  }

  const ocrNorm = normalizeText(ocrCombinedText);
  const ocrQuality = calculateOcrQuality(ocrNorm.normalizedText, pageCount || 1);

  if (ocrNorm.normalizedText.length >= 30) {
    return {
      originalText: ocrNorm.originalText,
      sourceText: ocrNorm.originalText,
      normalizedText: ocrNorm.normalizedText,
      sourceType: 'pdf',
      extractionMethod: selectedMethod,
      pageCount,
      ocrQuality,
    };
  }

  // Fallback if content < 30 chars
  const fallbackNorm = digitalNorm.normalizedText.length > 0 ? digitalNorm : ocrNorm;
  const fallbackQuality = calculateOcrQuality(fallbackNorm.normalizedText, pageCount || 1);

  return {
    originalText: fallbackNorm.originalText,
    sourceText: fallbackNorm.originalText,
    normalizedText: fallbackNorm.normalizedText,
    sourceType: 'pdf',
    extractionMethod: digitalNorm.normalizedText.length > 0 ? 'pdf-parse' : selectedMethod,
    pageCount,
    ocrQuality: fallbackQuality,
  };
}

/**
 * Runs OCR using Tesseract (pure WASM) and attempts PaddleOCR if available.
 * Selects the result with the higher generic OCR quality score.
 * Worker processes are strictly terminated immediately after execution.
 */
async function runMultiEngineOcr(
  imageBuffer: Buffer,
  pageCount: number = 1
): Promise<{ text: string; method: 'tesseract-ocr' | 'paddle-ocr'; quality: OcrQualityMetrics }> {
  // Strategy 1: Tesseract.js (pure WASM CPU worker)
  let tesseractText = '';
  let worker: any = null;
  try {
    worker = await createWorker('eng');
    const ret = await worker.recognize(imageBuffer);
    await worker.terminate();
    worker = null;
    tesseractText = (ret.data.text || '').trim();
  } catch (err: any) {
    if (worker) {
      try {
        await worker.terminate();
      } catch {}
    }
    console.error('[TESSERACT OCR ERROR]:', err?.message || err);
  }

  const tesseractQuality = calculateOcrQuality(tesseractText, pageCount);

  // Strategy 2: Python PaddleOCR (if available on system)
  let paddleText = '';
  let paddleQuality: OcrQualityMetrics = {
    characterCount: 0,
    wordCount: 0,
    nonAlphanumericRatio: 1.0,
    singleCharTokenRatio: 1.0,
    qualityStatus: 'UNUSABLE',
    score: 0,
  };

  try {
    const tmpDir = os.tmpdir();
    const tmpImgPath = path.join(tmpDir, `ocr_page_${Date.now()}_${Math.random().toString(36).substring(7)}.png`);
    const tmpPyPath = path.join(tmpDir, `run_paddle_${Date.now()}_${Math.random().toString(36).substring(7)}.py`);

    fs.writeFileSync(tmpImgPath, imageBuffer);

    const pyCode = `import sys
from paddleocr import PaddleOCR
try:
    ocr = PaddleOCR(lang='en')
    result = ocr.ocr(r'${tmpImgPath}', cls=False)
    lines = []
    if result and result[0]:
        for res in result[0]:
            lines.append(res[1][0])
    print('\\n'.join(lines))
except Exception as e:
    sys.stderr.write(str(e))
`;
    fs.writeFileSync(tmpPyPath, pyCode);

    const resStr = execSync(`python "${tmpPyPath}"`, { encoding: 'utf-8', timeout: 30000 });
    paddleText = resStr.trim();

    if (fs.existsSync(tmpImgPath)) fs.unlinkSync(tmpImgPath);
    if (fs.existsSync(tmpPyPath)) fs.unlinkSync(tmpPyPath);

    paddleQuality = calculateOcrQuality(paddleText, pageCount);
  } catch (err) {
    // PaddleOCR not available or failed — fallback cleanly to Tesseract
  }

  // Select the OCR result with the higher generic quality score
  if (paddleQuality.score > tesseractQuality.score && paddleText.length >= 20) {
    console.log(`[OCR ENGINE SELECTED] PaddleOCR (Score: ${paddleQuality.score} vs Tesseract: ${tesseractQuality.score})`);
    return {
      text: paddleText,
      method: 'paddle-ocr',
      quality: paddleQuality,
    };
  }

  console.log(`[OCR ENGINE SELECTED] Tesseract.js (Score: ${tesseractQuality.score} vs PaddleOCR: ${paddleQuality.score})`);
  return {
    text: tesseractText,
    method: 'tesseract-ocr',
    quality: tesseractQuality,
  };
}
