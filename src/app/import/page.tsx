import { DemoShell } from "../_components/demoShell";
import { ImportUploadForm } from "../_components/importUploadForm";
import { getDemoPageData } from "../_components/demoPageData";
import { getLatestBankImport } from "@/modules/demo/demoReadService";

export default async function ImportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { demoContext, currentUser, currentUserId } = await getDemoPageData(searchParams);
  const companyId = demoContext.company?.id;
  const bankAccountId = demoContext.bankAccount?.id;
  const companyName = demoContext.company?.name ?? "Empresa demo indisponível";
  const latestImport = companyId ? await getLatestBankImport(companyId) : null;

  return (
    <DemoShell
      currentPath="/import"
      currentUserId={currentUserId}
      companyName={companyName}
      userRoleLabel={currentUser?.role ?? "indefinido"}
      users={demoContext.users}
      title="Importação"
      description="Upload manual de extrato ou visualização do último processamento."
    >
      <div className="stack">
        <section className="panel">
          {companyId && bankAccountId ? (
            <ImportUploadForm companyId={companyId} bankAccountId={bankAccountId} userId={currentUserId} />
          ) : (
            "Conta demo indisponível."
          )}
        </section>
        <section className="table-card">
          <h3>Última importação</h3>
          {!latestImport ? (
            <p className="hint">Nenhuma importação encontrada para a empresa demo.</p>
          ) : (
            <table className="table">
              <tbody>
                <tr>
                  <th>Arquivo</th>
                  <td>{latestImport.originalFileName}</td>
                </tr>
                <tr>
                  <th>Formato</th>
                  <td>{latestImport.detectedFormat}</td>
                </tr>
                <tr>
                  <th>Status</th>
                  <td>{latestImport.status}</td>
                </tr>
                <tr>
                  <th>Novas transações</th>
                  <td>{latestImport.importedTransactions}</td>
                </tr>
                <tr>
                  <th>Duplicatas</th>
                  <td>{latestImport.duplicateTransactions}</td>
                </tr>
                <tr>
                  <th>Linhas inválidas</th>
                  <td>{latestImport.invalidRows}</td>
                </tr>
              </tbody>
            </table>
          )}
        </section>
      </div>
    </DemoShell>
  );
}
