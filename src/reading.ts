import { z } from "zod";
import type { Entry, RecordItem } from "./domain";

export const readingSchema = z.object({
  minutes: z.number().int().min(1).max(1440),
  author: z.string().max(200),
  createdAt: z.iso.datetime(),
});

export function validReadingDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "0001-01-01" &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

export function validateReadingEntry(entry: Entry) {
  readingSchema.parse(entry.reading);
  if (!entry.title.trim() || entry.title.length > 300)
    throw new Error("Enter a book title of up to 300 characters.");
  if (!validReadingDate(entry.date))
    throw new Error("Enter a valid reading date.");
  if (entry.paperId)
    throw new Error("A reading session cannot be a paper note.");
}

export function sortReadingSessions(entries: RecordItem<"entry">[]) {
  return [...entries].sort(
    (a, b) =>
      b.data.date.localeCompare(a.data.date) ||
      (b.data.reading?.createdAt || "").localeCompare(
        a.data.reading?.createdAt || "",
      ) ||
      a.id.localeCompare(b.id),
  );
}

export function readingPreview(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*>`~_[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
