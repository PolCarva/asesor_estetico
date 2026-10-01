import type { ComponentProps } from "react";

/** Tarjeta de vidrio sobre papel. */
export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-[28px] glass p-6 ${className}`} {...props} />;
}
