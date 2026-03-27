export type PatchSourceKind = "local_import" | "remote_community" | "bundled";
export type PatchOperationKind = "import" | "fetch" | "toggle" | "select_active" | null;
export type PatchChooserReason = "after-import" | "after-fetch" | "manual" | null;
export type PatchWarningKind = "conflict" | "incomplete_metadata";

export interface PatchWarning {
  kind: PatchWarningKind;
  message: string;
}

export interface EditablePatchEntry {
  id: string;
  name: string;
  description: string | null;
  author: string | null;
}

export interface ImportPatchInput {
  file_name: string;
  contents: string;
}
