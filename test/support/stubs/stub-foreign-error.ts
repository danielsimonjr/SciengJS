// Test-only backend. It throws a RenderError of its own class, as a bundle copy of the error module does.
// The worker must keep the code of that error, because the class of the error is not the class of the worker.
class ForeignRenderError extends Error {
  readonly code = "E_STAGE_MISSING";

  constructor(message: string) {
    super(message);
    this.name = "RenderError";
  }
}

export function render(): never {
  throw new ForeignRenderError("the foreign stage is missing");
}
