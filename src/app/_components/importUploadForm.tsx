"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ImportUploadFormProps {
  companyId: string;
  bankAccountId: string;
  userId: string;
}

export function ImportUploadForm({
  companyId,
  bankAccountId,
  userId,
}: ImportUploadFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const form = new FormData(event.currentTarget);
    if (!form.get("file")) {
      setError("Selecione um arquivo XLS, XLSX ou PDF.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/companies/${companyId}/bank-accounts/${bankAccountId}/imports`,
        {
          method: "POST",
          headers: {
            "x-user-id": userId,
          },
          body: form,
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        transactionsCreated?: number;
        duplicatesSkipped?: number;
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(payload.message ?? payload.error ?? "Falha ao importar.");
        return;
      }
      setMessage(
        `Importação concluída: ${payload.transactionsCreated ?? 0} novas transações, ${payload.duplicatesSkipped ?? 0} duplicatas.`,
      );
      event.currentTarget.reset();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <input name="file" type="file" accept=".xls,.xlsx,.pdf" />
      <div className="actions">
        <button type="submit" className="button" disabled={loading}>
          {loading ? "Importando..." : "Importar extrato"}
        </button>
      </div>
      <div className="hint">
        Para a demo, use o fixture em <code>tests/fixtures/import/Extrato Conta Corrente-200620262150.xls</code>.
      </div>
      {error ? <div className="error-text">{error}</div> : null}
      {message ? <div className="success-text">{message}</div> : null}
    </form>
  );
}
