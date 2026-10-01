import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost" | "accent" | "danger" | "light";
type Size = "sm" | "md" | "lg";

/** Variantes del sistema Espejo: oscuro en relieve, vidrio, arcilla y claro (sobre fondos oscuros). */
const VARIANTS: Record<Variant, string> = {
  primary: "raised-dark hover:brightness-125",
  accent: "bg-clay text-paper hover:bg-clay-dark",
  secondary: "glass text-ink hover:bg-paper",
  ghost: "text-ink hover:bg-sand",
  danger: "border border-danger/40 text-danger hover:bg-danger hover:text-paper",
  light: "bg-paper text-ink hover:bg-cream",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-4 text-[0.8125rem]",
  md: "h-12 px-6 text-sm",
  lg: "h-14 px-8 text-[0.9375rem]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return [
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-[filter,background-color,color]",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    extra,
  ].join(" ");
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };

export function Button({ variant, size, className = "", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function LinkButton({ variant, size, className = "", ...props }: LinkButtonProps) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
