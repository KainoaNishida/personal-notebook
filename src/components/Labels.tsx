import { useState, useRef } from "react";
import { Check, Plus, Tag } from "lucide-react";
import { ofKind, uid } from "../domain";
import type { Entry, RecordItem, Snapshot } from "../domain";
import { useSave } from "../hooks";
import { Modal, ErrorNotice } from "./UI";
import { ColorSelector, validColor } from "./ColorSelector";

type Label = RecordItem<"label">;
export function LabelChip({
  label,
  selected,
  onClick,
}: {
  label: Label;
  selected?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="label-dot" style={{ background: label.data.color }} />
      {label.data.name}
      {selected && <Check size={13} aria-hidden="true" />}
    </>
  );
  return onClick ? (
    <button
      type="button"
      className="label-chip"
      aria-pressed={!!selected}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <span className="label-chip">{content}</span>
  );
}
function LabelForm({
  notebookId,
  editing,
  onSaved,
  onCancel,
}: {
  notebookId: string;
  editing?: Label;
  onSaved: (label: Label) => void;
  onCancel?: () => void;
}) {
  const save = useSave();
  const [name, setName] = useState(editing?.data.name || "");
  const [color, setColor] = useState(editing?.data.color || "#f59a56");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="label-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || !validColor(color) || !name.trim()) return;
        setBusy(true);
        setError("");
        try {
          const result = await save(
            "label",
            editing?.id || uid(),
            { notebookId, name: name.trim(), color: color.toLowerCase() },
            editing?.revision || 0,
          );
          setName("");
          onSaved(result);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        Label name
        <input
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <ColorSelector label="Label color" value={color} onChange={setColor} />
      <ErrorNotice error={error} />
      <div className="row">
        <button
          className="primary"
          disabled={busy || !name.trim() || !validColor(color)}
        >
          {editing ? "Save label" : "Create label"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
export function ManageLabels({
  notebookId,
  records,
}: {
  notebookId: string;
  records: Snapshot;
}) {
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Label>();
  const labels = ofKind(records, "label").filter(
    (l) => l.data.notebookId === notebookId,
  );
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setEditing(undefined);
          setOpen(true);
        }}
      >
        <Tag size={15} />
        Manage labels
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Manage labels"
        description="Labels belong to this notebook. Select one to rename it or change its color."
      >
        <div className="label-options">
          {labels.map((label) => (
            <LabelChip
              key={label.id}
              label={label}
              selected={editing?.id === label.id}
              onClick={() => setEditing(label)}
            />
          ))}
        </div>
        <LabelForm
          key={editing?.id || "new"}
          notebookId={notebookId}
          editing={editing}
          onSaved={() => setEditing(undefined)}
          onCancel={editing ? () => setEditing(undefined) : undefined}
        />
      </Modal>
    </>
  );
}
export function EntryLabels({
  value,
  records,
  onChange,
}: {
  value: Entry;
  records: Snapshot;
  onChange: (value: Entry) => void;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [creating, setCreating] = useState(false);
  const latest = useRef(value);
  latest.current = value;
  const labels = ofKind(records, "label").filter(
    (l) => l.data.notebookId === value.notebookId,
  );
  const toggle = (id: string) =>
    onChange({
      ...value,
      labelIds: value.labelIds?.includes(id)
        ? value.labelIds.filter((v) => v !== id)
        : [...(value.labelIds || []), id],
    });
  return (
    <div className="entry-labels">
      {labels
        .filter((l) => value.labelIds?.includes(l.id))
        .map((l) => (
          <LabelChip key={l.id} label={l} />
        ))}
      <button
        type="button"
        className="text-button"
        onClick={() => {
          setSearch("");
          setCreating(false);
          setOpen(true);
        }}
      >
        <Plus size={14} />
        Add labels
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Add labels"
        description="Select labels for this page. Your note stays open and saves automatically."
      >
        <label className="field">
          Search labels
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <div className="label-options">
          {labels
            .filter((l) =>
              l.data.name.toLowerCase().includes(search.toLowerCase()),
            )
            .map((l) => (
              <LabelChip
                key={l.id}
                label={l}
                selected={value.labelIds?.includes(l.id)}
                onClick={() => toggle(l.id)}
              />
            ))}
        </div>
        {!labels.length && (
          <p className="muted">No labels yet in this notebook.</p>
        )}
        {creating ? (
          <LabelForm
            notebookId={value.notebookId}
            onSaved={(l) => {
              onChange({
                ...latest.current,
                labelIds: [
                  ...new Set([...(latest.current.labelIds || []), l.id]),
                ],
              });
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <button type="button" onClick={() => setCreating(true)}>
            Create a label
          </button>
        )}
        <button
          className="label-done"
          type="button"
          onClick={() => setOpen(false)}
        >
          Done
        </button>
      </Modal>
    </div>
  );
}
