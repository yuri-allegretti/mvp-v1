"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function tomorrowIsoDate(): string {
  const now = new Date();
  return isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)));
}

function normalizeNextDate(value: string | null): string {
  if (!value) return tomorrowIsoDate();
  return value >= isoDate(new Date()) ? value : tomorrowIsoDate();
}

function normalizeEndDate(nextDate: string, endDate: string | null): string {
  if (!endDate) return "";
  return endDate >= nextDate ? endDate : "";
}

interface RecurrenceSuggestionActionsProps {
  userId: string;
  companyId: string;
  suggestionId: string;
  defaultDescription: string;
  defaultEstimatedAmount: string;
  defaultFrequency: string;
  defaultNextDate: string | null;
  defaultEndDate: string | null;
  defaultInstallmentCount: number | null;
}

export function RecurrenceSuggestionActions({
  userId,
  companyId,
  suggestionId,
  defaultDescription,
  defaultEstimatedAmount,
  defaultFrequency,
  defaultNextDate,
  defaultEndDate,
  defaultInstallmentCount,
}: RecurrenceSuggestionActionsProps) {
  const router = useRouter();
  const normalizedNextDate = normalizeNextDate(defaultNextDate);
  const [description, setDescription] = useState(defaultDescription);
  const [estimatedAmount, setEstimatedAmount] = useState(defaultEstimatedAmount);
  const [frequency, setFrequency] = useState(defaultFrequency);
  const [nextDate, setNextDate] = useState(normalizedNextDate);
  const [endDate, setEndDate] = useState(normalizeEndDate(normalizedNextDate, defaultEndDate));
  const [installmentCount, setInstallmentCount] = useState(
    defaultEndDate && defaultEndDate >= normalizedNextDate && defaultInstallmentCount
      ? String(defaultInstallmentCount)
      : "",
  );
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(endpoint: string, body: Record<string, unknown>) {
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
        setError(payload.message ?? payload.error ?? "Ação de recorrência falhou.");
        return;
      }

      setMessage("Recorrência atualizada.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  function approvalPayload() {
    return {
      description,
      estimatedAmount,
      frequency,
      nextDate,
      endDate: endDate || null,
      installmentCount: installmentCount ? Number(installmentCount) : null,
      reason: reason.trim() || "Aprovação manual via demo UI",
    };
  }

  return (
    <div className="stack compact">
      <div className="inline-form">
        <input
          className="field"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={loading}
          placeholder="Descrição"
        />
        <input
          className="field"
          value={estimatedAmount}
          onChange={(event) => setEstimatedAmount(event.target.value)}
          disabled={loading}
          placeholder="Valor estimado"
        />
        <select
          className="field"
          value={frequency}
          onChange={(event) => setFrequency(event.target.value)}
          disabled={loading}
        >
          <option value="monthly">monthly</option>
          <option value="weekly">weekly</option>
          <option value="biweekly">biweekly</option>
          <option value="yearly">yearly</option>
          <option value="unknown">unknown</option>
        </select>
        <input
          className="field"
          type="date"
          value={nextDate}
          onChange={(event) => setNextDate(event.target.value)}
          disabled={loading}
        />
        <input
          className="field"
          type="date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          disabled={loading}
        />
        <input
          className="field"
          type="number"
          min="1"
          value={installmentCount}
          onChange={(event) => setInstallmentCount(event.target.value)}
          disabled={loading}
          placeholder="Parcelas"
        />
      </div>
      <input
        className="field"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        disabled={loading}
        placeholder="Motivo da decisão"
      />
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={loading}
          onClick={() =>
            submit(
              `/api/companies/${companyId}/recurrences/${suggestionId}/approve`,
              approvalPayload(),
            )
          }
        >
          {loading ? "Processando..." : "Aprovar"}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={loading}
          onClick={() =>
            submit(
              `/api/companies/${companyId}/recurrences/${suggestionId}/reject`,
              { reason: reason.trim() || "Rejeição manual via demo UI" },
            )
          }
        >
          Rejeitar
        </button>
      </div>
      {message ? <div className="success-text">{message}</div> : null}
      {error ? <div className="error-text">{error}</div> : null}
    </div>
  );
}
