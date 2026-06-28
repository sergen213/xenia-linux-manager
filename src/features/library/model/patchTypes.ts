export type PatchChooserReason = "after-import" | "after-fetch" | "manual" | null;

export interface ImportPatchInput {
  file_name: string;
  contents: string;
}
