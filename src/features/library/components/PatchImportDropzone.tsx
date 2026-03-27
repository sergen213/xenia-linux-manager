import { useRef, useState, type DragEvent } from "react";

interface PatchImportDropzoneProps {
  pending: boolean;
  onImport: (input: { file_name: string; contents: string }) => Promise<void>;
}

async function readSinglePatchFile(file: File): Promise<{ file_name: string; contents: string }> {
  return {
    file_name: file.name,
    contents: await file.text(),
  };
}

export function PatchImportDropzone({ pending, onImport }: PatchImportDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  async function handleFiles(files: FileList | null) {
    const file = files?.item(0);
    if (!file) {
      return;
    }
    const patch = await readSinglePatchFile(file);
    await onImport(patch);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files);
  }

  return (
    <div
      className={`patch-dropzone ${isDragging ? "is-dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        hidden
        type="file"
        accept=".toml,.patch.toml"
        onChange={(event) => void handleFiles(event.target.files)}
      />
      <p>Drop a `.patch.toml` file here or choose one manually.</p>
      <button type="button" disabled={pending} onClick={() => inputRef.current?.click()}>
        Import patch file
      </button>
    </div>
  );
}
