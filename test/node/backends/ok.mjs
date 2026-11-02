// Test-only backend, loaded by path under Node. It is not in the published registry.
export function render() {
  return { bytes: new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\"/>"), warnings: [] };
}
