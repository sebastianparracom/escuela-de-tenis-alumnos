"use client";

import { useRouter } from "next/navigation";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, cx } from "./ui";

export type ActionState = { ok?: boolean; error?: string; message?: string } | null;
export type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const PendingContext = createContext<boolean | null>(null);

export function SubmitButton({
  children,
  variant = "primary",
  size = "lg",
  full = true,
  pendingText = "Guardando…",
  name,
  value,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "md" | "lg" | "sm";
  full?: boolean;
  pendingText?: string;
  name?: string;
  value?: string;
}) {
  const status = useFormStatus();
  const ctxPending = useContext(PendingContext);
  const pending = ctxPending ?? status.pending;
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={buttonClass(variant, size, full)}>
      {pending ? pendingText : children}
    </button>
  );
}

/**
 * Formulario conectado a una acción del servidor: muestra el error de negocio o el mensaje de éxito.
 * `onSuccess="reset"` limpia el formulario; `redirectTo` navega al terminar bien.
 */
export function ActionForm({
  action,
  children,
  className,
  onSuccess,
  redirectTo,
  confirm,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  onSuccess?: "reset" | "refresh";
  redirectTo?: string;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!state?.ok) return;
    if (onSuccess === "reset") ref.current?.reset();
    if (redirectTo) router.push(redirectTo);
    else router.refresh();
  }, [state, onSuccess, redirectTo, router]);
  return (
    <form
      ref={ref}
      className={cx("space-y-4", className)}
      onSubmit={(e) => {
        // Se envía a mano para que un error no borre lo que la persona escribió.
        e.preventDefault();
        if (pending) return;
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(fd));
      }}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      <FormMessage state={state} />
    </form>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error)
    return (
      <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-3 text-[13px] leading-snug text-danger">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="rounded-xl bg-brand-soft px-3.5 py-3 text-[13px] leading-snug text-brand-dark">
        {state.message}
      </p>
    );
  return null;
}
