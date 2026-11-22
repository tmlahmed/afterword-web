/** Where a catalogue entry lives: books at /book/…, gifts and stationery at /item/…. */
export const productHref = (p: { slug: string; kind?: string | null }): string => `/${p.kind === 'item' ? 'item' : 'book'}/${p.slug}`
