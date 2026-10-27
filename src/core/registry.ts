export interface Identified {
  readonly id: string;
}

/**
 * Ordered catalog of content definitions (characters, vehicles, tracks, sounds…).
 * Registration order is the order menus present them in.
 */
export class Registry<T extends Identified> {
  private readonly items = new Map<string, T>();

  constructor(
    readonly kind: string,
    private fallbackId?: string,
  ) {}

  register(item: T): T {
    if (this.items.has(item.id)) throw new Error(`${this.kind}: "${item.id}" ya está registrado.`);
    this.items.set(item.id, item);
    this.fallbackId ??= item.id;
    return item;
  }

  has(id: string | null | undefined): boolean {
    return id != null && this.items.has(id);
  }

  get(id: string | null | undefined): T | undefined {
    return id == null ? undefined : this.items.get(id);
  }

  /** Throws when the id is unknown; use for ids that come from code. */
  require(id: string): T {
    const item = this.items.get(id);
    if (!item) throw new Error(`${this.kind}: "${id}" no existe.`);
    return item;
  }

  /** Falls back to the default entry; use for ids that come from URLs or storage. */
  resolve(id: string | null | undefined): T {
    return this.get(id) ?? this.default;
  }

  get default(): T {
    const item = this.fallbackId === undefined ? undefined : this.items.get(this.fallbackId);
    if (!item) throw new Error(`${this.kind}: el registro está vacío.`);
    return item;
  }

  get ids(): string[] {
    return [...this.items.keys()];
  }

  list(): T[] {
    return [...this.items.values()];
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this.items.values();
  }
}
