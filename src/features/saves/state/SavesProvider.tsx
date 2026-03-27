import { useReducer, type ReactNode } from "react";
import { INITIAL_SAVES_STATE, SavesContext, savesReducer } from "./savesStore";

interface SavesProviderProps {
  children: ReactNode;
}

export function SavesProvider({ children }: SavesProviderProps) {
  const [state, dispatch] = useReducer(savesReducer, INITIAL_SAVES_STATE);

  return <SavesContext value={{ state, dispatch }}>{children}</SavesContext>;
}
