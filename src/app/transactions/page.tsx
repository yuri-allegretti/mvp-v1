import { DemoShell } from "../_components/demoShell";
import { getDemoPageData } from "../_components/demoPageData";
import { listRecentTransactions } from "@/modules/demo/demoReadService";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { demoContext, currentUser, currentUserId, currentCompanyId, currentBankAccountId } =
    await getDemoPageData(searchParams);
  const companyId = demoContext.company?.id;
  const companyName = demoContext.company?.name ?? "Empresa demo indisponível";
  const transactions = companyId ? await listRecentTransactions(companyId, undefined, 80) : [];

  return (
    <DemoShell
      currentPath="/transactions"
      currentUserId={currentUserId}
      currentCompanyId={currentCompanyId ?? ""}
      currentBankAccountId={currentBankAccountId}
      companyName={companyName}
      userRoleLabel={currentUser?.role ?? "indefinido"}
      users={demoContext.users}
      companies={demoContext.companies}
      bankAccounts={demoContext.bankAccounts}
      title="Transações"
      description="Últimas transações canônicas estruturadas no MVP."
    >
      <section className="table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Tipo</th>
              <th>Categoria</th>
              <th>Contraparte</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{transaction.date.toISOString().slice(0, 10)}</td>
                <td>{transaction.description}</td>
                <td>{transaction.amount.toFixed(2)}</td>
                <td>{transaction.type}</td>
                <td>{transaction.category?.name ?? "-"}</td>
                <td>{transaction.counterpartyName ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </DemoShell>
  );
}
