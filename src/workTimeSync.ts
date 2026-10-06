import type { RecordItem } from "./domain";
import { readWorkLog, totalWorkedSeconds, validSeconds } from "./workTime";

export type WorkField = "actualSeconds" | "taskInput";
type Value = number | string | null;
type WorkRecord = RecordItem<"work_time">;
export interface WorkTransport {
  list(): Promise<WorkRecord[]>;
  save(
    date: string,
    field: WorkField,
    value: number | string,
    expected: Value,
  ): Promise<{ conflict: boolean; record: WorkRecord }>;
}
export interface WorkEdit {
  id: string;
  date: string;
  field: WorkField;
  value: number | string;
  expected: Value;
  legacy?: boolean;
}
export interface WorkState {
  records: WorkRecord[];
  pending: WorkEdit[];
  conflicts: Record<string, Value>;
  ready: boolean;
  error: string;
  recoveryError: string;
}
export const workPendingPrefix = "kais-notebook:work-pending:";
// Export must not omit legacy hours if this browser opened Settings before Today.
export function hasUnsyncedWorkTime(storage: Storage, scope: string): boolean {
  for (let i = 0; i < storage.length; i++)
    if (storage.key(i)?.startsWith(workPendingPrefix + scope + ":"))
      return true;
  const acknowledged = (date: string, field: WorkField, value: unknown) =>
    storage.getItem(`kais-notebook:work-imported:${scope}:${date}:${field}`) ===
    JSON.stringify(value);
  const log = readWorkLog(storage.getItem(`kais-notebook:work-time:${scope}`));
  if (
    Object.entries(log).some(
      ([date, seconds]) => !acknowledged(date, "actualSeconds", seconds),
    )
  )
    return true;
  const tasks = JSON.parse(
    storage.getItem(`kais-notebook:time-calculator:${scope}`) || "null",
  );
  return tasks !== null && !acknowledged(tasks.date, "taskInput", tasks.input);
}
const validDate = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
const validValue = (field: WorkField, value: unknown) =>
  field === "actualSeconds"
    ? validSeconds(value)
    : typeof value === "string" && value.length <= 10000;

