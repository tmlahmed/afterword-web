import jsQR from 'jsqr'
import QRCode from 'qrcode'
import sharp from 'sharp'

/**
 * Bangla QR: Bangladesh's shared payment QR (EMVCo format). One code can be paid from bKash,
 * Nagad, Rocket, Upay and bank apps. We keep the code's text, not the picture, so the shop can
 * draw it in its own colours; the text is what the payment apps read.
 */

/** CRC-16/CCITT-FALSE, the checksum at the end of every EMVCo code (tag 63). */
const crc16 = (text: string): string => {
  let crc = 0xffff
  for (const byte of Buffer.from(text, 'utf8')) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** The top-level tags of an EMVCo code: two-digit tag, two-digit length, value. */
const tags = (text: string): Map<string, string> => {
  const out = new Map<string, string>()
  let i = 0
  while (i + 4 <= text.length) {
    const tag = text.slice(i, i + 2)
    const len = Number(text.slice(i + 2, i + 4))
    if (!Number.isFinite(len)) break
    out.set(tag, text.slice(i + 4, i + 4 + len))
    i += 4 + len
  }
  return out
}

export type BanglaQr = { text: string; name: string | null }

/** The code if it is a valid payment QR (right format, checksum matches), otherwise a reason. */
export const checkBanglaQr = (raw: string): BanglaQr | { problem: string } => {
  const text = raw.trim()
  if (!text.startsWith('000201')) return { problem: 'That QR code is not a payment QR. Upload your Bangla QR from the bKash app.' }
  const crcAt = text.lastIndexOf('6304')
  if (crcAt === -1 || crcAt !== text.length - 8 || crc16(text.slice(0, crcAt + 4)) !== text.slice(-4).toUpperCase()) {
    return { problem: 'That QR code did not read cleanly. Upload a sharper picture of it.' }
  }
  return { text, name: tags(text).get('59')?.trim() || null }
}

/** Read the QR code in a picture file. */
export const readQrPicture = async (file: string): Promise<string | null> => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null
}

/** The code drawn for the page (SVG, ink on white) and as a picture to save to a phone (PNG). */
export const drawBanglaQr = async (text: string): Promise<{ svg: string; png: string }> => {
  const color = { dark: '#111111', light: '#ffffff' }
  const [svg, png] = await Promise.all([
    QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color }),
    QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 4, width: 720, color }),
  ])
  return { svg, png }
}
