// The record of who did what, for the platform admin: account changes, sign-ups, invitations
// and platform settings. Never anyone's training, food or chats, and never an email address.
import { auditEvents, type Db } from '@project180/db'
import type { AuditAction } from '@project180/shared'

interface Who {
  id: number
  name: string
}

/**
 * Notes one action. Never fails the request it belongs to: a record that can't be written is
 * logged and skipped.
 */
export async function audit(
  db: Db,
  input: {
    action: AuditAction
    actor?: Who | null
    target?: Who | null
    businessId?: number | null
    detail?: string | null
  },
) {
  try {
    await db.insert(auditEvents).values({
      action: input.action,
      // 0 = someone no longer in the database (deleted): name only.
      actorId: input.actor?.id || null,
      actorName: input.actor?.name ?? null,
      targetId: input.target?.id || null,
      targetName: input.target?.name ?? null,
      businessId: input.businessId ?? null,
      detail: input.detail?.slice(0, 200) ?? null,
    })
  } catch (err) {
    console.error('[audit] could not record', input.action, err)
  }
}
