// shortcut: line/semicolon clauses are conservative text boundaries, not a clinical language parser.
export function medicationLines(text: string, name: string): string[] {
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escaped) return [];
  const pattern = new RegExp('(?<![a-z0-9])' + escaped + '(?![a-z0-9])', 'i');
  return text.split(/[\n;]/).filter(line => pattern.test(line));
}

export const medicationReviewContext = /\b(?:do not take|don['’]t take|stop(?:ped)?|discontinu(?:e|ed)|historical|previously|conflicting|uncertain)\b/i;
