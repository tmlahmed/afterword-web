/** Rebuilds the search index from the database:  pnpm search:reindex  */
import { getPayload } from 'payload'

import { reindexAll } from '../lib/search'
import config from '../payload.config'

const payload = await getPayload({ config })
const count = await reindexAll(payload)
payload.logger.info(`Search index rebuilt: ${count} books`)
process.exit(0)