// Independent durable slots keep separate tabs from erasing pending writes.
// Acknowledgments only remove the exact edit they saved.
export class WorkTimeSync {
  private state: WorkState = {
    records: [],
    pending: [],
    conflicts: {},
    ready: false,
    error: "",
    recoveryError: "",
  };
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private refreshing: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private prefix: string;
  constructor(
    private storage: Storage,
    private transport: WorkTransport,
    private scope: string,
  ) {
    this.prefix = workPendingPrefix + scope + ":";
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)!;
        if (!key.startsWith(this.prefix)) continue;
        const edit = JSON.parse(storage.getItem(key)!);
        if (
          !edit ||
          typeof edit.id !== "string" ||
          key !== this.prefix + edit.id ||
          !validDate(edit.date) ||
          !["actualSeconds", "taskInput"].includes(edit.field) ||
          !validValue(edit.field, edit.value) ||
          (edit.expected !== null && !validValue(edit.field, edit.expected))
        )
          throw new Error("Invalid pending work time");
        this.state.pending.push(edit);
      }
      this.importLegacy();
    } catch {
      this.state.recoveryError =
        "Saved browser hours could not be read. The original data has not been changed.";
    }
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(patch: Partial<WorkState> = {}) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((f) => f());
  }
  private legacyKey(edit: WorkEdit) {
    return `kais-notebook:work-imported:${this.scope}:${edit.date}:${edit.field}`;
  }
  private importLegacy() {
    const add = (date: string, field: WorkField, value: number | string) => {
      if (!validDate(date) || !validValue(field, value))
        throw new Error("Invalid legacy time");
      const edit: WorkEdit = {
        id: `legacy:${date}:${field}`,
        date,
        field,
        value,
        expected: null,
        legacy: true,
      };
      if (
        this.storage.getItem(this.legacyKey(edit)) === JSON.stringify(value) ||
        this.state.pending.some((p) => p.id === edit.id)
      )
        return;
      this.storage.setItem(this.prefix + edit.id, JSON.stringify(edit));
      this.state.pending.push(edit);
    };
    const log = readWorkLog(
      this.storage.getItem(`kais-notebook:work-time:${this.scope}`),
    );
    for (const [date, seconds] of Object.entries(log))
      add(date, "actualSeconds", seconds);
    const input = JSON.parse(
      this.storage.getItem(`kais-notebook:time-calculator:${this.scope}`) ||
        "null",
    );
    if (input !== null) add(input.date, "taskInput", input.input);
  }
  private merge(record: WorkRecord) {
    const prior = this.state.records.find((r) => r.id === record.id);
    if (!prior || prior.revision <= record.revision)
      this.state = {
        ...this.state,
        records: this.state.records
          .filter((r) => r.id !== record.id)
          .concat(record),
      };
  }
  refresh = (): Promise<void> => {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        for (const record of await this.transport.list()) this.merge(record);
        this.emit({ ready: true, error: "" });
        await this.flush();
      } catch {
        this.emit({
          error:
            "Hours have not synced. Keep this tab open and retry when connected.",
        });
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  };
  value(date: string, field: WorkField): Value {
    return (
      this.state.pending
        .filter((p) => p.date === date && p.field === field)
        .at(-1)?.value ??
      this.state.records.find((r) => r.data.date === date)?.data[field] ??
      null
    );
  }
  total(): number | null {
    if (!this.state.ready || this.state.recoveryError) return null;
    const log = Object.fromEntries(
      this.state.records.map((r) => [r.data.date, r.data.actualSeconds || 0]),
    );
    for (const edit of this.state.pending)
      if (edit.field === "actualSeconds") log[edit.date] = edit.value as number;
    try {
      return totalWorkedSeconds(log);
    } catch {
      return null;
    }
  }
  change(date: string, field: WorkField, value: number | string) {
    if (!this.state.ready || !validValue(field, value)) return;
    const prior = this.state.pending
      .filter((p) => p.date === date && p.field === field && !p.legacy)
      .at(-1);
    const edit: WorkEdit = {
      id: prior?.id || crypto.randomUUID(),
      date,
      field,
      value,
      expected: prior
        ? prior.expected
        : (this.state.records.find((r) => r.data.date === date)?.data[field] ??
          null),
    };
    let error = "";
    try {
      this.storage.setItem(this.prefix + edit.id, JSON.stringify(edit));
    } catch {
      error =
        "Browser recovery is unavailable. Keep this tab open until hours finish syncing.";
    }
    this.emit({
      pending: this.state.pending.filter((p) => p.id !== edit.id).concat(edit),
      error,
    });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, 400);
  }
  private acknowledge(edit: WorkEdit) {
    if (edit.legacy)
      this.storage.setItem(this.legacyKey(edit), JSON.stringify(edit.value));
    const stored = this.storage.getItem(this.prefix + edit.id);
    if (!stored || stored === JSON.stringify(edit))
      this.storage.removeItem(this.prefix + edit.id);
    this.state.pending = this.state.pending.filter((p) => p.id !== edit.id);
    const conflicts = { ...this.state.conflicts };
    delete conflicts[edit.id];
    this.state.conflicts = conflicts;
  }
  resolve(id: string, useDevice: boolean) {
    const edit = this.state.pending.find((p) => p.id === id);
    if (!edit || !(id in this.state.conflicts)) return;
    try {
      if (useDevice) {
        const next = { ...edit, expected: this.state.conflicts[id] };
        this.storage.setItem(this.prefix + id, JSON.stringify(next));
        this.state.pending = this.state.pending.map((p) =>
          p.id === id ? next : p,
        );
        const conflicts = { ...this.state.conflicts };
        delete conflicts[id];
        this.state.conflicts = conflicts;
      } else this.acknowledge(edit);
      this.emit({ error: "" });
      void this.flush();
    } catch {
      this.emit({
        error: "The choice could not be saved. Keep this tab open and retry.",
      });
    }
  }
  flush = (): Promise<void> => {
    clearTimeout(this.timer);
    if (this.running) return this.running;
    if (
      !this.state.ready ||
      !this.state.pending.some((p) => !(p.id in this.state.conflicts))
    )
      return Promise.resolve();
    this.running = (async () => {
      try {
        for (;;) {
          const edit = this.state.pending.find(
            (p) => !(p.id in this.state.conflicts),
          );
          if (!edit) break;
          const result = await this.transport.save(
            edit.date,
            edit.field,
            edit.value,
            edit.expected,
          );
          this.merge(result.record);
          if (result.conflict) {
            this.state.conflicts = {
              ...this.state.conflicts,
              [edit.id]: result.record.data[edit.field] ?? null,
            };
          } else {
            const latest = this.state.pending.find((p) => p.id === edit.id);
            if (latest && latest !== edit && latest.value !== edit.value) {
              const next = { ...latest, expected: edit.value };
              this.storage.setItem(this.prefix + edit.id, JSON.stringify(next));
              this.state.pending = this.state.pending.map((p) =>
                p.id === edit.id ? next : p,
              );
            } else this.acknowledge(edit);
          }
          this.emit({ error: "" });
        }
      } catch {
        this.emit({
          error:
            "Hours have not synced. Keep this tab open and retry when connected.",
        });
      } finally {
        this.running = null;
        this.emit();
      }
    })();
    return this.running;
  };
}
