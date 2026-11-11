// Pure helpers for the session-insights edge function (FR-8.4, AI-1..AI-5).
// No Deno or network APIs here, so jest can test them
// (supabase/functions/jest.config.cjs) even though the Deno handler itself
// cannot run in this environment.

export interface SessionInsights {
  headline: string;
  whatYouDid: string;
  bodyImpact: string;
  goalImpact: string;
  nextSession: string;
}

export const INSIGHT_FIELDS = ['headline', 'whatYouDid', 'bodyImpact', 'goalImpact', 'nextSession'] as const;

const MAX_FACTS_BYTES = 20_000;
const MAX_FIELD_CHARS = 700;

/** Structured-output schema for the model's reply. */
export const INSIGHTS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'One short, encouraging sentence about the session.' },
    whatYouDid: { type: 'string', description: 'Two or three sentences on the work done, highlighting standouts.' },
    bodyImpact: { type: 'string', description: 'Two or three sentences on which muscles did the work and what that training does for them.' },
    goalImpact: { type: 'string', description: "Two or three sentences on why this session moves the user toward their goal, tied to the goal fit facts." },
    nextSession: { type: 'string', description: 'Two or three sentences on the next session: what it trains, recovery, and the suggested changes and why.' },
  },
  required: [...INSIGHT_FIELDS],
  additionalProperties: false,
} as const;

/**
 * Static, so it can be cached as a prefix. It is likely below the minimum
 * cacheable length, in which case caching is simply a no-op.
 */
export const SYSTEM_PROMPT = `You write the short explanation a fitness app shows after a workout. The app gives you the session as JSON facts. Everything in the facts was computed by the app's own rules; your job is to explain it in plain, warm, encouraging language a beginner understands.

Rules:
- Use only the facts given. Every number you write must appear in the facts exactly as given (same value and unit). Do not calculate new numbers, percentages, calories, durations, or timeframes such as hours of rest.
- Never invent sets, weights, reps or exercises, and never change a suggested weight or rep count. If you mention a suggested change, repeat it exactly.
- Do not make medical, injury, diagnostic, treatment, or body-composition claims, and do not promise specific results. Describe training effects in general terms (for example, "builds strength", "helps muscles grow over time").
- If a target was missed, say so kindly and explain that the plan holds steady rather than adding load.
- Tie the goal explanation to the user's goal and to the goal fit facts (rep range, sets in range, compound lifts).
- Speak to the user as "you". No headings, lists, emojis or markdown. Keep each field to two or three short sentences.`;

/** Rejects anything that isn't a plausible facts object, and oversized payloads. */
export function validateFacts(body: unknown): { ok: true; facts: Record<string, unknown> } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: 'Body must be a JSON object.' };
  const facts = (body as { facts?: unknown }).facts;
  if (typeof facts !== 'object' || facts === null || Array.isArray(facts)) return { ok: false, error: 'Missing facts object.' };
  const record = facts as Record<string, unknown>;
  if (typeof record.session !== 'string' || !Array.isArray(record.exercises)) return { ok: false, error: 'Facts are missing session or exercises.' };
  if (JSON.stringify(facts).length > MAX_FACTS_BYTES) return { ok: false, error: 'Facts are too large.' };
  return { ok: true, facts: record };
}

/** Parses the model's JSON reply into the five fields, or null if anything is off. */
export function parseInsights(text: string): SessionInsights | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const out: Partial<SessionInsights> = {};
  for (const field of INSIGHT_FIELDS) {
    const value = record[field];
    if (typeof value !== 'string' || value.trim() === '' || value.length > MAX_FIELD_CHARS) return null;
    out[field] = value.trim();
  }
  return out as SessionInsights;
}

/** Every number in a text: "1,680.5 kg" -> 1680.5, "8–12" -> 8 and 12. */
export function numbersIn(text: string): number[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((token) => Number(token.replace(/,/g, ''))).filter(Number.isFinite);
}

/**
 * AI-1/AI-5: numbers in the AI text that do not appear anywhere in the
 * facts. Any result means the reply is discarded for the rule-based text.
 */
export function ungroundedNumbers(insights: SessionInsights, facts: Record<string, unknown>): number[] {
  const allowed = new Set(numbersIn(JSON.stringify(facts)));
  const found = INSIGHT_FIELDS.flatMap((field) => numbersIn(insights[field]));
  return [...new Set(found.filter((n) => !allowed.has(n)))];
}
