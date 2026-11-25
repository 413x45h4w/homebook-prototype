export interface InstructionHit {
  match: boolean;
  reasons: string[];
}

const RULES: { re: RegExp; reason: string }[] = [
  { re: /\bplease\b/i, reason: 'it says “please”' },
  { re: /\balways\b/i, reason: 'it says “always”' },
  { re: /\b(don't|do not|never)\b/i, reason: 'it sets a boundary' },
  { re: /\b(make sure|be sure|remember to)\b/i, reason: 'it asks someone to remember' },
  {
    re: /^(leave|lock|water|feed|walk|use|put|keep|avoid|check|turn|close|open|wipe|vacuum|text|hang|fold|refill)\b/i,
    reason: 'it starts with an imperative',
  },
];

/**
 * A light heuristic for “this message is a household instruction.”
 * Scheduling talk (“can we move Thursday”) is not an instruction.
 * Messages that already carry a booking proposal are skipped.
 */
export function detectInstruction(text: string, opts?: { hasProposal?: boolean }): InstructionHit {
  const trimmed = text.trim();
  if (opts?.hasProposal || trimmed.length < 12) return { match: false, reasons: [] };

  const scheduling = /\b(reschedule|can we move|are you free|what time|add a (walk|visit|lesson|clean)|book|could we move)\b/i.test(
    trimmed,
  );
  const hardRule = /\b(please always|don't|do not|never)\b/i.test(trimmed);
  if (scheduling && !hardRule) return { match: false, reasons: [] };

  const reasons = RULES.filter((rule) => rule.re.test(trimmed)).map((rule) => rule.reason);
  return { match: reasons.length > 0, reasons };
}
