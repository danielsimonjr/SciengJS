/** The error codes of a render. Each code names one class of failure. */
export const RENDER_ERROR_CODES = [
  "E_INPUT",
  "E_UNSUPPORTED",
  "E_LIMIT",
  "E_TIMEOUT",
  "E_STAGE_MISSING",
  "E_CONFIG",
  "E_INTEGRITY",
  "E_INTERNAL",
] as const;

/** One of the eight codes of a render error. */
export type RenderErrorCode = (typeof RENDER_ERROR_CODES)[number];

/** The optional position of a render error in its source. */
export interface RenderErrorPosition {
  /** The one-based source line, when the failure has one. */
  line?: number;
  /** The one-based source column, when the failure has one. */
  column?: number;
}

/** The only error type that the engine rejects with. */
export class RenderError extends Error {
  readonly code: RenderErrorCode;
  readonly line: number | undefined;
  readonly column: number | undefined;

  constructor(code: RenderErrorCode, message: string, position: RenderErrorPosition = {}) {
    super(message);
    this.name = "RenderError";
    this.code = code;
    this.line = position.line;
    this.column = position.column;
  }
}

/**
 * Whether the value is a render error, decided structurally instead of by class identity.
 * A bundle can hold more than one copy of the errors module, so an error from another copy
 * fails `instanceof RenderError`; the name and code are matched instead.
 */
export function isRenderError(value: unknown): value is RenderError {
  if (!(value instanceof Error) || value.name !== "RenderError") {
    return false;
  }
  const code = (value as { code?: unknown }).code;
  if (typeof code !== "string") {
    return false;
  }
  return (RENDER_ERROR_CODES as readonly string[]).includes(code);
}
