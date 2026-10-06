import type { WorkTransport } from "../src/workTimeSync";
import type { RecordItem } from "../src/domain";
export function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
    key: (i) => [...data.keys()][i] ?? null,
  };
}
export function account(): WorkTransport {
  const days = new Map<string, RecordItem<"work_time">>();
  return {
    list: async () => structuredClone([...days.values()]),
    save: async (date, field, value, expected) => {
      const prior = days.get(date);
      if (prior && prior.data[field] === value)
        return { conflict: false, record: structuredClone(prior) };
      if (prior && (prior.data[field] ?? null) !== expected)
        return { conflict: true, record: structuredClone(prior) };
      const record: RecordItem<"work_time"> = {
        id: prior?.id || crypto.randomUUID(),
        kind: "work_time",
        data: { ...prior?.data, date, [field]: value },
        revision: (prior?.revision || 0) + 1,
        deleted_at: null,
        updated_at: new Date().toISOString(),
      };
      days.set(date, record);
      return { conflict: false, record: structuredClone(record) };
    },
  };
}
