import type { Metadata } from "next";

import { TrackEvent } from "@/components/track-event";

import { SignUpForm } from "../auth-forms";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function SignUpPage() {
  return (
    <>
      <TrackEvent name="signup_started" />
      <p className="eyebrow">Empezá gratis</p>
      <h1 className="mt-3 mb-8 text-4xl">Creá tu cuenta</h1>
      <SignUpForm />
    </>
  );
}
