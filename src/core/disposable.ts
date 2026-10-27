/** Anything that owns GPU, audio or DOM resources. */
export interface Disposable {
  dispose(): void;
}

type Cleanup = Disposable | (() => void);

/**
 * Collects resources and cleanup callbacks so an owner can release them in
 * one call. Released in reverse order, like a stack, so dependants go first.
 */
export class DisposableGroup implements Disposable {
  private items: Cleanup[] = [];
  private disposed = false;

  add<T extends Cleanup>(item: T): T {
    if (this.disposed) release(item);
    else this.items.push(item);
    return item;
  }

  /** Registers a DOM listener that is removed with the group. */
  listen<K extends keyof WindowEventMap>(target: Window, type: K, listener: (event: WindowEventMap[K]) => void, options?: AddEventListenerOptions): void;
  listen<K extends keyof DocumentEventMap>(target: Document, type: K, listener: (event: DocumentEventMap[K]) => void, options?: AddEventListenerOptions): void;
  listen<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, listener: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions): void;
  listen(target: EventTarget, type: string, listener: (event: Event) => void, options?: AddEventListenerOptions): void;
  listen(target: EventTarget, type: string, listener: (event: never) => void, options?: AddEventListenerOptions): void {
    const handler = listener as EventListener;
    target.addEventListener(type, handler, options);
    this.add(() => target.removeEventListener(type, handler, options));
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const item of this.items.splice(0).reverse()) release(item);
  }
}

function release(item: Cleanup): void {
  if (typeof item === 'function') item();
  else item.dispose();
}
