/** Mirrors the Rust AppSettings struct for type-safe frontend usage. */
export interface AppSettings {
  xenia_path: string;
  app_data_path: string;
  library_metadata_path: string;
  setup_complete: boolean;
  last_active_route: string | null;
}

/** Result of validating a single path on the backend. */
export interface PathValidationResult {
  path: string;
  valid: boolean;
  reason: string | null;
}

/** Bundle returned by the backend when validating all three paths. */
export interface SettingsValidation {
  xenia: PathValidationResult;
  app_data: PathValidationResult;
  library_metadata: PathValidationResult;
  warnings: string[];
  all_valid: boolean;
}

/** Labels and keys for the three managed paths. */
export const PATH_FIELDS = [
  {
    key: "xenia_path" as const,
    label: "Xenia Emulator",
    description: "Xenia binaries and runtime files",
    validationKey: "xenia" as const,
  },
  {
    key: "app_data_path" as const,
    label: "Application Data",
    description: "Task history, caches, and app state",
    validationKey: "app_data" as const,
  },
  {
    key: "library_metadata_path" as const,
    label: "Library Metadata",
    description: "Game library database and metadata",
    validationKey: "library_metadata" as const,
  },
] as const;

export type PathFieldKey = (typeof PATH_FIELDS)[number]["key"];
export type ValidationKey = (typeof PATH_FIELDS)[number]["validationKey"];
