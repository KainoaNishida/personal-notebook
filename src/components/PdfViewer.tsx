import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as pdfjs from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  ChevronLeft,
  ChevronRight,
  Scan,
  Maximize2,
  Minimize2,
  Highlighter,
  Link2,
  Sparkles,
  Minus,
  Plus,
} from "lucide-react";
import { download } from "../service";
import { ofKind, normalizeRect } from "../domain";
import type { Snapshot, RecordItem, Rect } from "../domain";
import { ErrorNotice } from "./UI";
pdfjs.GlobalWorkerOptions.workerSrc = worker;
export { pdfjs };
export interface Selection {
  page: number;
  text: string;
  context: string;
  rects: Rect[];
  kind: "text" | "region";
  image?: Blob;
}
export function PdfViewer({
  paper,
  records,
  activeAnnotation,
  focusKey,
  onSelect,
  expanded,
  onToggleExpand,
}: {
  expanded?: boolean;
  onToggleExpand?: () => void;
  paper: RecordItem<"paper">;
  records: Snapshot;
  activeAnnotation?: RecordItem<"annotation">;
  focusKey?: string;
  onSelect: (s: Selection, explain: boolean) => Promise<void>;
}) {
  const asset = ofKind(records, "asset").find(
    (r) => r.id === paper.data.assetId,
  );
  const blob = useQuery({
    queryKey: ["asset", paper.data.assetId],
    queryFn: () => download(asset!.data),
    enabled: !!asset,
    staleTime: 300000,
  });
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy>(),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(1),
    [error, setError] = useState(""),
    [mode, setMode] = useState<"text" | "region">("text"),
    [selection, setSelection] = useState<Selection>(),
    [busy, setBusy] = useState(false),
    [emptyText, setEmptyText] = useState(false);
  const [size, setSize] = useState({ width: 550, height: 700 }),
    [drag, setDrag] = useState<Rect>(),
    [ready, setReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    textLayer = useRef<HTMLDivElement>(null),
    pageEl = useRef<HTMLDivElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    pageText = useRef(""),
    start = useRef<{ x: number; y: number } | undefined>(undefined),
    [width, setWidth] = useState(550);
  const readingY = useRef<number | null>(null);
  function changeZoom(next: number) {
    const el = scroll.current;
    if (el)
      readingY.current =
        (el.scrollTop + el.clientHeight / 2 - 22) / size.height;
    setZoom(Math.round(next * 10) / 10);
  }
  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
    if (readingY.current !== null) {
      el.scrollTop = Math.max(
        0,
        readingY.current * size.height + 22 - el.clientHeight / 2,
      );
      readingY.current = null;
    }
  }, [size.width, size.height]);
  useEffect(() => {
    const el = scroll.current!;
    const o = new ResizeObserver(() =>
      setWidth(Math.max(260, el.clientWidth - 44)),
    );
    o.observe(el);
    return () => o.disconnect();
  }, []);
  useEffect(() => {
    if (!blob.data) return;
    let task: pdfjs.PDFDocumentLoadingTask | undefined;
    let stopped = false;
    void blob.data
      .arrayBuffer()
      .then((data) => {
        if (stopped) return;
        task = pdfjs.getDocument({ data });
        return task.promise.then((d) => {
          if (!stopped) setDoc(d);
        });
      })
      .catch((e) => setError(e.message));
    return () => {
      stopped = true;
      void task?.destroy();
    };
  }, [blob.data]);
  const anchorId = activeAnnotation?.id;
  const anchorPaper = activeAnnotation?.data.paperId;
  const anchorPage = activeAnnotation?.data.page;
  const anchorX = activeAnnotation?.data.rects[0]?.x;
  const anchorY = activeAnnotation?.data.rects[0]?.y;
  useEffect(() => {
    if (anchorPaper === paper.id && anchorPage !== undefined) {
      setPage(anchorPage + 1);
      setSelection(undefined);
    }
  }, [anchorId, anchorPaper, anchorPage, paper.id, focusKey]);
  useEffect(() => {
    if (!doc) return;
    let stopped = false,
      render: pdfjs.RenderTask | undefined,
      layer: pdfjs.TextLayer | undefined;
    setReady(false);
    setSelection(undefined);
    setError("");
    void (async () => {
      const p = await doc.getPage(page);
      if (stopped) return;
      const unit = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: (width / unit.width) * zoom });
      setSize({ width: viewport.width, height: viewport.height });
      const c = canvas.current!;
      c.width = Math.floor(viewport.width * devicePixelRatio);
      c.height = Math.floor(viewport.height * devicePixelRatio);
      c.style.width = `${viewport.width}px`;
      c.style.height = `${viewport.height}px`;
      render = p.render({
        canvas: c,
        canvasContext: c.getContext("2d")!,
        viewport,
        transform: [devicePixelRatio, 0, 0, devicePixelRatio, 0, 0],
      });
      await render.promise;
      if (stopped) return;
      const content = await p.getTextContent();
      if (stopped) return;
      pageText.current = content.items
        .map((i) => ("str" in i ? i.str : ""))
        .join(" ");
      setEmptyText(!pageText.current.trim());
      textLayer.current!.replaceChildren();
      textLayer.current!.style.setProperty(
        "--scale-factor",
        String(viewport.scale),
      );
      textLayer.current!.style.setProperty(
        "--total-scale-factor",
        String(viewport.scale),
      );
      layer = new pdfjs.TextLayer({
        textContentSource: content,
        container: textLayer.current!,
        viewport,
      });
      await layer.render();
      if (!stopped) setReady(true);
    })().catch((e) => {
      if (
        !stopped &&
        e.name !== "RenderingCancelledException" &&
        e.name !== "AbortException"
      )
        setError(e.message);
    });
    return () => {
      stopped = true;
      render?.cancel();
      layer?.cancel();
    };
  }, [doc, page, zoom, width]);
  const lastAnchor = useRef("");
  useEffect(() => {
    if (
      lastAnchor.current !== `${anchorId}:${focusKey}` &&
      ready &&
      anchorX !== undefined &&
      anchorY !== undefined &&
      anchorPage === page - 1
    ) {
      lastAnchor.current = `${anchorId}:${focusKey}`;
      scroll.current?.scrollTo({
        top: Math.max(0, anchorY * size.height - 80),
        left: Math.max(0, anchorX * size.width - 80),
        behavior: "smooth",
      });
    }
  }, [
    ready,
    anchorId,
    anchorPage,
    anchorX,
    anchorY,
    page,
    size.width,
    size.height,
    focusKey,
  ]);
  async function crop(rect: Rect) {
    const c = canvas.current!;
    const out = document.createElement("canvas");
    const factor = Math.min(1, 1400 / (rect.width * c.width));
    out.width = Math.max(1, Math.round(rect.width * c.width * factor));
    out.height = Math.max(1, Math.round(rect.height * c.height * factor));
    out
      .getContext("2d")!
      .drawImage(
        c,
        rect.x * c.width,
        rect.y * c.height,
        rect.width * c.width,
        rect.height * c.height,
        0,
        0,
        out.width,
        out.height,
      );
    return new Promise<Blob>((resolve, reject) =>
      out.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Cannot capture PDF region")),
        "image/png",
      ),
    );
  }
  function captureText() {
    if (mode !== "text" || !ready) return;
    const s = window.getSelection();
    if (
      !s ||
      s.isCollapsed ||
      !s.rangeCount ||
      !pageEl.current?.contains(s.anchorNode)
    )
      return;
    const range = s.getRangeAt(0);
    if (!pageEl.current.contains(s.focusNode)) return;
    const bounds = pageEl.current.getBoundingClientRect();
    const rects = Array.from(range.getClientRects())
      .filter((r) => r.width > 1 && r.height > 1)
      .map((r) =>
        normalizeRect(
          {
            x: r.x - bounds.x,
            y: r.y - bounds.y,
            width: r.width,
            height: r.height,
          },
          bounds.width,
          bounds.height,
        ),
      );
    const text = s.toString().slice(0, 10000);
    if (!text.trim() || !rects.length) return;
    const i = pageText.current.indexOf(text);
    const context = pageText.current.slice(
      Math.max(0, i - 400),
      Math.max(0, i) + text.length + 800,
    );
    setSelection({ page: page - 1, text, context, rects, kind: "text" });
  }
  const highlights = ofKind(records, "annotation").filter(
    (a) => a.data.paperId === paper.id && a.data.page === page - 1,
  );
  const submit = async (explain: boolean) => {
    if (!selection) return;
    setBusy(true);
    try {
      await onSelect(selection, explain);
      setSelection(undefined);
      window.getSelection()?.removeAllRanges();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="pdf-panel">
      <div className="pdf-toolbar">
        <div className="row">
          <button
            className="icon-button"
            aria-label="Previous PDF page"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <label className="page-label">
            <input
              aria-label="PDF page"
              type="number"
              min="1"
              max={doc?.numPages || 1}
              value={page}
              disabled={!doc}
              onChange={(e) =>
                setPage(
                  Math.max(
                    1,
                    Math.min(doc?.numPages || 1, Number(e.target.value) || 1),
                  ),
                )
              }
            />
            <span>/ {doc?.numPages || "…"}</span>
          </label>
          <button
            className="icon-button"
            aria-label="Next PDF page"
            disabled={!doc || page === doc.numPages}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="row">
          <button
            className="icon-button"
            aria-label="Zoom out"
            disabled={zoom <= 0.6}
            onClick={() => changeZoom(zoom - 0.1)}
          >
            <Minus size={15} />
          </button>
          <span className="small">{Math.round(zoom * 100)}%</span>
          <button
            className="icon-button"
            aria-label="Zoom in"
            disabled={zoom >= 2}
            onClick={() => changeZoom(zoom + 0.1)}
          >
            <Plus size={15} />
          </button>
          <span className="divider" />
          <button
            aria-label="Select PDF text"
            aria-pressed={mode === "text"}
            className="icon-button"
            onClick={() => setMode("text")}
          >
            <Highlighter size={17} />
          </button>
          <button
            aria-label="Select PDF region"
            disabled={!ready}
            aria-pressed={mode === "region"}
            className="icon-button"
            onClick={() => setMode("region")}
          >
            <Scan size={17} /> Region
          </button>
          <button
            className="icon-button"
            title={expanded ? "Restore split view" : "Expand PDF"}
            aria-label={expanded ? "Restore split view" : "Expand PDF"}
            onClick={onToggleExpand}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>
      <ErrorNotice error={error || blob.error} />
      {!asset && (
        <p className="inline-error">
          The original PDF is missing. Restore the file from a backup.
        </p>
      )}
      {emptyText && (
        <p className="inline-error">
          No selectable text on this page. Select a region for a visual
          reference; OCR is not included.
        </p>
      )}
      <div className="pdf-scroll" ref={scroll}>
        {!ready && <p className="pdf-loading">Rendering your paper…</p>}
        <div
          className="pdf-page"
          ref={pageEl}
          style={{ width: size.width, height: size.height }}
          onMouseUp={captureText}
        >
          <canvas ref={canvas} />
          <div
            ref={textLayer}
            className="textLayer"
            style={{ pointerEvents: mode === "text" ? "auto" : "none" }}
          />
          <div className="highlights">
            {highlights.flatMap((a) =>
              a.data.rects.map((r, i) => (
                <div
                  key={`${a.id}-${i}`}
                  className={
                    a.id === activeAnnotation?.id
                      ? "highlight active"
                      : "highlight"
                  }
                  style={{
                    left: r.x * 100 + "%",
                    top: r.y * 100 + "%",
                    width: r.width * 100 + "%",
                    height: r.height * 100 + "%",
                  }}
                />
              )),
            )}
          </div>
          {mode === "region" && (
            <div
              className="region-layer"
              onPointerDown={(e) => {
                if (!ready) return;
                const r = e.currentTarget.getBoundingClientRect();
                start.current = { x: e.clientX - r.x, y: e.clientY - r.y };
                e.currentTarget.setPointerCapture(e.pointerId);
                setDrag(undefined);
              }}
              onPointerMove={(e) => {
                if (!start.current) return;
                const b = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - b.x,
                  y = e.clientY - b.y;
                setDrag(
                  normalizeRect(
                    {
                      x: Math.min(x, start.current.x),
                      y: Math.min(y, start.current.y),
                      width: Math.abs(x - start.current.x),
                      height: Math.abs(y - start.current.y),
                    },
                    b.width,
                    b.height,
                  ),
                );
              }}
              onPointerUp={(e) => {
                const beginning = start.current;
                start.current = undefined;
                if (!beginning) return;
                const bounds = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - bounds.x,
                  y = e.clientY - bounds.y;
                const r = normalizeRect(
                  {
                    x: Math.min(x, beginning.x),
                    y: Math.min(y, beginning.y),
                    width: Math.abs(x - beginning.x),
                    height: Math.abs(y - beginning.y),
                  },
                  bounds.width,
                  bounds.height,
                );
                if (r.width > 0.01 && r.height > 0.01) {
                  void crop(r)
                    .then((image) =>
                      setSelection({
                        page: page - 1,
                        text: `Selected visual region on page ${page}`,
                        context: pageText.current.slice(0, 1800),
                        rects: [r],
                        kind: "region",
                        image,
                      }),
                    )
                    .catch((e) => setError(e.message));
                }
                setDrag(undefined);
              }}
            >
              {drag && (
                <div
                  className="region-box"
                  style={{
                    left: drag.x * 100 + "%",
                    top: drag.y * 100 + "%",
                    width: drag.width * 100 + "%",
                    height: drag.height * 100 + "%",
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
      {selection && (
        <div className="pdf-footer">
          {selection ? (
            <>
              <span>
                {selection.kind === "region"
                  ? "Visual region selected"
                  : `${selection.text.length} characters selected`}
              </span>
              <div className="row">
                <button disabled={busy} onClick={() => void submit(false)}>
                  <Link2 size={14} />
                  Link to notes
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void submit(true)}
                >
                  <Sparkles size={14} />
                  Explain
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
