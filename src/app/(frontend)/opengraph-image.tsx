import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { ImageResponse } from 'next/og'

/** The picture shown when a page without its own image is shared on Facebook, WhatsApp or X. */
export const alt = 'AFTERWORD — original books, delivered across Bangladesh'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpenGraphImage() {
  const logo = `data:image/png;base64,${(await readFile(path.join(process.cwd(), 'public/brand/afterword-logo.png'))).toString('base64')}`
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#ffffff',
          color: '#111111',
          padding: '72px 80px',
          borderBottom: '18px solid #d22b2f',
        }}
      >
        <img src={logo} alt="AFTERWORD" width={346} height={40} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 76, lineHeight: 1.08, maxWidth: 900 }}>Original books, chosen by people who read.</div>
          <div style={{ fontSize: 30, marginTop: 28, color: '#4a4a4a' }}>Genuine publishers’ editions · Delivered across Bangladesh</div>
        </div>
      </div>
    ),
    size,
  )
}
