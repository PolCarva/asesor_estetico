"use client";

import { type ReactNode, useRef, useState } from "react";

/**
 * Escenario de los looks. Desktop: tres tarjetas con profundidad, la primera al centro y
 * las otras inclinadas hacia ella (diseño 2e). Mobile: baraja que se desliza con
 * snap y puntos de posición (diseño 2g). Recibe las tarjetas en orden (01, 02, 03).
 */
export function LookStage({ items, label }: { items: ReactNode[]; label: string }) {
  const listRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);

  const onScroll = () => {
    const list = listRef.current;
    const first = list?.firstElementChild;
    if (!list || !(first instanceof HTMLElement)) return;
    const step = first.offsetWidth + 16;
    setActive(Math.min(items.length - 1, Math.max(0, Math.round(list.scrollLeft / step))));
  };

  // Posición en desktop: 0 al centro, 1 a la izquierda, 2 a la derecha.
  const DESKTOP = [
    "md:order-2 md:w-[34%] md:max-w-[23.75rem]",
    "md:order-1 md:w-[29%] md:max-w-[20.625rem] md:origin-right md:[transform:rotateY(10deg)_translateZ(-40px)]",
    "md:order-3 md:w-[29%] md:max-w-[20.625rem] md:origin-left md:[transform:rotateY(-10deg)_translateZ(-40px)]",
  ];

  return (
    <div>
      <ul
        ref={listRef}
        onScroll={onScroll}
        aria-label={label}
        className="-mx-5 flex snap-x snap-mandatory [scrollbar-width:none] gap-4 overflow-x-auto px-[11vw] pt-2 pb-8 sm:-mx-8 md:mx-0 md:items-end md:justify-center md:gap-7 md:overflow-visible md:px-0 md:[perspective:1600px] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <li
            key={i}
            className={`w-[78vw] max-w-[22rem] shrink-0 snap-center ${DESKTOP[i] ?? "md:order-4 md:w-[29%]"}`}
          >
            {item}
          </li>
        ))}
      </ul>
      {items.length > 1 ? (
        <div aria-hidden="true" className="flex justify-center gap-1.5 md:hidden">
          {items.map((_, i) => (
            <span
              key={i}
              className={`h-[5px] rounded-full transition-all ${i === active ? "w-[22px] bg-ink" : "w-1.5 bg-ink/20"}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
