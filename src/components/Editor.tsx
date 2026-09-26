import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
} from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  EditorState,
  StateField,
  Compartment,
  Annotation,
  Transaction,
} from "@codemirror/state";
import {
  EditorView,
  Decoration,
  WidgetType,
  keymap,
  placeholder,
  drawSelection,
} from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { languages } from "@codemirror/language-data";
import { indentWithTab, isolateHistory } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { Code2, Eye, ImagePlus } from "lucide-react";
import { Markdown } from "./Markdown";
import type { Snapshot } from "../domain";
type Context = {
  records: Snapshot;
  onAnnotation?: (id: string) => void;
  client: QueryClient;
};
const externalUpdate = Annotation.define<boolean>();
class PreviewWidget extends WidgetType {
  root?: Root;
  resize?: ResizeObserver;
  constructor(
    readonly text: string,
    readonly context: Context,
    readonly from: number,
  ) {
    super();
  }
  get assetKey() {
    return this.context.records
      .filter((r) => this.text.includes(`asset:${r.id}`))
      .map((r) => `${r.id}:${r.revision}`)
      .join("|");
  }
  eq(other: PreviewWidget) {
    return (
      other.text === this.text &&
      other.assetKey === this.assetKey &&
      other.from === this.from
    );
  }
  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "live-block";
    this.resize = new ResizeObserver(() => view.requestMeasure());
    this.resize.observe(el);
    this.root = createRoot(el);
    this.root.render(
      <QueryClientProvider client={this.context.client}>
        <Markdown
          text={this.text}
          records={this.context.records}
          onAnnotation={this.context.onAnnotation}
          onCaption={(start, end, caption) => {
            if (
              view.state.sliceDoc(this.from, this.from + this.text.length) !==
              this.text
            )
              return;
            const source = this.text.slice(start, end);
            const next = source.replace(
              /^!\[(?:\\.|[^\]])*\]/,
              () =>
                `![${caption.replace(/[\\[\]]/g, "\\$&").replace(/\n/g, " ")}]`,
            );
            view.dispatch({
              changes: {
                from: this.from + start,
                to: this.from + end,
                insert: next,
              },
            });
          }}
        />
      </QueryClientProvider>,
    );
    return el;
  }
  destroy() {
    this.resize?.disconnect();
    const root = this.root;
    queueMicrotask(() => root?.unmount());
  }
  ignoreEvent(event: Event) {
    // Keep a source link alive between pointer-down and click. Moving the
    // CodeMirror cursor first would replace this widget with its Markdown.
    return (
      event.target instanceof Element &&
      !!event.target.closest("a, button, input, select, textarea")
    );
  }
}
export function previewRanges(
  state: EditorState,
): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  const doc = state.doc;
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    if (!line.text.trim()) continue;
    let end = n;
    if (/^```/.test(line.text)) {
      while (end < doc.lines && !/^```/.test(doc.line(++end).text)) {}
      if (end === n) continue;
    } else if (/^\s*\$\$\s*$/.test(line.text)) {
      while (end < doc.lines && !/^\s*\$\$\s*$/.test(doc.line(++end).text)) {}
    } else if (/^\s*(?:[-*+] |\d+[.)] |>\s?|\|)/.test(line.text)) {
      // Keep contiguous lists, quotes and tables together so numbering and
      // nested Markdown structure survive live rendering.
      while (
        end < doc.lines &&
        /^\s*(?:[-*+] |\d+[.)] |>\s?|\|| {2,}\S)/.test(doc.line(end + 1).text)
      )
        end++;
    } else if (!/^\s*#/.test(line.text)) {
      while (
        end < doc.lines &&
        doc.line(end + 1).text.trim() &&
        !/^\s*(?:#|```|\$\$|[-*+] |\d+[.)] |>\s?|\|)/.test(
          doc.line(end + 1).text,
        )
      )
        end++;
    }
    const to = doc.line(end).to;
    const active = state.selection.ranges.some(
      (r) => r.from <= to && r.to >= line.from,
    );
    if (!active) ranges.push({ from: line.from, to });
    n = end;
  }
  return ranges;
}
function livePreview(context: Context) {
  return StateField.define<DecorationSet>({
    create: build,
    update: (value, tr) =>
      tr.docChanged || tr.selection ? build(tr.state) : value,
    provide: (f) => EditorView.decorations.from(f),
  });
  function build(state: EditorState) {
    return Decoration.set(
      previewRanges(state).map((r) =>
        Decoration.replace({
          widget: new PreviewWidget(
            state.sliceDoc(r.from, r.to),
            context,
            r.from,
          ),
          block: true,
        }).range(r.from, r.to),
      ),
    );
  }
}
export interface EditorHandle {
  insert: (text: string) => void;
}
export const Editor = forwardRef<
  EditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    records: Snapshot;
    onAnnotation?: (id: string) => void;
    onUpload?: (file: File) => Promise<string>;
    compact?: boolean;
    label?: string;
  }
