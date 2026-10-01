"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { buttonClass } from "./button";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
  size = "md",
}: {
  children: ReactNode;
  pendingLabel: string;
  variant?: "primary" | "accent" | "secondary" | "danger" | "ghost" | "light";
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={buttonClass(variant, size, className)}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
