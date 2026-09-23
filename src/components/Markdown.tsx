import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import { useQuery } from "@tanstack/react-query";
import { download } from "../service";
import { ofKind, plotSchema } from "../domain";
import type { Snapshot } from "../domain";
// Presentation is intentionally independent of canonical asset:<id> Markdown.
// V1 passes no overrides; the art-layout proof exercises this extension point.
export type ImagePresentation = {
  alignment: "inline" | "left" | "right";
  width: number;
};
export function safeUrl(url: string) {
  return /^(https?:|mailto:|asset:|annotation:)/i.test(url) ||
    url.startsWith("#")
    ? url
    : "";
}
export function AssetImage({
  id,
  alt,
  records,
  presentation,
}: {
  id: string;
  alt?: string;
  records: Snapshot;
  presentation?: ImagePresentation;
}) {
  const asset = ofKind(records, "asset").find((r) => r.id === id);
  const query = useQuery({
    queryKey: ["asset", id],
    queryFn: () => download(asset!.data),
    enabled: !!asset,
    staleTime: 300000,
  });
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!query.data) return;
    const u = URL.createObjectURL(query.data);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [query.data]);
  return url ? (
    <span
      className="asset-image"
      style={
        presentation
          ? {
              float:
                presentation.alignment === "inline"
                  ? "none"
                  : presentation.alignment,
              width: `${Math.max(10, Math.min(100, presentation.width))}%`,
              marginInlineEnd:
                presentation.alignment === "left" ? "1rem" : undefined,
              marginInlineStart:
                presentation.alignment === "right" ? "1rem" : undefined,
            }
          : undefined
      }
    >
      <img src={url} alt={alt || asset?.data.name || "Reference image"} />
      {alt && <span className="image-caption">{alt}</span>}
    </span>
  ) : (
    <span className="muted">
      {query.error
        ? "Image unavailable"
        : asset
          ? "Loading image…"
          : "Missing image reference"}
    </span>
  );
}
export function Diagram({ source }: { source: string }) {
  const [svg, setSvg] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setSvg("");
    setError("");
    void (async () => {
      try {
        if (!isPlainDiagram(source))
          throw new Error(
            "Use a plain diagram without HTML, links, or configuration directives.",
          );
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          flowchart: { htmlLabels: false },
          theme: "neutral",
          suppressErrorRendering: true,
        });
        const out = await mermaid.render(
          `diagram-${crypto.randomUUID()}`,
          source,
        );
        if (active) setSvg(out.svg);
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, [source]);
  return error ? (
    <div className="inline-error">
      Diagram needs editing: {error}
      <pre>{source}</pre>
    </div>
  ) : (
    <div
      className="diagram"
      aria-label="Generated diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
export function isPlainDiagram(source: string) {
  // A greater-than sign in a quoted scientific label is ordinary text.
  // Block markup starts, interactive links, and config overrides; Mermaid
  // still parses the grammar and sanitizes its SVG in strict mode.
  return !/%%\{|click\s|<|javascript:/i.test(source);
}
export function Plot({ source }: { source: string }) {
  try {
    const p = plotSchema.parse(JSON.parse(source));
    const xs = p.points.map((p) => p.x),
      ys = p.points.map((p) => p.y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const pos = p.points.map((p) => [
      50 + ((p.x - minX) / (maxX - minX || 1)) * 430,
      225 - ((p.y - minY) / (maxY - minY || 1)) * 185,
    ]);
    return (
      <figure className="plot">
        <svg
          viewBox="0 0 540 275"
          role="img"
          aria-label={`${p.title}. ${p.xLabel} versus ${p.yLabel}`}
        >
          <text x="270" y="18" textAnchor="middle">
            {p.title}
          </text>
          <path d="M50 35 V225 H490" fill="none" stroke="currentColor" />
          {p.type === "line" && (
            <polyline
              points={pos.map((p) => p.join(",")).join(" ")}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
            />
          )}
          {pos.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="3" fill="var(--accent)">
              <title>{`${xs[i]}, ${ys[i]}`}</title>
            </circle>
          ))}
          <text x="50" y="245">
            {minX.toPrecision(3)}
          </text>
          <text x="450" y="245">
            {maxX.toPrecision(3)}
          </text>
          <text x="5" y="42">
            {maxY.toPrecision(3)}
          </text>
          <text x="5" y="225">
            {minY.toPrecision(3)}
          </text>
          <text x="265" y="268" textAnchor="middle">
            {p.xLabel}
          </text>
          <text transform="translate(15 135) rotate(-90)" textAnchor="middle">
            {p.yLabel}
          </text>
        </svg>
        <details>
          <summary>View data</summary>
          <table>
            <thead>
              <tr>
                <th>{p.xLabel}</th>
                <th>{p.yLabel}</th>
              </tr>
            </thead>
            <tbody>
              {p.points.map((p, i) => (
                <tr key={i}>
                  <td>{p.x}</td>
                  <td>{p.y}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </figure>
    );
  } catch {
    return (
      <div className="inline-error">
        Invalid plot data. Switch to source to edit.
      </div>
    );
  }
}
export function Markdown({
  text,
  records = [],
  onAnnotation,
  imagePresentation = {},
}: {
  text: string;
  records?: Snapshot;
  onAnnotation?: (id: string) => void;
  imagePresentation?: Record<string, ImagePresentation>;
}) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeKatex,
          [
            rehypeHighlight,
            { ignoreMissing: true, plainText: ["mermaid", "plot"] },
          ],
        ]}
        skipHtml
        urlTransform={safeUrl}
        components={{
          a: ({ href, children }) =>
            href?.startsWith("annotation:") ? (
              <button
                className="source-link"
                onClick={() => onAnnotation?.(href.slice(11))}
              >
                {children} ↗
              </button>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
          img: ({ src, alt }) =>
            typeof src === "string" && src.startsWith("asset:") ? (
              <AssetImage
                id={src.slice(6)}
                alt={alt}
                records={records}
                presentation={imagePresentation[src.slice(6)]}
              />
            ) : (
              <span className="muted">
                Upload reference images to keep them private.
              </span>
            ),
          pre: ({ children, node }) => (
            <CodeBlock
              text={
                node?.children
                  .map((n) =>
                    "children" in n
                      ? n.children
                          .map((c) => ("value" in c ? c.value : ""))
                          .join("")
                      : "value" in n
                        ? n.value
                        : "",
                  )
                  .join("") || ""
              }
            >
              {children}
            </CodeBlock>
          ),
          code: ({ className, children }) => {
            const lang = className?.replace("language-", "");
            const source = String(children).trim();
            return lang === "mermaid" ? (
              <Diagram source={source} />
            ) : lang === "plot" ? (
              <Plot source={source} />
            ) : (
              <code className={className}>{children}</code>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
function CodeBlock({
  children,
  text,
}: {
  children: React.ReactNode;
  text: string;
}) {
  const [status, setStatus] = useState("Copy");
  return (
    <div className="code-block">
      <button
        className="copy-code"
        onClick={async (e) => {
          try {
            await navigator.clipboard.writeText(
              e.currentTarget.parentElement?.querySelector("code")
                ?.textContent || text,
            );
            setStatus("Copied");
          } catch {
            setStatus("Copy failed");
          }
        }}
      >
        {status}
      </button>
      <div className="code-content">{children}</div>
    </div>
  );
}
