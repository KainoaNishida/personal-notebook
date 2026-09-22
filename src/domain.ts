import { z } from "zod";

export const kinds = [
  "notebook",
  "entry",
  "day",
  "activity",
  "paper",
  "annotation",
  "asset",
  "settings",
  "conversation",
  "artifact",
] as const;
export type Kind = (typeof kinds)[number];
export interface Notebook {
  name: string;
  description: string;
  color: string;
  icon: string;
  order: number;
  archived: boolean;
}
export interface Entry {
  title: string;
  markdown: string;
  date: string;
  notebookId: string;
  paperId?: string;
}
export interface Paper {
  title: string;
  assetId: string;
  fingerprint: string;
  pages: number;
}
export interface Asset {
  name: string;
  path: string;
  mime: string;
  size: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Annotation {
  paperId: string;
  page: number;
  text: string;
  rects: Rect[];
  kind: "text" | "region";
  imageAssetId?: string;
}
export interface Settings {
  timezone: string;
  theme: "dark" | "light";
}
export type DataMap = {
  notebook: Notebook;
  entry: Entry;
  day: { date: string; markdown: string };
  activity: { date: string; notebookId: string; completed: boolean };
  paper: Paper;
  annotation: Annotation;
  asset: Asset;
  settings: Settings;
  conversation: {
    annotationId: string;
    turns: { question: string; response: AIResponse }[];
  };
  artifact: { annotationId: string; visual: Visual };
};
export interface RecordItem<K extends Kind = Kind> {
  id: string;
  kind: K;
  data: DataMap[K];
  revision: number;
  updated_at: string;
  deleted_at: string | null;
}
export type AnyRecord = { [K in Kind]: RecordItem<K> }[Kind];
export type Snapshot = AnyRecord[];
export const uid = () => crypto.randomUUID();
export const ofKind = <K extends Kind>(
  items: Snapshot,
  kind: K,
): RecordItem<K>[] =>
  items.filter((r) => r.kind === kind && !r.deleted_at) as RecordItem<K>[];
export function today(timezone = "America/Los_Angeles", date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)!.value)
    .join("-");
}
export const shiftDate = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const displayDate = (
  date: string,
  options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" },
) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", options);
export function normalizeRect(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(1, rect.x / width)),
    y = Math.max(0, Math.min(1, rect.y / height));
  return {
    x,
    y,
    width: Math.min(1 - x, Math.max(0, rect.width / width)),
    height: Math.min(1 - y, Math.max(0, rect.height / height)),
  };
}
export const plotSchema = z.object({
  title: z.string().max(200),
  xLabel: z.string().max(100),
  yLabel: z.string().max(100),
  type: z.enum(["line", "scatter"]),
  points: z
    .array(z.object({ x: z.number().finite(), y: z.number().finite() }))
    .min(2)
    .max(200),
});
export const visualSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("equation"),
    title: z.string(),
    source: z.string().max(8000),
    explanation: z.string(),
  }),
  z.object({
    type: z.literal("mermaid"),
    title: z.string(),
    source: z.string().max(8000),
    explanation: z.string(),
  }),
  z.object({
    type: z.literal("plot"),
    title: z.string(),
    source: z
      .string()
      .max(20000)
      .refine((s) => {
        try {
          return plotSchema.safeParse(JSON.parse(s)).success;
        } catch {
          return false;
        }
      }, "Invalid plot"),
    explanation: z.string(),
  }),
]);
export const responseSchema = z.object({
  markdown: z.string().min(1).max(40000),
  assumptions: z.array(z.string()).max(20),
  visuals: z.array(visualSchema).max(4),
});
export type Visual = z.infer<typeof visualSchema>;
export type AIResponse = z.infer<typeof responseSchema>;
export interface AIRequest {
  requestId: string;
  annotationId: string;
  question: string;
  context: string;
  imageAssetId?: string;
  turns: { question: string; response: AIResponse }[];
  visuals: boolean;
}
export interface Usage {
  spent: number;
  reserved: number;
  limit: number;
  month: string;
}
export function visualMarkdown(v: Visual) {
  return `### ${v.title}\n\n${v.type === "equation" ? `$$\n${v.source}\n$$` : `\`\`\`${v.type}\n${v.source}\n\`\`\``}\n\n${v.explanation}`;
}
export function aiMarkdown(response: AIResponse, annotationId: string) {
  return `\n\n> AI-assisted explanation · [Source passage](annotation:${annotationId})\n\n${response.markdown}${response.assumptions.length ? "\n\n**Assumptions and uncertainty**\n" + response.assumptions.map((a) => "- " + a).join("\n") : ""}\n\n${response.visuals.map(visualMarkdown).join("\n\n")}\n`;
}
export function validateUpload(
  file: Pick<File, "size" | "type">,
  pdf: boolean,
) {
  if (
    !(pdf
      ? file.type === "application/pdf"
      : ["image/png", "image/jpeg", "image/webp"].includes(file.type))
  )
    throw new Error(
      pdf ? "Choose a PDF file." : "Choose a PNG, JPEG, or WebP image.",
    );
  if (file.size > (pdf ? 25 : 10) * 1024 * 1024)
    throw new Error(`The file exceeds the ${pdf ? 25 : 10} MB limit.`);
}
export const seedNotebooks: Notebook[] = [
  {
    name: "Research papers",
    description: "Follow an idea all the way through.",
    color: "#b7cba3",
    icon: "science",
    order: 0,
    archived: false,
  },
  {
    name: "System design",
    description: "Understand how the pieces fit.",
    color: "#a5bfce",
    icon: "system",
    order: 1,
    archived: false,
  },
  {
    name: "Art & portraits",
    description: "Look a little closer.",
    color: "#d7b5a3",
    icon: "art",
    order: 2,
    archived: false,
  },
  {
    name: "Reading",
    description: "Good sentences. New perspectives.",
    color: "#c7b8d8",
    icon: "reading",
    order: 3,
    archived: false,
  },
  {
    name: "Movement",
    description: "Make space to move.",
    color: "#d4c398",
    icon: "gym",
    order: 4,
    archived: false,
  },
];
