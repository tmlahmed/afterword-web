/**
 * Sample content for the preview site: the main menu, a few series, author notes,
 * Marginalia articles and the About and Help pages.
 *
 *   pnpm seed:content      (run after `pnpm seed`; safe to run again)
 *
 * All of the wording here is PLACEHOLDER COPY to show how the pages look.
 * Replace it with AFTERWORD's own before launch.
 */
import { getPayload } from 'payload'

import { reindexAll } from '../lib/search'
import config from '../payload.config'

const payload = await getPayload({ config })
const log = (msg: string) => payload.logger.info(msg)

// --- Lexical rich text, built by hand -------------------------------------
const text = (t: string, format = 0) => ({ type: 'text', text: t, format, detail: 0, mode: 'normal', style: '', version: 1 })
const block = (type: string, children: unknown[], extra: Record<string, unknown> = {}) => ({
  type,
  children,
  direction: 'ltr',
  format: '',
  indent: 0,
  version: 1,
  ...extra,
})
const p = (t: string) => block('paragraph', [text(t)], { textFormat: 0, textStyle: '' })
const h2 = (t: string) => block('heading', [text(t)], { tag: 'h2' })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const doc = (...children: unknown[]): any => ({ root: block('root', children) })

const bookId = async (title: string): Promise<number | undefined> =>
  (await payload.find({ collection: 'editions', where: { title: { equals: title } }, limit: 1, depth: 0 })).docs[0]?.id
const bookIds = async (titles: string[]) => (await Promise.all(titles.map(bookId))).filter((id): id is number => Boolean(id))
const bySlug = async (collection: 'subjects' | 'lists', slug: string) =>
  (await payload.find({ collection, where: { slug: { equals: slug } }, limit: 1, depth: 0 })).docs[0]?.id

// --- Series ----------------------------------------------------------------
const SERIES: [string, string, number][] = [
  ['A Song of Ice and Fire', 'A Game of Thrones', 1],
  ['The Lord of the Rings', 'The Fellowship of the Ring', 1],
  ['His Dark Materials', 'Northern Lights', 1],
  ['Harry Potter', "Harry Potter and the Philosopher's Stone", 1],
  ['The Hunger Games', 'The Hunger Games', 1],
  ['The Neapolitan Novels', 'My Brilliant Friend', 1],
  ['The Ibis Trilogy', 'Sea of Poppies', 1],
]
for (const [name, title, number] of SERIES) {
  const id = await bookId(title)
  if (!id) continue
  const found = await payload.find({ collection: 'series', where: { name: { equals: name } }, limit: 1, depth: 0 })
  const series = found.docs[0] ?? (await payload.create({ collection: 'series', data: { name, slug: '' }, depth: 0 }))
  await payload.update({ collection: 'editions', id, data: { series: series.id, seriesNumber: number }, depth: 0, context: { skipSearchSync: true } })
}
log(`Series: ${SERIES.length}`)

// --- Author notes (placeholder biographies) --------------------------------
const BIOS: [string, string][] = [
  ['Kazuo Ishiguro', 'Born in Nagasaki and raised in England, Kazuo Ishiguro writes quiet, exact novels about memory and self-deception. He was awarded the Nobel Prize in Literature in 2017.'],
  ['Tahmima Anam', 'Tahmima Anam was born in Dhaka and grew up between Paris, New York and Bangkok. Her Bengal trilogy follows one family from the Liberation War to the present day.'],
  ['Amitav Ghosh', 'Amitav Ghosh was born in Kolkata and grew up in India, Bangladesh and Sri Lanka. His novels move between Bengal, Burma and the Indian Ocean, and his essays have shaped how fiction thinks about climate.'],
  ['Arundhati Roy', 'Arundhati Roy won the Booker Prize in 1997 for her first novel, The God of Small Things. She lives in Delhi and is as widely read for her essays as for her fiction.'],
  ['Haruki Murakami', 'Haruki Murakami ran a jazz bar in Tokyo before he wrote his first novel. His books, translated into more than fifty languages, slip between the everyday and the dreamlike.'],
  ['Claire Keegan', 'Claire Keegan grew up on a farm in County Wicklow. She writes short, exacting fiction, and her stories and novellas are taught as models of the form.'],
]
for (const [name, bio] of BIOS) {
  const found = await payload.find({ collection: 'contributors', where: { name: { equals: name } }, limit: 1, depth: 0 })
  if (found.docs[0] && !found.docs[0].bio) await payload.update({ collection: 'contributors', id: found.docs[0].id, data: { bio }, depth: 0 })
}
log(`Author notes: ${BIOS.length}`)

