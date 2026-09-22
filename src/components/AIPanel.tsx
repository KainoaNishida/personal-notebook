import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, X, ArrowDownToLine, Send } from "lucide-react";
import * as api from "../service";
import { aiMarkdown, ofKind, uid, visualMarkdown } from "../domain";
import type { AIResponse, RecordItem, Snapshot } from "../domain";
import { useSave } from "../hooks";
import { Markdown, AssetImage } from "./Markdown";
import { ErrorNotice } from "./UI";
export function AIPanel({
  annotation,
  context,
  records,
  onClose,
  onInsert,
}: {
  annotation: RecordItem<"annotation">;
  context: string;
  records: Snapshot;
  onClose: () => void;
  onInsert: (text: string) => void;
}) {
  const existing = ofKind(records, "conversation").find(
    (c) => c.data.annotationId === annotation.id,
  );
  const [turns, setTurns] = useState(existing?.data.turns || []),
    [conversation, setConversation] = useState(existing),
    [question, setQuestion] = useState(
      "Explain this step by step, with intuition.",
    ),
    [nearby, setNearby] = useState(false),
    [visuals, setVisuals] = useState(true),
    [image, setImage] = useState(!!annotation.data.imageAssetId),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null),
    request = useRef<string | null>(null),
    save = useSave(),
    query = useQueryClient();
  const history = useQuery({
    queryKey: ["generations", annotation.id],
    queryFn: () => api.generationHistory(annotation.id),
    refetchInterval: busy ? 5000 : 20000,
  });
  const usage = useQuery({ queryKey: ["usage"], queryFn: api.usage });
  async function submit() {
    if (!question.trim() || busy) return;
    setBusy(true);
    setError("");
    controller.current = new AbortController();
    request.current = uid();
    try {
      const response = await api.explain(
        {
          requestId: request.current,
          annotationId: annotation.id,
          question,
          context: nearby ? context : "",
          imageAssetId: image ? annotation.data.imageAssetId : undefined,
          turns: turns.slice(-4),
          visuals,
        },
        controller.current.signal,
      );
      const next = [...turns, { question, response }];
      setTurns(next);
      setQuestion("");
      const c = await save(
        "conversation",
        conversation?.id || uid(),
        { annotationId: annotation.id, turns: next },
        conversation?.revision || 0,
      );
      setConversation(c);
      for (const visual of response.visuals)
        await save("artifact", uid(), { annotationId: annotation.id, visual });
    } catch (e) {
      setError(
        (e as Error).name === "AbortError"
          ? "Stopped waiting. The provider may still finish and bill this request; its reservation remains visible."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
      void query.invalidateQueries({ queryKey: ["usage"] });
      void query.invalidateQueries({
        queryKey: ["generations", annotation.id],
      });
    }
  }
  function insert(response: AIResponse) {
    onInsert(aiMarkdown(response, annotation.id));
  }
  return (
    <aside className="ai-panel">
      <div className="row between">
        <div className="row">
          <Sparkles size={18} />
          <h3>A little clarity</h3>
        </div>
        <button
          className="icon-button"
          aria-label="Close explanation panel"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <p className="muted small">
        Your selection, explained. Nothing runs until you ask.
      </p>
      <div className="context-card">
        <span className="eyebrow">
          Source · page {annotation.data.page + 1}
        </span>
        <p>{annotation.data.text}</p>
        {annotation.data.imageAssetId && (
          <>
            <label className="check-label">
              <input
                type="checkbox"
                checked={image}
                onChange={(e) => setImage(e.target.checked)}
              />
              Include selected region image
            </label>
            {image && (
              <AssetImage id={annotation.data.imageAssetId} records={records} />
            )}
          </>
        )}
        <label className="check-label">
          <input
            type="checkbox"
            checked={nearby}
            onChange={(e) => setNearby(e.target.checked)}
          />
          Include nearby context
        </label>
        {nearby && (
          <blockquote className="context-preview">
            {context || "No nearby context was captured."}
          </blockquote>
        )}
      </div>
      <div className="ai-turns">
        {turns.map((t, i) => (
          <article key={i} className="ai-turn">
            <h4>{t.question}</h4>
            <Markdown
              text={aiMarkdown(t.response, annotation.id)}
              records={records}
            />
            <button onClick={() => insert(t.response)}>
              <ArrowDownToLine size={15} />
              Insert into note
            </button>
            {!!t.response.visuals.length && (
              <div className="row" style={{ flexWrap: "wrap", marginTop: 8 }}>
                <button onClick={() => insert({ ...t.response, visuals: [] })}>
                  Insert explanation only
                </button>
                {t.response.visuals.map((v, j) => (
                  <button
                    key={j}
                    onClick={() =>
                      onInsert(
                        `\n${visualMarkdown(v)}\n\n[Source passage](annotation:${annotation.id})\n`,
                      )
                    }
                  >
                    Insert {v.title || `visual ${j + 1}`}
                  </button>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
      <details className="request-history">
        <summary>Recent requests for this selection</summary>
        {history.data?.map((r) => (
          <div key={r.id}>
            <p className="small muted">
              {r.state} · ${((r.actual + r.reserved) / 1e6).toFixed(3)} ·{" "}
              {new Date(r.created_at).toLocaleTimeString()}
            </p>
            {r.error && <p className="small">{r.error}</p>}
            {r.result && (
              <button
                onClick={() => {
                  setTurns((t) => [
                    ...t,
                    { question: "Recovered explanation", response: r.result! },
                  ]);
                }}
              >
                Review saved result
              </button>
            )}
          </div>
        ))}
      </details>
      <ErrorNotice error={error} />
      <label className="field">
        <span>{turns.length ? "Ask a follow-up" : "What would help?"}</span>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="Which step or idea feels unclear?"
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={visuals}
          onChange={(e) => setVisuals(e.target.checked)}
        />
        Include a diagram or equation breakdown when useful
      </label>
      <div className="row between">
        {busy ? (
          <button onClick={() => controller.current?.abort()}>
            Stop waiting
          </button>
        ) : (
          <button
            className="primary"
            disabled={!question.trim()}
            onClick={() => void submit()}
          >
            <Send size={14} />{" "}
            {turns.length ? "Ask follow-up" : "Explain selection"}
          </button>
        )}
        <span className="small muted">
          {usage.data
            ? `$${((usage.data.spent + usage.data.reserved) / 1e6).toFixed(2)} / $20`
            : "$20 monthly limit"}
        </span>
      </div>
      {busy && <p className="muted small">Working through your selection…</p>}
    </aside>
  );
}
