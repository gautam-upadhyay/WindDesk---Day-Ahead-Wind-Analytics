import { useEffect, useMemo, useState } from "react";
import { useNavigationGuard } from "./NavigationGuard";
import {
  ArrowRight,
  Bookmark,
  Check,
  Clock3,
  Palette,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import type { Theme, User } from "./Account";
import type { View } from "./types";
import { dateLabel } from "./format";

export type Accent = "ocean" | "mint" | "violet";
export interface SavedDecision {
  date: string;
  cutoff: string;
  note: string;
}
export interface WorkspaceMemory {
  accent: Accent;
  saved: SavedDecision[];
  recent: { date: string; cutoff: string } | null;
}
const empty = (): WorkspaceMemory => ({
  accent: "mint",
  saved: [],
  recent: null,
});
const validDecision = (value: unknown): value is SavedDecision => {
  if (!value || typeof value !== "object") return false;
  const item = value as SavedDecision;
  return (
    typeof item.date === "string" &&
    /^2026-01-(0[1-9]|[12]\d|3[01])$/.test(item.date) &&
    ["09:00", "09:20", "15:00", "15:30"].includes(item.cutoff)
  );
};
function readMemory(key: string): WorkspaceMemory {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (!value || !Array.isArray(value.saved)) return empty();
    const seen = new Set<string>();
    return {
      accent: ["ocean", "mint", "violet"].includes(value.accent)
        ? value.accent
        : "mint",
      saved: value.saved
        .filter(validDecision)
        .filter((item: SavedDecision) => {
          const id = `${item.date}:${item.cutoff}`;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .slice(0, 124)
        .map((item: SavedDecision) => ({
          ...item,
          note: typeof item.note === "string" ? item.note.slice(0, 400) : "",
        })),
      recent: validDecision(value.recent)
        ? { date: value.recent.date, cutoff: value.recent.cutoff }
        : null,
    };
  } catch {
    return empty();
  }
}

export function useWorkspaceMemory(user: User | null) {
  const key = `winddesk-workspace:${user?.id ?? "guest"}`;
  const initial = useMemo(() => readMemory(key), [key]);
  const [record, setRecord] = useState(() => ({ key, data: initial }));
  const [deleted, setDeleted] = useState<{
    key: string;
    item: SavedDecision;
    index: number;
  } | null>(null);
  const data = record.key === key ? record.data : initial;
  function update(next: WorkspaceMemory) {
    setRecord({ key, data: next });
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* In-memory use is available when browser storage is disabled. */
    }
  }
  const removed =
    deleted?.key === key &&
    !data.saved.some(
      (item) =>
        item.date === deleted.item.date && item.cutoff === deleted.item.cutoff,
    )
      ? deleted
      : null;
  function remove(item: SavedDecision) {
    const index = data.saved.findIndex(
      (value) => value.date === item.date && value.cutoff === item.cutoff,
    );
    if (index < 0) return;
    setDeleted({ key, item: data.saved[index], index });
    update({
      ...data,
      saved: data.saved.filter((_, position) => position !== index),
    });
  }
  function undo() {
    if (!removed) return;
    const saved = [...data.saved];
    saved.splice(Math.min(removed.index, saved.length), 0, removed.item);
    update({ ...data, saved });
    setDeleted(null);
  }
  return {
    data,
    update,
    remove,
    undo,
    removed,
    dismissUndo: () => setDeleted(null),
  };
}

function SavedCard({
  item,
  open,
  remove,
  saveNote,
  note,
  changeNote,
}: {
  item: SavedDecision;
  open: () => void;
  remove: () => void;
  saveNote: (note: string) => void;
  note: string;
  changeNote: (note: string) => void;
}) {
  const [saved, setSaved] = useState(false);
  return (
    <article className="saved-card">
      <div className="saved-card-heading">
        <span className="feature-icon mint">
          <Bookmark size={19} />
        </span>
        <button
          className="icon-button"
          aria-label={`Remove saved decision ${item.date} ${item.cutoff}`}
          onClick={remove}
        >
          <Trash2 size={16} />
        </button>
      </div>
      <p className="eyebrow">PURCHASE DECISION</p>
      <h3>{dateLabel(item.date, { day: "numeric", month: "long" })}</h3>
      <p className="saved-cutoff">
        <Clock3 size={14} />
        {item.cutoff} GMT information cutoff
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          saveNote(note);
          setSaved(true);
        }}
      >
        <label>
          Decision note
          <textarea
            value={note}
            maxLength={400}
            rows={3}
            placeholder="Add a question, observation or follow-up…"
            onChange={(event) => {
              changeNote(event.target.value);
              setSaved(false);
            }}
          />
        </label>
        <div className="note-actions">
          <small>{note.length}/400</small>
          {saved && (
            <span role="status">
              <Check size={13} /> Note saved
            </span>
          )}
          <button className="text-button" type="submit">
            Save note
          </button>
        </div>
      </form>
      <button
        className="button saved-open"
        aria-label={`Open saved decision ${item.date} ${item.cutoff}`}
        onClick={open}
      >
        Replay this decision <ArrowRight size={16} />
      </button>
    </article>
  );
}

