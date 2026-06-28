import { supabase } from '../lib/supabase';

/**
 * Account soft-delete + recovery. Deletion never destroys data immediately: it
 * ARCHIVES the account for a recovery window (the backend sets a 14-day schedule),
 * during which the user can sign back in and reactivate. Permanent deletion happens
 * later, server-side, in the scheduled `purge-accounts` job. See migration 0009 +
 * the `account-lifecycle` edge function.
 */

export interface AccountStatus {
  /** True while the account is archived (deletion requested, not yet purged). */
  deactivated: boolean;
  /** ISO time the account becomes eligible for permanent purge, or null if active. */
  deletionScheduledAt: string | null;
}

/**
 * Reads the caller's own deletion state from their profile row. RLS ("read own
 * profile") restricts this to the signed-in user. Used by App.tsx to decide whether
 * to show the reactivation gate instead of the normal app.
 */
export async function getAccountStatus(userId: string): Promise<AccountStatus> {
  const { data, error } = await supabase
    .from('profiles')
    .select('deactivated_at, deletion_scheduled_at')
    .eq('id', userId)
    .maybeSingle<{ deactivated_at: string | null; deletion_scheduled_at: string | null }>();

  if (error) throw error;

  return {
    deactivated: Boolean(data?.deactivated_at),
    deletionScheduledAt: data?.deletion_scheduled_at ?? null,
  };
}

/**
 * Requests account deletion through the edge function (which authenticates the
 * caller, archives ONLY their own account, and emails a heads-up). Returns the ISO
 * time the account is scheduled to be permanently deleted.
 */
export async function requestAccountDeletion(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('account-lifecycle', {
    body: { action: 'deactivate' },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.deletionScheduledAt as string;
}

/**
 * Cancels a pending deletion and restores the account (only valid inside the
 * recovery window; the backend rejects an expired window).
 */
export async function reactivateAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('account-lifecycle', {
    body: { action: 'reactivate' },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}
