import { describe, expect, it } from 'vitest'

import { hit, RULES } from '../../src/lib/rateLimit'

describe('rate limits', () => {
  it('allows up to the limit, then refuses, then allows again once the window has passed', () => {
    const { limit, windowMs } = RULES.otpRequest
    const t0 = 1_000_000
    for (let i = 0; i < limit; i++) expect(hit('otpRequest', '203.0.113.9', t0 + i)).toBe(true)
    expect(hit('otpRequest', '203.0.113.9', t0 + limit)).toBe(false)
    expect(hit('otpRequest', '198.51.100.1', t0 + limit)).toBe(true) // someone else is unaffected
    expect(hit('otpRequest', '203.0.113.9', t0 + windowMs + limit)).toBe(true)
  })
})
