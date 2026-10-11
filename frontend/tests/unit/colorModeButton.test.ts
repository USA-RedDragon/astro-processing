import { describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import ColorModeButton from '@/components/ColorModeButton.vue'

describe('ColorModeButton', () => {
  it('names the icon-only button with the action it takes', async () => {
    window.matchMedia ??= ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp(ColorModeButton)
    app.mount(el)
    const button = el.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('Switch to dark mode')
    button.click()
    await nextTick()
    expect(button.getAttribute('aria-label')).toBe('Switch to light mode')
    app.unmount()
  })
})
