/** Strip spaces and hyphens; convert ISBN-10 to ISBN-13. Returns null when the number is not a valid ISBN. */
export const normaliseIsbn = (input: string): string | null => {
  const raw = input.replace(/[\s-]/g, '').toUpperCase()
  if (/^\d{13}$/.test(raw)) return isValidIsbn13(raw) ? raw : null
  if (/^\d{9}[\dX]$/.test(raw)) return isValidIsbn10(raw) ? isbn10to13(raw) : null
  return null
}

export const isValidIsbn13 = (isbn: string): boolean => {
  if (!/^\d{13}$/.test(isbn)) return false
  const sum = [...isbn].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0)
  return sum % 10 === 0
}

export const isValidIsbn10 = (isbn: string): boolean => {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false
  const sum = [...isbn].reduce((acc, ch, i) => acc + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0)
  return sum % 11 === 0
}

export const isbn10to13 = (isbn10: string): string => {
  const body = `978${isbn10.slice(0, 9)}`
  const sum = [...body].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0)
  return `${body}${(10 - (sum % 10)) % 10}`
}
