import {
  createDialKit as createKit,
  createDialRoot as createRoot,
  type CreateDialOptions,
  type DialConfig,
  type DialKitController,
  type DialRootOptions,
} from 'dialkit/vanilla';

export type {DialConfig, DialKitController, ResolvedValues} from 'dialkit/vanilla';

// Nested folders are plain config objects (controls carry a `type`); start every one of them closed.
function collapseFolders<T extends DialConfig>(config: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    const folder = value !== null && typeof value === 'object' && !Array.isArray(value) && !('type' in value) && key !== '_collapsed';
    out[key] = folder ? {...collapseFolders(value as DialConfig), _collapsed: true} : value;
  }
  return out as T;
}

/**
 * DialKit tweak panel. Runtime values still drive the game; the editor and
 * saved experiments are development-only. Production always starts from the
 * committed defaults. Every panel and folder starts collapsed, so the dials
 * open on a short list of titles.
 */
export function createDialKit<T extends DialConfig>(name: string, config: T, options: CreateDialOptions = {}): DialKitController<T> {
  return createKit(name, collapseFolders(config), {
    ...options,
    defaultCollapsed: true,
    persist: import.meta.env.DEV ? options.persist : false,
    shortcuts: import.meta.env.DEV ? options.shortcuts : undefined,
  });
}

/** Mounts the DialKit host. Panels only render in development builds. */
export function createDialRoot(options: DialRootOptions = {}): ReturnType<typeof createRoot> {
  return createRoot({...options, productionEnabled: import.meta.env.DEV});
}
