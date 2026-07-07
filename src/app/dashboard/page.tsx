import { DemoShell } from "../_components/demoShell";
import { ActionButton } from "../_components/actionButton";
import { getDemoPageData } from "../_components/demoPageData";
import { getDashboardSummary } from "@/modules/demo/demoReadService";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { demoContext, currentUser, currentUserId } = await getDemoPageData(searchParams);
  const companyId = demoContext.company?.id;
  const companyName = demoContext.company?.name ?? "Empresa demo indisponível";
  const summary = companyId ? await getDashboardSummary(companyId) : null;

  return (
    <DemoShell
      currentPath="/dashboard"
      currentUserId={currentUserId}
      companyName={companyName}
      userRoleLabel={currentUser?.role ?? "indefinido"}
      users={demoContext.users}
      title="Dashboard"
      description="Resumo operacional da empresa demo."
    >
      {!summary || !companyId ? (
        <section className="panel">Contexto demo indisponível.</section>
      ) : (
        <div className="stack">
          <section className="card-grid">
            <article className="card">
              <p className="card-label">Transações</p>
              <p className="card-value">{summary.totalTransactions}</p>
            </article>
            <article className="card">
              <p className="card-label">Pendências abertas</p>
              <p className="card-value">{summary.openPendingItems}</p>
            </article>
            <article className="card">
              <p className="card-label">Sugestões de recorrência</p>
              <p className="card-value">{summary.totalRecurrenceSuggestions}</p>
            </article>
            <article className="card">
              <p className="card-label">Recorrências aprovadas</p>
              <p className="card-value">{summary.totalApprovedRecurrences}</p>
            </article>
            <article className="card">
              <p className="card-label">Saldo atual simples</p>
              <p className="card-value">{summary.currentBalance.toFixed(2)}</p>
            </article>
          </section>
          <section className="panel stack">
            <div className="row">
              <span className="badge">30 dias: {summary.projectedItems30}</span>
              <span className="badge">60 dias: {summary.projectedItems60}</span>
              <span className="badge">90 dias: {summary.projectedItems90}</span>
            </div>
            <ActionButton
              userId={currentUserId}
              endpoint={`/api/companies/${companyId}/projection/base/regenerate`}
              label="Regenerar projeção 30/60/90"
              variant="primary"
            />
          </section>
        </div>
      )}
    </DemoShell>
  );
}
