// happy-dom's IntersectionObserver never reports anything, so a chart that waits to be on screen (MongocampChart) would never
// draw in a component test. This stand-in reports "visible" at once; a test that wants the deferral stubs its own.
class VisibleAtOnce {
  constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
  observe() {
    this.callback([{ isIntersecting: true }])
  }

  unobserve() {}
  disconnect() {}
}

globalThis.IntersectionObserver = VisibleAtOnce as unknown as typeof IntersectionObserver