// --- Subject introductions and featured books ------------------------------
const SUBJECT_COPY: [string, string, string?][] = [
  ['fiction', 'Novels and stories from everywhere: new voices, modern classics and the books that started it all.', 'The Remains of the Day'],
  ['non-fiction', 'History, science, memoir and argument, for readers who like to finish a book knowing more than when they began.', 'The Hungry Tide'],
  ['childrens-ya', 'First favourites and the books that turn children into readers, from picture books to young adult.'],
  ['south-asian-writing', 'Fiction from Bangladesh, India, Pakistan and Sri Lanka, and from writers of the diaspora.', 'A Golden Age'],
  ['fiction-in-translation', 'The best of the world’s fiction, carried into English by its translators.', 'The Memory Police'],
  ['contemporary-fiction', 'The novels people are talking about now, and a few they will still be talking about in twenty years.', 'Small Things Like These'],
]
for (const [slug, intro, feature] of SUBJECT_COPY) {
  const id = await bySlug('subjects', slug)
  if (!id) continue
  const featureId = feature && slug !== 'non-fiction' ? await bookId(feature) : undefined
  await payload.update({ collection: 'subjects', id, data: { intro, ...(featureId ? { feature: featureId } : {}) }, depth: 0 })
}
log('Subject introductions set')

// --- Main menu --------------------------------------------------------------
const nav = await payload.findGlobal({ slug: 'navigation', depth: 0 })
if (!nav.items?.length) {
  const list = (slug: string) => bySlug('lists', slug)
  await payload.updateGlobal({
    slug: 'navigation',
    data: {
      items: [
        { label: 'New & Notable', type: 'list', list: await list('new-and-notable') },
        {
          label: 'Fiction',
          type: 'subject',
          subject: await bySlug('subjects', 'fiction'),
          highlights: (await Promise.all(['south-asian-voices', 'in-translation', 'modern-classics'].map(list))).filter((x): x is number => Boolean(x)),
          featured: await bookId('Piranesi'),
        },
        {
          label: 'Non-Fiction',
          type: 'subject',
          subject: await bySlug('subjects', 'non-fiction'),
          highlights: (await Promise.all(['big-ideas'].map(list))).filter((x): x is number => Boolean(x)),
          featured: await bookId('The Golden Road'),
        },
        {
          label: 'Children’s & YA',
          type: 'subject',
          subject: await bySlug('subjects', 'childrens-ya'),
          highlights: (await Promise.all(['for-young-readers'].map(list))).filter((x): x is number => Boolean(x)),
          featured: await bookId('The Little Prince'),
        },
        { label: 'Collections', type: 'url', url: '/collections' },
        { label: 'Marginalia', type: 'url', url: '/marginalia' },
      ],
    },
  })
  log('Main menu arranged')
}

// --- Marginalia (placeholder articles) ---------------------------------------
const ARTICLES = [
  {
    title: 'Five short books for a long week',
    kind: 'list' as const,
    byline: 'Sample article',
    standfirst: 'When there is no time to read, read something short. Five books under two hundred pages that stay with you far longer than they take.',
    books: ['Small Things Like These', 'Foster', 'The Old Man and the Sea', 'Convenience Store Woman', 'Animal Farm'],
    body: doc(
      p('There is a kind of tiredness that makes a long novel feel like a debt. The answer is not to stop reading. It is to read something you can finish before the tea goes cold twice.'),
      h2('Start with Keegan'),
      p('Small Things Like These is the book we hand over most often. A coal merchant, a convent, one week before Christmas. It asks a single question — what would you do? — and trusts you to answer it yourself. Foster, its companion on our shelves, is shorter still and just as exact.'),
      h2('Then go to sea'),
      p('The Old Man and the Sea is the classic everyone thinks they have read. Read it again as an adult: it is less about the fish than about what is left of a person when the luck has gone.'),
      h2('Two that are stranger'),
      p('Convenience Store Woman is funny until it is not, a novel about being perfectly content with a life other people find alarming. And Animal Farm, which you met at school, turns out to be ninety pages of the most efficient storytelling in English.'),
      p('None of these will take you more than two evenings. All of them will take up room in your head for a good deal longer.'),
    ),
  },
  {
    title: 'Where to begin with fiction in translation',
    kind: 'essay' as const,
    byline: 'Sample article',
    standfirst: 'Most of the world does not write in English. A short, opinionated way in, by way of Tokyo, Seoul, Warsaw and Macondo.',
    books: ['The Memory Police', 'The Vegetarian', 'Flights', 'One Hundred Years of Solitude', 'Invisible Cities', 'Tomb of Sand'],
    body: doc(
      p('A translated novel is two books at once: the one its author wrote, and the one its translator made of it. That is a reason to read them, not a reason to hesitate.'),
      h2('Begin somewhere quiet'),
      p('The Memory Police, by Yoko Ogawa, is the gentlest unsettling book we know. Things vanish from an island, and then the memory of them does. It is an easy first step: plain sentences, a story that pulls, and a strangeness that builds slowly.'),
      h2('Then somewhere sharper'),
      p('Han Kang’s The Vegetarian begins with a woman who stops eating meat and ends somewhere much darker. It is short, and it will divide whatever room you discuss it in.'),
      h2('And when you are ready to wander'),
      p('Olga Tokarczuk’s Flights is built from fragments about travel and the body. Calvino’s Invisible Cities is fifty-five imaginary cities described to an emperor. Neither behaves like a novel, and both are better for it.'),
      p('After that, the big one. One Hundred Years of Solitude has been making readers of people for half a century. Closer to home, Geetanjali Shree’s Tomb of Sand, translated from Hindi, shows what the form can do with a border and an eighty-year-old woman who will not stay in bed.'),
    ),
  },
  {
    title: 'How we choose what goes on the shelves',
    kind: 'news' as const,
    byline: 'Sample article',
    standfirst: 'We cannot stock everything, so we stock what we would press into a friend’s hands. A note on how that works, and what “On Request” means.',
    books: ['Stoner', 'Piranesi', 'The Hungry Tide'],
    body: doc(
      p('A bookshop is a set of decisions. Ours are simple to describe and hard to keep to: we only sell original editions, and we only keep in stock the books we would recommend without being asked.'),
      h2('Three states, stated plainly'),
      p('Every book on this site is in one of three states. In stock means it is on a shelf in Dhaka and leaves the next working day. Pre-order means it is not yet published, or not yet here, and we give the date we expect it. On Request means we do not hold it, but will order it from abroad for you, with a price and an arrival estimate before you pay.'),
      h2('Why not simply list everything?'),
      p('Because a list is not a recommendation. When a book has a note signed by one of us — we call it The Afterword — someone here has read it and is prepared to stand behind it.'),
      p('If there is a book you think belongs on our shelves, tell us. Some of our best sellers arrived that way.'),
    ),
  },
]
let written = 0
for (const [i, a] of ARTICLES.entries()) {
  const found = await payload.find({ collection: 'articles', where: { title: { equals: a.title } }, limit: 1, depth: 0 })
  if (found.docs[0]) continue
  await payload.create({
    collection: 'articles',
    data: {
      title: a.title,
      slug: '',
      kind: a.kind,
      byline: a.byline,
      standfirst: a.standfirst,
      body: a.body,
      books: await bookIds(a.books),
      status: 'published',
      publishedAt: new Date(Date.now() - i * 6 * 86400000).toISOString(),
    },
    depth: 0,
  })
  written++
}
log(`Marginalia: ${written} sample articles written`)

