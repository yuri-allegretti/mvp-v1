"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ActionButtonProps {
  userId: string;
  endpoint: string;
  label: string;
  body?: Record<string, unknown>;
  variant?: "primary" | "secondary";
}

export function ActionButton({
  userId,
  endpoint,
  label,
  body,
  variant = "secondary",
}: ActionButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify(body ?? {}),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!response.ok) {
        setError(payload.message ?? payload.error ?? "Ação falhou.");
        return;
      }
      setMessage("Ação concluída.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className={variant === "primary" ? "button" : "secondary-button"}
        onClick={onClick}
        disabled={loading}
      >
        {loading ? "Processando..." : label}
      </button>
      {error ? <div className="error-text">{error}</div> : null}
      {!error && message ? <div className="success-text">{message}</div> : null}
    </div>
  );
}
