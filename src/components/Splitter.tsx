export function Splitter({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const update = (value: number) => onChange(Math.max(25, Math.min(75, value)));
  return (
    <div
      className="splitter"
      role="separator"
      tabIndex={0}
      aria-label="Resize PDF and notes"
      aria-orientation="vertical"
      aria-valuemin={25}
      aria-valuemax={75}
      aria-valuenow={value}
      onDoubleClick={() => update(50)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          update(value + (e.key === "ArrowLeft" ? -2 : 2));
        }
        if (e.key === "Home") {
          e.preventDefault();
          update(50);
        }
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const r = e.currentTarget.parentElement!.getBoundingClientRect();
        update(((e.clientX - r.left) / r.width) * 100);
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    />
  );
}
