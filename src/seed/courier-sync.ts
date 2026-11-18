/**
 * Ask Pathao about every parcel that is with them, and move delivered and returned parcels on.
 *   pnpm courier:sync
 * On the server this runs every 30 minutes from cron (see docs/production.md). The webhook does
 * the same as it happens; this catches anything the webhook missed.
 */
import { getPayload } from 'payload'

import { syncPathao } from '../lib/courier'
import { pathaoMode } from '../lib/courier/pathao'
import config from '../payload.config'

const payload = await getPayload({ config })
if (pathaoMode() === 'off') {
  console.log('Pathao is not connected (no PATHAO_ settings). Nothing to do.')
} else {
  const { checked, moved, problems } = await syncPathao(payload)
  console.log(`Pathao (${pathaoMode()}): ${checked} parcels checked, ${moved} delivered, returned or back to packing.`)
  for (const p of problems) console.log(`  problem: ${p}`)
}
process.exit(0)
