// Supabase Edge Function: AI explanation for the post-session summary
// (FR-8.4, AI-1..AI-5).
//
// The app computes every fact deterministically (packages/core
// sessionSummary.ts -> toAiFacts) and sends only those facts here. Claude
// writes the explanatory prose around them. It never produces plan
// numbers (AI-1): a reply whose numbers are not all present in the facts
// is discarded, and the app shows its rule-based text instead. Any
// failure (no key, refusal, timeout, bad JSON) also answers
// `{ fallback: true }` with status 200, so the summary always renders.
//
// Needs the ANTHROPIC_API_KEY secret: `supabase secrets set ANTHROPIC_API_KEY=...`.
//
// Not executable in this environment (no Deno / Supabase CLI), same as
// delete-account. Its pure logic is tested in
// ../_shared/sessionInsights.test.ts; verify the handler with
// `supabase functions serve session-insights` (docs/deferred-production-checks.md).

import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  INSIGHTS_JSON_SCHEMA,
  SYSTEM_PROMPT,
  parseInsights,
  ungroundedNumbers,
  validateFacts,
} from '../_shared/sessionInsights.ts';

const MODEL = 'claude-opus-5-5';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function fallback(reason: string): Response {
  console.warn(`[session-insights] fallback: ${reason}`);
  return json({ fallback: true, reason });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return json({ error: 'Server misconfiguration' }, 500);

  // Only signed-in users may spend tokens.
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Invalid or expired session' }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400);
  }
  const validated = validateFacts(body);
  if (!validated.ok) return json({ error: validated.error }, 400);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return fallback('ANTHROPIC_API_KEY is not set');

  const anthropic = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 });

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      // Thinking can't be turned off on this model and counts toward max_tokens.
      max_tokens: 4000,
      // On a policy decline, the API retries on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: INSIGHTS_JSON_SCHEMA } },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Session facts (JSON):\n${JSON.stringify(validated.facts)}` }],
    });

    if (response.stop_reason !== 'end_turn') return fallback(`stop_reason ${response.stop_reason}`);
    const text = response.content.find((block) => block.type === 'text');
    const insights = text && text.type === 'text' ? parseInsights(text.text) : null;
    if (!insights) return fallback('reply was not the expected JSON');

    const invented = ungroundedNumbers(insights, validated.facts);
    if (invented.length > 0) return fallback(`ungrounded numbers: ${invented.join(', ')}`);

    return json({ insights, model: response.model });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return fallback('rate limited');
    if (error instanceof Anthropic.APIError) return fallback(`API error ${error.status}`);
    return fallback(error instanceof Error ? error.message : 'unknown error');
  }
});
