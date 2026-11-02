// Test-only backend: never returns. The worker must be ended by the time limit.
export function render() {
  for (;;) {
    // busy loop on purpose
  }
}
