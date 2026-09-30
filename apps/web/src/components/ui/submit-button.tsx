"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { buttonClass } from "./button";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  pendingLabel: string;
  variant?: "primary" | "accent" | "secondary" | "danger" | "ghost";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={buttonClass(variant, "md", className)}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
