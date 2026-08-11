"use client";

import { FormEvent, useCallback, useState } from "react";
import styles from "./game.module.css";

type FieldNote = {
  id: number;
  author: string;
  category: string;
  content: string;
  build: string;
  createdAt: string;
};

type FieldNotesProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const categories = [
  { value: "visual", label: "Visual" },
  { value: "controls", label: "Controls" },
  { value: "gameplay", label: "Gameplay" },
  { value: "bug", label: "Bug" },
  { value: "idea", label: "Idea" },
];

export function FieldNotes({ open, onOpenChange }: FieldNotesProps) {
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("idea");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/field-notes", { cache: "no-store" });
      const payload = (await response.json()) as {
        notes?: FieldNote[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load notes.");
      setNotes(payload.notes ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load notes.");
    } finally {
      setLoading(false);
    }
  }, []);

  const togglePanel = () => {
    if (!open) {
      if (!author) {
        setAuthor(window.localStorage.getItem("moon-goons-note-author") ?? "");
      }
      void loadNotes();
    }
    onOpenChange(!open);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/field-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, category, content }),
      });
      const payload = (await response.json()) as {
        note?: FieldNote;
        error?: string;
      };
      if (!response.ok || !payload.note) {
        throw new Error(payload.error ?? "Unable to save note.");
      }
      window.localStorage.setItem("moon-goons-note-author", author.trim());
      setNotes((current) => [payload.note as FieldNote, ...current]);
      setContent("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save note.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        className={styles.notesToggle}
        type="button"
        onClick={togglePanel}
        aria-expanded={open}
        aria-controls="field-notes-panel"
      >
        <span>FN</span>
        FIELD NOTES
        {notes.length > 0 && <b>{notes.length}</b>}
      </button>

      <aside
        id="field-notes-panel"
        className={`${styles.notesPanel} ${open ? styles.notesPanelOpen : ""}`}
        aria-hidden={!open}
        data-gamepad-scope={open || undefined}
      >
        <header className={styles.notesHeader}>
          <div>
            <span>SHARED DEVELOPMENT LOG</span>
            <h2>Field Notes</h2>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} aria-label="Close field notes">
            ×
          </button>
        </header>

        <p className={styles.notesIntro}>
          Mission pauses while this panel is open. Notes sync for everyone using this link.
        </p>

        <form className={styles.noteForm} onSubmit={submit}>
          <div className={styles.noteFormRow}>
            <label>
              <span>YOUR NAME</span>
              <input
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                maxLength={40}
                placeholder="Name or initials"
                required
              />
            </label>
            <label>
              <span>TYPE</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {categories.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            <span>OBSERVATION</span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={700}
              rows={4}
              placeholder="What felt good, confusing, broken, or worth trying?"
              required
            />
          </label>
          <div className={styles.noteSubmitRow}>
            <small>{content.length}/700 · BUILD 027</small>
            <button type="submit" disabled={saving}>
              {saving ? "TRANSMITTING…" : "ADD SHARED NOTE"}
            </button>
          </div>
        </form>

        {error && <p className={styles.notesError}>{error}</p>}

        <div className={styles.notesList}>
          <div className={styles.notesListHeading}>
            <span>RECENT REPORTS</span>
            <button type="button" onClick={() => void loadNotes()} disabled={loading}>
              {loading ? "SYNCING…" : "SYNC"}
            </button>
          </div>
          {!loading && notes.length === 0 && (
            <p className={styles.notesEmpty}>No reports yet. Be the first safety violation witness.</p>
          )}
          {notes.map((note) => (
            <article key={note.id} className={styles.noteCard}>
              <div>
                <span className={`${styles.noteCategory} ${styles[`note_${note.category}`] ?? ""}`}>
                  {note.category}
                </span>
                <time dateTime={note.createdAt}>
                    {new Date(note.createdAt.replace(" ", "T") + "Z").toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <p>{note.content}</p>
              <footer>
                <strong>{note.author}</strong>
                <span>BUILD {note.build}</span>
              </footer>
            </article>
          ))}
        </div>
      </aside>
    </>
  );
}
