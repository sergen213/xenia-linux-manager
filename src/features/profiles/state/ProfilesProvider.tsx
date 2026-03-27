import { useReducer, type ReactNode } from "react";
import { INITIAL_PROFILES_STATE, ProfilesContext, profilesReducer } from "./profilesStore";

interface ProfilesProviderProps {
  children: ReactNode;
}

export function ProfilesProvider({ children }: ProfilesProviderProps) {
  const [state, dispatch] = useReducer(profilesReducer, INITIAL_PROFILES_STATE);

  return (
    <ProfilesContext value={{ state, dispatch }}>
      {children}
    </ProfilesContext>
  );
}