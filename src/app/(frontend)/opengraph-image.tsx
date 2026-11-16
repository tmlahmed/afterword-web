import { ImageResponse } from 'next/og'

/** The picture shown when a page without its own image is shared on Facebook, WhatsApp or X. */
export const alt = 'AFTERWORD — original books, delivered across Bangladesh'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#f6f1e7',
          color: '#1a1d1b',
          padding: '72px 80px',
          borderBottom: '18px solid #1f4a3a',
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: 14, color: '#1f4a3a' }}>AFTERWORD</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 76, lineHeight: 1.08, maxWidth: 900 }}>Original books, chosen by people who read.</div>
          <div style={{ fontSize: 30, marginTop: 28, color: '#4a4f4b' }}>Genuine publishers’ editions · Delivered across Bangladesh</div>
        </div>
      </div>
    ),
    size,
  )
}
