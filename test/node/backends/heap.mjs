// Test-only backend: keeps every allocation. The worker heap limit must end it.
export function render() {
  const kept = [];
  for (;;) kept.push(new Array(1_000_000).fill(1));
}
