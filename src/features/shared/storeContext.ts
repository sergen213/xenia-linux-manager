import { createContext, useContext, type Context, type Dispatch } from "react";

/** Shared shape for every reducer-backed store context. */
export interface StoreContextValue<S, A> {
  state: S;
  dispatch: Dispatch<A>;
}

/**
 * Create a typed reducer store context plus its `use*` hook with the
 * standard "must be used within a <Name>Provider" guard.
 *
 * `name` is the store name (e.g. "Library") used both for the hook's
 * error message and matching the `<Name>Provider` component.
 */
export function createStoreContext<S, A>(
  name: string,
): {
  Context: Context<StoreContextValue<S, A> | null>;
  useStore: () => StoreContextValue<S, A>;
} {
  const Context = createContext<StoreContextValue<S, A> | null>(null);

  function useStore(): StoreContextValue<S, A> {
    const ctx = useContext(Context);
    if (!ctx) {
      throw new Error(`use${name} must be used within a ${name}Provider`);
    }
    return ctx;
  }

  return { Context, useStore };
}
