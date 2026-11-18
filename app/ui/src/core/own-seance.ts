// Bring your own séance (Spec 11, own-seance): a visitor drops a séance log
// file on the Attic of the public replay to watch any run. This module checks
// the file's text with the same Canonical_Parser and Event_Selector the
// replay uses, and accepts it only whole: every line a valid event of the
// supported schema, an unbroken hash chain, and at least one record. Anything
// else gets one plain message. The text never leaves the browser; this
// module only reads it.
//
// Pure: no React, DOM, SDK, network, storage, timer or clock.
import { selectCanonical } from './replay-timeline'
import type { AppEvent } from './seance-event'
import { parseEventLog } from './seance-log'

/** The largest file the Attic reads: far above any real run, small enough to stay quick. */
export const OWN_SEANCE_MAX_BYTES = 5 * 1024 * 1024

export type OwnSeanceCheck =
  | { readonly ok: true; readonly records: readonly AppEvent[]; readonly mansionIds: readonly string[] }
  | { readonly ok: false; readonly message: string }

export const OWN_SEANCE_TOO_BIG = 'That file is larger than 5 MB. A séance log of one run is far smaller.'
export const OWN_SEANCE_EMPTY = 'That file holds no séance records.'
export const OWN_SEANCE_NOT_A_LOG = 'That is not a Haunted House séance log. Every line must be one recorded event.'
export const OWN_SEANCE_BROKEN = 'That séance log has been changed or cut: its records do not chain. Nothing was loaded.'

/** Accepts a whole, unbroken séance log, or says in one sentence why not. */
export function checkOwnSeance(text: string, bytes: number): OwnSeanceCheck {
  if (!Number.isFinite(bytes) || bytes > OWN_SEANCE_MAX_BYTES) return { ok: false, message: OWN_SEANCE_TOO_BIG }
  if (text.trim() === '') return { ok: false, message: OWN_SEANCE_EMPTY }
  const log = parseEventLog(text)
  if (!log.integrityOk) return { ok: false, message: OWN_SEANCE_BROKEN }
  if (log.diagnostics.length > 0) return { ok: false, message: OWN_SEANCE_NOT_A_LOG }
  if (log.events.length === 0) return { ok: false, message: OWN_SEANCE_EMPTY }
  const records = selectCanonical(log.events).records
  if (records.length === 0) return { ok: false, message: OWN_SEANCE_EMPTY }
  const mansionIds = [...new Set(records.map((event) => event.scope.mansion_id))].sort()
  return { ok: true, records, mansionIds }
}
