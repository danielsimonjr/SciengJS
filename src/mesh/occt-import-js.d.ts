// The package occt-import-js 0.0.23 ships no type declarations. This file declares its factory.
// The reader in read.ts declares the shape of the result that the factory returns.
declare module "occt-import-js" {
  /** Loads the OpenCascade WASM module. The options route the WASM messages. */
  export default function occtImportJs(options?: {
    print?: (text: string) => void;
    printErr?: (text: string) => void;
  }): Promise<unknown>;
}
