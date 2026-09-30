import type { Metadata } from "next";

import { SignInForm } from "../auth-forms";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <>
      <p className="eyebrow">Bienvenida de vuelta</p>
      <h1 className="mt-3 mb-8 text-4xl">Ingresá a tu cuenta</h1>
      <SignInForm next={typeof next === "string" ? next : undefined} />
    </>
  );
}
