import { getBooksByIds } from '../../../../lib/catalogue'

/** GET /shelf/books?ids=1,2,3 — card details for saved books, in the order given. */
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get('ids') ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 200)
  return Response.json({ books: await getBooksByIds(ids, 200) })
}
