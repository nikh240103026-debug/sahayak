/**
 * Prompt-injection heuristics for untrusted page text. Detection is only used to
 * log and warn; the real defence is that page text can never change goals: the
 * validator only allows actions inside the current step's field map, with values
 * from the confirmed profile.
 */

const PATTERNS: Array<[string, RegExp]> = [
  ["ignore-instructions", /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(instruction|instructions|prompt|rules|directions|guidelines)\b/i],
  ["role-claim", /\b(system|developer|admin|operator)\s*(prompt|message|note|instruction|override)\b/i],
  ["addressing-ai", /\b(note|message|attention|notice)\s+(to|for)\s+(the\s+)?(ai|automated|llm|bot|assistant|agent)s?\b/i],
  ["you-are-now", /\byou\s+are\s+now\b/i],
  ["exfiltrate", /\b(reveal|send|email|post|upload|share|exfiltrate|copy)\b[^.\n]{0,60}\b(password|otp|account number|bank|aadhaar|api key|secret|token|profile|personal data)\b/i],
  ["fake-tags", /<\/?\s*(system|instructions?|assistant|tool_call|im_start)\s*>/i],
  ["new-task", /\b(new|updated|additional)\s+(task|goal|instructions?)\s*:/i],
];

export interface InjectionScan {
  suspicious: boolean;
  matches: string[];
}

export function scanForInjection(text: string): InjectionScan {
  const matches: string[] = [];
  for (const [name, re] of PATTERNS) {
    if (re.test(text)) matches.push(name);
  }
  return { suspicious: matches.length > 0, matches };
}

/**
 * Wrap untrusted page content in a clearly delimited block. Delimiter-like
 * sequences inside the content are neutralised so the page cannot close the block.
 */
export function wrapUntrusted(label: string, content: string): string {
  const safe = content.replace(/<\/?untrusted[^>]*>/gi, "[removed-tag]");
  return `<untrusted_page_content source="${label}">\n${safe}\n</untrusted_page_content>`;
}