>(function Editor(
  {
    value,
    onChange,
    records,
    onAnnotation,
    onUpload,
    compact,
    label = "Note editor",
  },
  ref,
) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    config = useRef(new Compartment()),
    callbacks = useRef({ onChange, onUpload, onAnnotation }),
    uploadAnchor = useRef<{ from: number; to: number } | null>(null),
    input = useRef<HTMLInputElement>(null);
  const client = useQueryClient(),
    [source, setSource] = useState(false),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false);
  callbacks.current = { onChange, onUpload, onAnnotation };
  const assetKey = records
    .filter((r) => r.kind === "asset")
    .map((r) => `${r.id}:${r.revision}`)
    .sort()
    .join("|");
  const assets = useMemo(
    () => records.filter((r) => r.kind === "asset"),
    [assetKey],
  );
  const context = useMemo(
    () => ({
      records: assets,
      client,
      onAnnotation: (id: string) => callbacks.current.onAnnotation?.(id),
    }),
    [assets, client],
  );
  const insert = (text: string) => {
    const v = view.current;
    if (v) {
      const at = v.state.selection.main;
      v.dispatch({
        changes: { from: at.from, to: at.to, insert: text },
        selection: { anchor: at.from + text.length },
      });
      v.focus();
    }
  };
  useImperativeHandle(ref, () => ({ insert }));
  const handleFile = async (file: File) => {
    if (!callbacks.current.onUpload) return;
    if (uploadAnchor.current) {
      setError("Wait for the current image upload before adding another.");
      return;
    }
    const editor = view.current;
    if (!editor) return;
    uploadAnchor.current = {
      from: editor.state.selection.main.from,
      to: editor.state.selection.main.to,
    };
    setUploading(true);
    setError("");
    try {
      const id = await callbacks.current.onUpload(file);
      const at = uploadAnchor.current;
      if (at && view.current === editor) {
        const text = `\n![](asset:${id})\n`;
        editor.dispatch({
          changes: { ...at, insert: text },
          annotations: isolateHistory.of("full"),
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      uploadAnchor.current = null;
      setUploading(false);
    }
  };
  const handleFileRef = useRef(handleFile);
  handleFileRef.current = handleFile;
  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          markdown({ codeLanguages: languages }),
          history(),
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
          drawSelection(),
          syntaxHighlighting(defaultHighlightStyle),
          EditorView.lineWrapping,
          placeholder(compact ? "Write a reflection…" : "Write a note…"),
          EditorView.contentAttributes.of({
            "aria-label": label,
            spellcheck: "true",
          }),
          config.current.of(livePreview(context)),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && uploadAnchor.current) {
              const at = uploadAnchor.current;
              let touched = false;
              u.changes.iterChangedRanges((from, to) => {
                if (from < at.to && to > at.from) touched = true;
              });
              const from = u.changes.mapPos(at.from, 1);
              uploadAnchor.current = {
                from,
                to: touched ? from : u.changes.mapPos(at.to, 1),
              };
            }
            if (
              u.docChanged &&
              !u.transactions.some((t) => t.annotation(externalUpdate))
            )
              callbacks.current.onChange(u.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            drop(e) {
              if (e.dataTransfer?.files.length && callbacks.current.onUpload) {
                e.preventDefault();
                void handleFileRef.current(e.dataTransfer.files[0]);
                return true;
              }
              return false;
            },
            paste(e) {
              const file = e.clipboardData?.files[0];
              if (file && callbacks.current.onUpload) {
                e.preventDefault();
                void handleFileRef.current(file);
                return true;
              }
              return false;
            },
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);
  useEffect(() => {
    const v = view.current;
    if (v && value !== v.state.doc.toString())
      v.dispatch({
        changes: minimalChange(v.state.doc.toString(), value),
        annotations: [
          externalUpdate.of(true),
          Transaction.addToHistory.of(false),
        ],
      });
  }, [value]);
  useEffect(() => {
    view.current?.dispatch({
      effects: config.current.reconfigure(source ? [] : livePreview(context)),
    });
  }, [source, context]);
  return (
    <div
      className={`editor ${compact ? "compact" : ""} ${source ? "source-mode" : ""}`}
    >
      <div className="editor-toolbar">
        <div className="row">
          {onUpload && (
            <button
              className="icon-button"
              aria-label="Insert image"
              disabled={uploading}
              onClick={() => input.current?.click()}
            >
              <ImagePlus size={16} />
            </button>
          )}
          <button
            className="icon-button"
            aria-label={source ? "Use live preview" : "Edit Markdown source"}
            onClick={() => setSource(!source)}
          >
            {source ? <Eye size={16} /> : <Code2 size={16} />}
          </button>
        </div>
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          if (e.target.files?.[0]) void handleFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {error && <p className="inline-error">{error}</p>}
      {uploading && <p className="muted">Uploading image…</p>}
      <div ref={host} />
    </div>
  );
});

// One bounded replacement preserves positions outside the actual remote change.
export function minimalChange(before: string, after: string) {
  let from = 0,
    a = before.length,
    b = after.length;
  while (from < a && from < b && before[from] === after[from]) from++;
  while (a > from && b > from && before[a - 1] === after[b - 1]) {
    a--;
    b--;
  }
  return { from, to: a, insert: after.slice(from, b) };
}
