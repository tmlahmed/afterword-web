import { readFile } from 'node:fs/promises'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'
import sharp from 'sharp'

/**
 * GET /feeds/cover/<isbn>.jpg (a book) or /feeds/cover/item-<id>.jpg (a gift or stationery item):
 * the main picture as a JPEG, for the shopping feeds.
 * Covers are stored as WebP, which Meta's catalogue does not reliably accept.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const isbn = /^(\d{13})\.jpg$/.exec(file)?.[1]
  const itemId = Number(/^item-(\d+)\.jpg$/.exec(file)?.[1])
  if (!isbn && !itemId) return new Response('Not found', { status: 404 })
  const payload = await getPayload({ config })
  const book = (
    await payload.find({
      collection: 'editions',
      where: { and: [isbn ? { isbn13: { equals: isbn } } : { id: { equals: itemId } }, { status: { equals: 'published' } }] },
      select: { coverUrl: true },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  if (!book?.coverUrl) return new Response('Not found', { status: 404 })

  let source: Buffer
  const local = /^\/api\/media\/file\/([^/?#]+)$/.exec(book.coverUrl)?.[1]
  if (local) {
    const dir = process.env.MEDIA_DIR || path.resolve(process.cwd(), 'media')
    source = await readFile(path.join(dir, path.basename(decodeURIComponent(local))))
  } else {
    const res = await fetch(book.coverUrl, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return new Response('Not found', { status: 404 })
    source = Buffer.from(await res.arrayBuffer())
  }
  const jpeg = await sharp(source).resize({ width: 1000, withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer()
  return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=604800' } })
}
