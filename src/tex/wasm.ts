// The WebAssembly types that the TeX runtime needs. The build uses the Node types only, which do not declare
// the WebAssembly namespace, so the runtime names the few members it uses and reaches the global by value.

/** A compiled WASM module. The runtime does not look inside. */
export type WasmModule = object;

/** An instance of a WASM module. */
export interface WasmInstance {
  exports: Record<string, unknown>;
}

/** The memory export of an instance. */
export interface WasmMemory {
  buffer: ArrayBuffer;
}

/** The import object of the engine. */
export interface EngineImports {
  env: Record<string, (...args: number[]) => unknown>;
}

/** Instantiates a compiled module with the imports. */
export function instantiate(module: WasmModule, imports: EngineImports): Promise<WasmInstance> {
  const api = (globalThis as unknown as { WebAssembly: { instantiate(m: WasmModule, i: EngineImports): Promise<WasmInstance> } }).WebAssembly;
  return api.instantiate(module, imports);
}
