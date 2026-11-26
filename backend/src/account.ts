// DELETE /v1/account: "Delete my account" (DECISIONS.md #118). Progress and the login go together or not at all.
// Removing the user from neon_auth also removes their Google link and tokens, sessions, IP addresses and device details
// (foreign keys ON DELETE CASCADE in neon_auth). Every query is filtered by the verified user id.
import type { PoolClient } from 'pg'
import { withTransaction } from './db.ts'
import { HttpError } from './errors.ts'

/** Every table that holds a user's rows, keyed by user_id. */
export const USER_TABLES = [
  'review_events',
  'review_cards',
  'test_attempts',
  'lesson_progress',
  'new_word_extras',
  'notes',
  'custom_words',
  'study_sessions',
  'path_events',
  'skipped_words',
  'api_usage',
  'allowed_users',
] as const

/** One writer per user at a time: a sync and a delete wait for each other (sync.ts takes the same lock). */
export async function lockUser(client: PoolClient, userId: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [userId])
}

/** Inside a transaction, after lockUser: a token of a deleted account must not bring its data back. */
export async function requireAccount(client: PoolClient, userId: string): Promise<void> {
  const { rowCount } = await client.query('SELECT 1 FROM neon_auth."user" WHERE id = $1::uuid', [userId])
  if (rowCount !== 1) throw new HttpError(410, 'account_deleted', 'This account has been deleted.')
}

export async function deleteAccount(userId: string): Promise<{ ok: true; rowsDeleted: Record<string, number> }> {
  return withTransaction('BEGIN', async (client) => {
    await lockUser(client, userId) // waits for a running sync
    await requireAccount(client, userId)
    const rowsDeleted: Record<string, number> = {}
    for (const table of USER_TABLES) {
      const res = await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId])
      rowsDeleted[table] = res.rowCount ?? 0
    }
    const user = await client.query('DELETE FROM neon_auth."user" WHERE id = $1::uuid', [userId])
    if (user.rowCount !== 1) throw new Error(`deleteAccount removed ${user.rowCount} auth users for one id`)
    return { ok: true as const, rowsDeleted }
  })
}
