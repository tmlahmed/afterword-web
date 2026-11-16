import type { Endpoint } from 'payload'

import { userHasRole } from '../access/roles'
import { demandReport, moneyReport, periodFrom, salesReport, stockReport, toCsv } from '../lib/reports'

/** GET /api/reports/:name.csv?period=30d — the Reports tables as spreadsheets. Managers only. */
export const reportsCsvEndpoint: Endpoint = {
  path: '/reports/:file',
  method: 'get',
  handler: async (req) => {
    if (!userHasRole(req.user, 'manager')) return Response.json({ message: 'Reports are for managers.' }, { status: 403 })
    const name = String(req.routeParams?.file ?? '').replace(/\.csv$/, '')
    const period = periodFrom(new URL(req.url ?? 'http://x').searchParams.get('period') ?? undefined)
    let csv: string

    switch (name) {
      case 'sales': {
        const r = await salesReport(req.payload, period)
        csv = toCsv(['Day', 'Orders', 'Books', 'Taken (BDT)'], r.days.map((d) => [d.day, d.orders, d.books, d.revenue]))
        break
      }
      case 'best-sellers': {
        const r = await salesReport(req.payload, period)
        csv = toCsv(['Title', 'Author', 'ISBN', 'Copies', 'Sales (BDT)'], r.bestSellers.map((b) => [b.title, b.author, b.isbn, b.copies, b.revenue]))
        break
      }
      case 'couriers': {
        const r = await moneyReport(req.payload)
        csv = toCsv(['Order', 'Courier', 'District', 'Total (BDT)', 'Paid (BDT)', 'To collect (BDT)', 'Placed'], r.withCouriers.map((o) => [o.number, o.courier, o.district, o.total, o.paid, o.toCollect, o.createdAt]))
        break
      }
      case 'stock':
      case 'slow': {
        const r = await stockReport(req.payload)
        const all = name === 'slow' ? r.slow : r.rows
        csv = toCsv(
          ['Title', 'Author', 'ISBN', 'Copies', 'Price (BDT)', 'Value at price (BDT)', 'Estimated cost (BDT)', 'Last sold', 'Sold in last 60 days'],
          all.map((b) => [b.title, b.author, b.isbn, b.copies, b.price, b.retailValue, b.costValue, b.lastSold, b.soldLast60]),
        )
        break
      }
      case 'searches': {
        const r = await demandReport(req.payload, period)
        csv = toCsv(['Searched for', 'Times', 'Last searched'], r.searches.map((s) => [s.query, s.count, s.lastAt]))
        break
      }
      default:
        return Response.json({ message: 'No such report.' }, { status: 404 })
    }

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="afterword-${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  },
}
