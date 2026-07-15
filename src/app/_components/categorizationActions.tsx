"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface CategoryOption {
  id: string;
  name: string;
}

interface CategorizationActionsProps {
  userId: string;
  companyId: string;
  transactionId: string;
  suggestionId: string;
  suggestedCategoryId: string;
  categories: CategoryOption[];
  suggestionStatus: string;
}

function defaultCorrectionCategoryId(
  categories: CategoryOption[],
  suggestedCategoryId: string,
): string {
  if (categories.some((category) => category.id === suggestedCategoryId)) {
    return suggestedCategoryId;
  }
  return categories[0]?.id ?? "";
}

export function CategorizationActions({
  userId,
  companyId,
  transactionId,
  suggestionId,
  suggestedCategoryId,
  categories,
  suggestionStatus,
}: CategorizationActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [categoryId, setCategoryId] = useState(() =>
    defaultCorrectionCategoryId(categories, suggestedCategoryId),
  );

  const decisionAllowed = useMemo(
    () => suggestionStatus === "generated",
    [suggestionStatus],
  );

  async function post(endpoint: string, body: Record<string, unknown>) {
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
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(payload.message ?? payload.error ?? "Decisão de categorização falhou.");
        return;
      }

      setMessage("Decisão aplicada.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const sharedReason = reason.trim();

  return (
    <div className="stack compact">
      <div className="stack compact">
        <input
          className="field"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motivo da decisão (opcional para aceitar)"
          disabled={loading}
        />
        <div className="actions">
          <button
            type="button"
            className="button"
            disabled={loading || !decisionAllowed}
            onClick={() =>
              post(
                `/api/companies/${companyId}/categorization/suggestions/${suggestionId}/accept`,
                { reason: sharedReason || undefined },
              )
            }
          >
            {loading ? "Processando..." : "Aceitar"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={loading || !decisionAllowed}
            onClick={() =>
              post(
                `/api/companies/${companyId}/categorization/suggestions/${suggestionId}/reject`,
                { reason: sharedReason || "Rejeição manual via demo UI" },
              )
            }
          >
            Rejeitar
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={loading}
            onClick={() =>
              post(
                `/api/companies/${companyId}/transactions/${transactionId}/categorization/undefined`,
                {
                  suggestionId: decisionAllowed ? suggestionId : undefined,
                  reason: sharedReason || "Categoria deixada como indefinida via demo UI",
                },
              )
            }
          >
            Marcar indefinida
          </button>
        </div>
      </div>
      <div className="inline-form">
        <select
          className="field"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          disabled={loading || categories.length === 0}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="secondary-button"
          disabled={loading || !decisionAllowed || !categoryId}
          onClick={() =>
            post(
              `/api/companies/${companyId}/categorization/suggestions/${suggestionId}/correct`,
              {
                categoryId,
                reason: sharedReason || "Correção manual via demo UI",
              },
            )
          }
        >
          Corrigir
        </button>
      </div>
      {error ? <div className="error-text">{error}</div> : null}
      {!error && message ? <div className="success-text">{message}</div> : null}
    </div>
  );
}
