/**
 * Runs the preview's render on every request, with no debounce: a request while idle renders at
 * once (the leading edge), and requests while a render runs coalesce into one more render after
 * it (the trailing edge, latest state wins). In etch#9 a 30 ms debounce timer dominated warm
 * reload and fired late under load (spec section 15); the work itself takes a few milliseconds.
 */
export class RenderLoop {
  private readonly render: () => Promise<void>;
  private readonly onError: (error: unknown) => void;
  private running: Promise<void> | undefined;
  private again = false;
  private disposed = false;

  constructor(render: () => Promise<void>, onError: (error: unknown) => void) {
    this.render = render;
    this.onError = onError;
  }

  /** Renders now, or once more after the render that is running. */
  request(): void {
    if (this.disposed) return;
    if (this.running !== undefined) {
      this.again = true;
      return;
    }
    this.running = this.loop();
  }

  /** Resolves when no render runs and none is pending. */
  async idle(): Promise<void> {
    while (this.running !== undefined) await this.running;
  }

  dispose(): void {
    this.disposed = true;
    this.again = false;
  }

  /** Whether a request came in while the last render ran. */
  private repeats(): boolean {
    return this.again && !this.disposed;
  }

  private async loop(): Promise<void> {
    try {
      do {
        this.again = false;
        try {
          await this.render();
        } catch (error) {
          this.onError(error);
        }
      } while (this.repeats());
    } finally {
      this.running = undefined;
    }
  }
}
