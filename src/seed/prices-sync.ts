import config from '@payload-config'
import { getPayload } from 'payload'

import { repriceAll } from '../lib/repricing'

/**
 * Keeps every price in line with the pricing rules and the group discounts running now, so a
 * sale starts and ends on time. Run from cron every 15 minutes: pnpm prices:sync
 */
const payload = await getPayload({ config })
const changed = await repriceAll(payload)
console.log(`${new Date().toISOString()} re-priced ${changed} ${changed === 1 ? 'book' : 'books'}`)
process.exit(0)
