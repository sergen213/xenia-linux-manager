import { useEffect, useState } from "react";
import type { LibraryGameDetails } from "../model/libraryTypes";

interface GameIdentityEditorProps {
  details: LibraryGameDetails;
  onSave: (payload: {
    game_id: string;
    title: string;
    executable_path: string;
    issue_notes: string[];
  }) => Promise<void>;
}

export function GameIdentityEditor({
  details,
  onSave,
}: GameIdentityEditorProps) {
  const [title, setTitle] = useState(details.title);
  const [path, setPath] = useState(details.executable_path);
  const [notes, setNotes] = useState(details.issue_notes.join("\n"));

  useEffect(() => {
    setTitle(details.title);
    setPath(details.executable_path);
    setNotes(details.issue_notes.join("\n"));
  }, [details]);

  return (
    <form
      className="game-identity-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSave({
          game_id: details.game_id,
          title,
          executable_path: path,
          issue_notes: notes
            .split("\n")
            .map((entry) => entry.trim())
            .filter(Boolean),
        });
      }}
    >
      <div className="game-identity-editor__row">
        <label>
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
      </div>
      <div className="game-identity-editor__row">
        <label>
          <span>Executable</span>
          <input value={path} onChange={(event) => setPath(event.target.value)} />
        </label>
      </div>
      <div className="game-identity-editor__row">
        <label>
          <span>Issue notes</span>
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      </div>
      <button type="submit">Save corrections</button>
    </form>
  );
}
