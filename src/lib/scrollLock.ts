/**
 * Stop the page scrolling behind a panel or pop-up, without the page jumping sideways.
 * Hiding the overflow removes the scrollbar (when one is shown), which would widen the page;
 * the same width is added as padding so nothing moves. Locks can nest: the page is let go
 * when the last one is released.
 */
let locks = 0
let saved: { overflow: string; paddingRight: string } | null = null

export const lockScroll = (): (() => void) => {
  if (typeof document === 'undefined') return () => {}
  if (locks === 0) {
    const body = document.body
    const gap = window.innerWidth - document.documentElement.clientWidth
    saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight }
    if (gap > 0) body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + gap}px`
    body.style.overflow = 'hidden'
  }
  locks++
  let released = false
  return () => {
    if (released) return
    released = true
    locks = Math.max(0, locks - 1)
    if (locks === 0 && saved) {
      document.body.style.overflow = saved.overflow
      document.body.style.paddingRight = saved.paddingRight
      saved = null
    }
  }
}
