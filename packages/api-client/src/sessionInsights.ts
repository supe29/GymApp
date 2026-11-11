import type { SessionAiFacts, SummaryText } from 'core';

import type { GymSupabaseClient } from './client';
import type { ApiResult } from './profile';

const FIELDS: (keyof SummaryText)[] = ['headline', 'whatYouDid', 'bodyImpact', 'goalImpact', 'nextSession'];

function isSummaryText(value: unknown): value is SummaryText {
  return (
    typeof value === 'object' &&
    value !== null &&
    FIELDS.every((field) => typeof (value as Record<string, unknown>)[field] === 'string')
  );
}

/**
 * FR-8.4/AI-5: asks the session-insights edge function to write the
 * AI explanation for a finished session's facts. Returns an error (and
 * the caller shows the rule-based text) whenever there is no AI text:
 * the function answered `{ fallback: true }`, the call failed, or the
 * reply had an unexpected shape.
 */
export async function getSessionInsights(
  client: GymSupabaseClient,
  facts: SessionAiFacts,
): Promise<ApiResult<SummaryText>> {
  try {
    const { data, error } = await client.functions.invoke('session-insights', { method: 'POST', body: { facts } });
    if (error) return { data: null, error: error.message };
    const insights = (data as { insights?: unknown } | null)?.insights;
    if (!isSummaryText(insights)) {
      return { data: null, error: (data as { reason?: string } | null)?.reason ?? 'No AI explanation available.' };
    }
    return { data: insights, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to reach session-insights.' };
  }
}