// --- Pages (placeholder copy) ----------------------------------------------
const PAGES = [
  {
    title: 'About AFTERWORD',
    slug: 'about',
    intro: 'An independent bookshop for readers in Bangladesh who want the real edition, chosen by people who read.',
    layout: [
      {
        blockType: 'text' as const,
        heading: 'Why we exist',
        body: doc(
          p('This is placeholder text for the About page. It will be replaced with AFTERWORD’s own story: who runs the shop, why it began, and what it believes about books.'),
          p('What will not change is the promise. Every book we sell is a genuine publisher’s edition. We say honestly when a book will arrive. And the shelves are chosen and explained by booksellers.'),
        ),
      },
      {
        blockType: 'text' as const,
        heading: 'Where our books come from',
        body: doc(
          p('We buy from publishers and their authorised distributors. We do not sell reprints, photocopied editions or anything we cannot trace to its publisher. If a copy ever reaches you that is not what we said it was, we will take it back.'),
        ),
      },
    ],
  },
  {
    title: 'Help',
    slug: 'help',
    intro: 'Answers to the questions we are asked most. Policies marked “to be confirmed” are placeholders until AFTERWORD sets them.',
    layout: [
      {
        blockType: 'questions' as const,
        heading: 'Availability',
        items: [
          { question: 'What do “In stock”, “Pre-order” and “On Request” mean?', answer: 'In stock: on our shelves in Dhaka and sent the next working day.\nPre-order: not yet published or not yet arrived; we show the date we expect it.\nOn Request: we do not hold it, but will order it from abroad for you. You see the price and an arrival estimate before you pay.' },
          { question: 'Are your books original?', answer: 'Yes. Every book is a genuine edition from its publisher. We do not sell reprints or unofficial copies.' },
          { question: 'Can you get a book that is not on the site?', answer: 'Usually, if it is in print. The request service opens together with checkout.' },
        ],
      },
      {
        blockType: 'questions' as const,
        heading: 'Delivery, payment and returns',
        items: [
          { question: 'Where do you deliver, and what does it cost?', answer: 'Across Bangladesh. Delivery fees and times: to be confirmed.' },
          { question: 'How can I pay?', answer: 'Cash on delivery, bKash and cards are planned. Ordering opens when checkout is ready.' },
          { question: 'What if my book arrives damaged?', answer: 'Tell us and we will replace or refund it. The full returns policy: to be confirmed.' },
        ],
      },
    ],
  },
]
for (const page of PAGES) {
  const found = await payload.find({ collection: 'pages', where: { slug: { equals: page.slug } }, limit: 1, depth: 0 })
  if (!found.docs[0]) await payload.create({ collection: 'pages', data: { ...page, status: 'published' }, depth: 0 })
}
log(`Pages: ${PAGES.length}`)

const count = await reindexAll(payload)
log(`Search index rebuilt: ${count} books`)
process.exit(0)
