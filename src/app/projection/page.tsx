import { DemoShell } from "../_components/demoShell";
import { ActionButton } from "../_components/actionButton";
import { getDemoPageData } from "../_components/demoPageData";
import { getProjectionForDemo } from "@/modules/demo/demoReadService";

export default async function ProjectionPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { demoContext, currentUser, currentUserId, currentCompanyId, currentBankAccountId } =
    await getDemoPageData(searchParams);
  const companyId = demoContext.company?.id;
  const companyName = demoContext.company?.name ?? "Empresa demo indisponível";
  const projection = companyId ? await getProjectionForDemo(companyId) : null;

  const tables = projection
    ? ([[
        30,
        projection.horizons[30],
      ], [
        60,
        projection.horizons[60],
      ], [
        90,
        projection.horizons[90],
      ]] as const)
    : [];

  return (
    <DemoShell
      currentPath="/projection"
      currentUserId={currentUserId}
      currentCompanyId={currentCompanyId ?? ""}
      currentBankAccountId={currentBankAccountId}
      companyName={companyName}
      userRoleLabel={currentUser?.role ?? "indefinido"}
      users={demoContext.users}
      companies={demoContext.companies}
      bankAccounts={demoContext.bankAccounts}
      title="Projeção"
      description="Itens projetados a partir de ApprovedRecurrence ativa."
    >
      {!projection || !companyId ? (
        <section className="panel">Contexto de projeção indisponível.</section>
      ) : (
        <div className="stack">
          <section className="panel">
            <div className="actions">
              <ActionButton
                userId={currentUserId}
                endpoint={`/api/companies/${companyId}/projection/base/regenerate`}
                label="Regenerar projeção"
                variant="primary"
              />
            </div>
          </section>
          {tables.map(([horizon, items]) => (
            <section className="table-card" key={horizon}>
              <h3>{horizon} dias</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Valor</th>
                    <th>Tipo</th>
                    <th>Recorrência origem</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.date.toISOString().slice(0, 10)}</td>
                      <td>{item.description}</td>
                      <td>{item.amount.toFixed(2)}</td>
                      <td>{item.type}</td>
                      <td>{item.approvedRecurrence.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </DemoShell>
  );
}
