// Supabase Edge Function: account deletion (FR-9.3, DR-4).
//
// Runs with the service-role key (available to edge functions via
// SUPABASE_SERVICE_ROLE_KEY, never exposed to client code) so it can call
// the auth admin API to delete the underlying auth.users record — the one
// operation regular users cannot perform themselves. This is deliberate:
// `profiles` has no delete policy for `authenticated` at all (see
// supabase/migrations/0008_rls_policies.sql), precisely so account
// deletion is only ever reachable through this routine.
//
// Deleting auth.users cascades to profiles (`on delete cascade`) and from
// there to every other user-scoped table via their own cascading foreign
// keys, satisfying DR-4 (full removal, not deactivation/hiding).
//
// Phase 12 owns the full adversarial re-audit of this routine (confirming
// zero residual rows across every table after deletion, per plan.md);
// this Phase 2 version implements the core deletion mechanism.
//
// Not executable in this environment: Deno and the Supabase CLI's
// function-serving stack are unavailable here (see the Phase 1/2 reports
// on the missing Docker dependency). Written to match Supabase's
// documented edge function pattern exactly; verify with
// `supabase functions serve` once Docker/Deno are available.

import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401,
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500 });
  }

  // Two clients: one scoped to the caller's own JWT (only to identify who
  // is asking), one with service-role privileges (to actually perform the
  // deletion). The caller's own token is never sufficient to delete
  // anyone, including themselves — RLS blocks that by design.
  const callerClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
      status: 401,
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userData.user.id);
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
