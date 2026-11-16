import type { Payload } from 'payload'

/**
 * Covers are copied into the shop's own image store, so pages never depend on another
 * site being up or fast, and every cover is served resized and compressed.
 */
const MAX_BYTES = 8_000_000

export type CoverResult = 'stored' | 'skipped' | 'failed'

export const storeCover = async (payload: Payload, editionId: number): Promise<CoverResult> => {
  const book = await payload.findByID({
    collection: 'editions',
    id: editionId,
    depth: 0,
    overrideAccess: true,
    select: { title: true, isbn13: true, cover: true, coverUrl: true },
  })
  const source = book.coverUrl
  if (book.cover || !source || !/^https:\/\//.test(source)) return 'skipped'

  try {
    const res = await fetch(source, { signal: AbortSignal.timeout(20000), redirect: 'follow' })
    const type = res.headers.get('content-type')?.split(';')[0] ?? ''
    if (!res.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type)) return 'failed'
    const data = Buffer.from(await res.arrayBuffer())
    // Open Library answers a missing cover with a 1×1 placeholder.
    if (data.length < 1500 || data.length > MAX_BYTES) return 'failed'

    const media = await payload.create({
      collection: 'media',
      data: { alt: `Cover of ${book.title}` },
      file: { data, mimetype: type, name: `cover-${book.isbn13}.${type.split('/')[1]}`, size: data.length },
      overrideAccess: true,
      depth: 0,
    })
    await payload.update({
      collection: 'editions',
      id: editionId,
      data: { cover: media.id, coverSource: source },
      overrideAccess: true,
      depth: 0,
    })
    return 'stored'
  } catch (err) {
    payload.logger.warn(`Could not copy the cover for book ${editionId}: ${err instanceof Error ? err.message : err}`)
    return 'failed'
  }
}
