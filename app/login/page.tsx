"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction, type ActionState } from "@/app/actions";

function LoginForm() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState<ActionState, FormData>(
    loginAction,
    null,
  );

  return (
    <form action={action} className="panel mx-auto max-w-sm space-y-4 px-5 py-6">
      <h1 className="text-lg font-bold">House password</h1>
      <input type="hidden" name="next" value={params.get("next") ?? "/"} />
      <input
        name="password"
        type="password"
        required
        autoFocus
        className="field"
        placeholder="Password"
      />
      {state?.error && <p className="text-sm text-[var(--color-warn)]">{state.error}</p>}
      <button className="btn btn-primary w-full justify-center" disabled={pending}>
        {pending ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
