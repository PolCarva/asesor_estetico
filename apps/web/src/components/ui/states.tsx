import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-[28px] glass px-6 py-14 text-center">
      <span aria-hidden="true" className="mb-5 size-12 animate-float orb" />
      <h2 className="text-2xl">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-bark">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-[28px] border border-danger/30 bg-paper px-6 py-10 text-center"
    >
      <h2 className="text-2xl text-danger">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-stone">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function FormMessage({
  tone = "error",
  children,
}: {
  tone?: "error" | "info";
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-2xl px-4 py-3 text-sm ${tone === "error" ? "bg-danger/10 text-danger" : "glass text-ink"}`}
    >
      {children}
    </p>
  );
}
