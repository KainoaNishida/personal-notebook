import { useState } from "react";
import type { AnyRecord } from "../domain";

export function DraftStatus({
  draft,
}: {
  draft: {
    status: string;
    error: string;
    recoveryNotice: string;
    conflict: AnyRecord | null;
    value: { markdown: string };
    change: (value: never) => void;
    acceptRemote: () => void;
    keepMine: () => Promise<void>;
    flush: () => Promise<void>;
    reviewRecovery: () => void;
  };
}) {
  const [open, setOpen] = useState(false);
  const [merged, setMerged] = useState<string | null>(null);
  const [failure, setFailure] = useState("");
  const remote = draft.conflict?.data as
    { markdown?: string; title?: string } | undefined;
  async function resolve(action: () => void | Promise<void>) {
    setFailure("");
    try {
      await action();
      setOpen(false);
      setMerged(null);
    } catch (e) {
      setFailure((e as Error).message);
    }
  }
  return (
    <div className="draft-status" role="status">
      <span className={draft.error ? "error-text" : "muted"}>
        {draft.conflict ? "Save needs review" : draft.status}
      </span>
      {draft.conflict ? (
        <>
          <button className="text-button" onClick={() => setOpen(!open)}>
            {open ? "Close review" : "Review versions"}
          </button>
          {open && (
            <section className="conflict-review">
              <p>
                {draft.error} Choose a version or edit the merged text below.
              </p>
              <div className="version-columns">
                <div>
                  <h3>This window</h3>
                  <pre>{draft.value.markdown}</pre>
                </div>
                <div>
                  <h3>Saved version</h3>
                  <p>{remote?.title}</p>
                  <pre>{remote?.markdown}</pre>
                </div>
              </div>
              <div className="row">
                <button onClick={() => void resolve(draft.acceptRemote)}>
                  Use saved version
                </button>
                <button onClick={() => void resolve(draft.keepMine)}>
                  Keep this window
                </button>
                <button
                  onClick={() =>
                    setMerged(
                      `${remote?.markdown || ""}\n\n${draft.value.markdown}`,
                    )
                  }
                >
                  Merge versions
                </button>
              </div>
              {merged !== null && (
                <>
                  <label className="field">
                    Merged note
                    <textarea
                      rows={10}
                      value={merged}
                      onChange={(e) => setMerged(e.target.value)}
                    />
                  </label>
                  <button
                    onClick={() =>
                      void resolve(async () => {
                        draft.change({
                          ...draft.value,
                          markdown: merged,
                        } as never);
                        await draft.keepMine();
                      })
                    }
                  >
                    Save merged note
                  </button>
                </>
              )}
            </section>
          )}
        </>
      ) : (
        draft.error && (
          <>
            <p>{draft.error}</p>
            <button onClick={() => void resolve(draft.flush)}>
              Retry save
            </button>
          </>
        )
      )}
      {draft.recoveryNotice && !draft.conflict && (
        <button
          className="text-button"
          onClick={() => {
            draft.reviewRecovery();
            setOpen(true);
          }}
        >
          Review other unsaved versions
        </button>
      )}
      {failure && <p className="error-text">{failure}</p>}
    </div>
  );
}
