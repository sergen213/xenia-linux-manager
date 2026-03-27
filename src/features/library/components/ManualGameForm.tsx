import { useState } from "react";

interface ManualGameFormProps {
  onSubmit: (payload: { title: string; executable_path: string }) => Promise<void>;
}

export function ManualGameForm({ onSubmit }: ManualGameFormProps) {
  const [title, setTitle] = useState("");
  const [executablePath, setExecutablePath] = useState("");

  return (
    <form
      className="manual-game-form"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit({ title, executable_path: executablePath });
        setTitle("");
        setExecutablePath("");
      }}
    >
      <h3 className="manual-game-form__title">Add a game manually</h3>
      <input
        className="manual-game-form__input"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Game title"
        required
      />
      <input
        className="manual-game-form__input"
        value={executablePath}
        onChange={(event) => setExecutablePath(event.target.value)}
        placeholder="/path/to/default.xex"
        required
      />
      <button className="manual-game-form__submit" type="submit">
        Add manual entry
      </button>
    </form>
  );
}
