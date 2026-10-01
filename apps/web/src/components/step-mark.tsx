/** Marca de una etapa en las pantallas nocturnas: ✓ hecha, punto que titila, pendiente. */
export function StepMark({ state }: { state: "done" | "current" | "todo" }) {
  if (state === "done")
    return (
      <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-sage text-[11px] font-bold text-night">
        ✓
      </span>
    );
  if (state === "current")
    return (
      <span className="grid size-[22px] shrink-0 place-items-center rounded-full border-[1.5px] border-peach">
        <span className="size-2 animate-blink rounded-full bg-peach" />
      </span>
    );
  return <span className="size-[22px] shrink-0 rounded-full border border-stone" />;
}