export default function Workspace({
  user,
  memory,
  update,
  theme,
  setTheme,
  openAccount,
  openDecision,
  navigate,
  removeDecision,
}: {
  user: User | null;
  memory: WorkspaceMemory;
  update: (value: WorkspaceMemory) => void;
  theme: Theme;
  setTheme: (value: Theme) => void;
  openAccount: () => void;
  openDecision: (date: string, cutoff: string) => void;
  navigate: (view: View) => void;
  removeDecision: (item: SavedDecision) => void;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("saved");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const guard = useNavigationGuard();
  const idOf = (item: SavedDecision) => `${item.date}:${item.cutoff}`;
  const dirty = memory.saved.some(
    (item) =>
      drafts[idOf(item)] !== undefined && drafts[idOf(item)] !== item.note,
  );
  useEffect(() => {
    if (!dirty) return;
    guard.setGuard(() => {
      if (
        !window.confirm(
          "You have unsaved decision notes. Discard these edits and leave?",
        )
      )
        return false;
      setDrafts({});
      return true;
    });
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      guard.setGuard(null);
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty, guard]);
  const decisions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const matches = memory.saved.filter((item) =>
      `${item.date} ${dateLabel(item.date, { day: "numeric", month: "long" })} ${item.cutoff} ${item.note}`
        .toLocaleLowerCase()
        .includes(query),
    );
    if (sort !== "saved")
      matches.sort((a, b) => {
        const order = `${a.date} ${a.cutoff}`.localeCompare(
          `${b.date} ${b.cutoff}`,
        );
        return sort === "oldest" ? order : -order;
      });
    return matches;
  }, [memory.saved, search, sort]);
  const latest = memory.recent ?? {
    date: "2026-01-15",
    cutoff: user?.default_cutoff ?? "09:00",
  };
  return (
    <>
      <div className="workspace-welcome">
        <div>
          <span className="pill-label">
            <UserRound size={13} />{" "}
            {user ? "YOUR PERSONAL WORKSPACE" : "YOUR PILOT WORKSPACE"}
          </span>
          <h1>
            {user
              ? `Welcome back, ${user.name.split(" ")[0]}.`
              : "Make this space your own."}
          </h1>
          <p>Your decisions, your notes, your way of working.</p>
        </div>
        <button className="button" onClick={openAccount}>
          <UserRound size={16} />
          {user ? "Manage account" : "Log in to your account"}
        </button>
      </div>
      <section className="workspace-resume panel">
        <div className="resume-orbit" aria-hidden="true">
          <Clock3 size={32} />
        </div>
        <div>
          <p className="eyebrow">PICK UP WHERE YOU LEFT OFF</p>
          <h2>
            {dateLabel(latest.date, { day: "numeric", month: "long" })} ·{" "}
            {latest.cutoff} GMT
          </h2>
          <p>
            Replay the next delivery day using only the information available
            before your cutoff.
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => openDecision(latest.date, latest.cutoff)}
        >
          Continue decision <ArrowRight size={16} />
        </button>
      </section>
      <div className="workspace-section-heading">
        <div>
          <p className="eyebrow">KEEP YOUR THINKING TOGETHER</p>
          <h2>
            Saved decisions{" "}
            <span className="count-badge">{memory.saved.length}</span>
          </h2>
        </div>
        <button className="text-button" onClick={() => navigate("desk")}>
          Browse decision desk <ArrowRight size={15} />
        </button>
      </div>
      <p className="workspace-storage-note">
        Saved decisions and notes are kept on this browser
        {user ? ` for ${user.name}` : " in the guest workspace"}. They do not
        sync between devices.
      </p>
      {dirty && (
        <p className="unsaved-note" role="status">
          You have unsaved notes. Save each note before leaving this workspace.
        </p>
      )}
      {memory.saved.length ? (
        <>
          <div className="saved-tools">
            <label className="saved-search">
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search saved decisions"
                placeholder="Search dates, cutoffs or notes"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="saved-sort">
              Sort by
              <select
                aria-label="Sort saved decisions"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="saved">Recently saved</option>
                <option value="newest">Newest decision</option>
                <option value="oldest">Oldest decision</option>
              </select>
            </label>
          </div>
          <p className="saved-result-count" role="status">
            {decisions.length} of {memory.saved.length} saved decisions
          </p>
          <div className="saved-grid">
            {decisions.map((item) => (
              <SavedCard
                key={`${item.date}:${item.cutoff}`}
                item={item}
                note={drafts[idOf(item)] ?? item.note}
                changeNote={(note) =>
                  setDrafts((current) => ({ ...current, [idOf(item)]: note }))
                }
                open={() => openDecision(item.date, item.cutoff)}
                remove={() => {
                  if (
                    drafts[idOf(item)] !== undefined &&
                    drafts[idOf(item)] !== item.note &&
                    !window.confirm(
                      "Discard this unsaved note and remove the decision?",
                    )
                  )
                    return;
                  setDrafts((current) => {
                    const next = { ...current };
                    delete next[idOf(item)];
                    return next;
                  });
                  removeDecision(item);
                }}
                saveNote={(note) =>
                  update({
                    ...memory,
                    saved: memory.saved.map((other) =>
                      other === item ? { ...item, note } : other,
                    ),
                  })
                }
              />
            ))}
          </div>
          {!decisions.length && (
            <section className="saved-empty panel">
              <h3>No matching decisions</h3>
              <p>Try a different date, cutoff or word from your notes.</p>
              <button className="button" onClick={() => setSearch("")}>
                Clear search
              </button>
            </section>
          )}
        </>
      ) : (
        <section className="saved-empty panel">
          <Bookmark size={28} />
          <h3>Your next good question belongs here.</h3>
          <p>
            Open a decision, choose a cutoff and select “Save decision”. Add a
            note here and revisit it whenever you need.
          </p>
          <button className="button" onClick={() => navigate("desk")}>
            Find a decision to save <ArrowRight size={16} />
          </button>
        </section>
      )}
      <div className="workspace-settings-grid">
        <section className="panel appearance-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">SETTLE IN</p>
              <h2>Your appearance</h2>
            </div>
            <Palette size={20} />
          </div>
          <p className="panel-note">
            Choose an accent for the entire product. Your selection stays with
            this browser workspace.
          </p>
          <fieldset className="accent-options">
            <legend className="sr-only">Workspace accent</legend>
            {[
              { id: "ocean", label: "Ocean", color: "#90b1ff" },
              { id: "mint", label: "Mint", color: "#66dcc6" },
              { id: "violet", label: "Violet", color: "#bca2ff" },
            ].map((item) => (
              <label key={item.id}>
                <input
                  type="radio"
                  name="accent"
                  value={item.id}
                  checked={memory.accent === item.id}
                  onChange={() =>
                    update({ ...memory, accent: item.id as Accent })
                  }
                />
                <span style={{ background: item.color }} />
                {item.label}
                {memory.accent === item.id && <Check size={14} />}
              </label>
            ))}
          </fieldset>
          <div className="appearance-mode">
            <span>Workspace theme</span>
            <div role="group" aria-label="Workspace theme">
              <button
                aria-pressed={theme === "light"}
                onClick={() => setTheme("light")}
              >
                Day
              </button>
              <button
                aria-pressed={theme === "dark"}
                onClick={() => setTheme("dark")}
              >
                Night
              </button>
            </div>
          </div>
        </section>
        <section className="panel workspace-account">
          <ShieldCheck size={25} />
          <h2>
            {user
              ? "Your account, in your control."
              : "A little more personal."}
          </h2>
          <p>
            {user
              ? "Update your name, save a default cutoff or change your password. Theme and cutoff preferences are stored with your account."
              : "Create an account to save your default theme and information cutoff. Public forecasts and accuracy analysis are always open."}
          </p>
          <button className="button" onClick={openAccount}>
            {user ? "Profile & security" : "Open account options"}
            <ArrowRight size={16} />
          </button>
          <button className="text-button" onClick={() => navigate("method")}>
            Understand the data behind your decisions <ArrowRight size={14} />
          </button>
        </section>
      </div>
    </>
  );
}
