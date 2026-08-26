export interface NormalizedTextResult {
  originalText: string;
  normalizedText: string;
  lineCount: number;
  wordCount: number;
}

/**
  Normalizes text for Qwen prompt input while preserving original verbatim text for evidence verification.
  - Standardizes line endings (\r\n -> \n)
  - Removes safe OCR artifacts / control characters
  - Preserves medication dosage strings, dates, units, and evidence text verbatim
  - Maintains original text untouched for evidence validation
 */
export function normalizeText(input: string): NormalizedTextResult {
  const originalText = input || '';
  if (!originalText.trim()) {
    return {
      originalText: '',
      normalizedText: '',
      lineCount: 0,
      wordCount: 0,
    };
  }

  const normalizedText = originalText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove non-printable control characters except line feeds and tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize excessive horizontal blank spaces without destroying line breaks
    .replace(/[ \t]+/g, ' ')
    // Normalize more than 3 consecutive blank lines to 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const lines = normalizedText.split('\n').filter((l) => l.trim().length > 0);
  const words = normalizedText.split(/\s+/).filter((w) => w.length > 0);

  return {
    originalText,
    normalizedText,
    lineCount: lines.length,
    wordCount: words.length,
  };
}
