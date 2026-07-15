import { DemoShell } from "../_components/demoShell";
import { CategorizationActions } from "../_components/categorizationActions";
import { getDemoPageData } from "../_components/demoPageData";
import {
  listActiveCategoriesForCompany,
  listCategorizationSuggestions,
} from "@/modules/categorization";

export default async function CategorizationPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { demoContext, currentUser, currentUserId, currentCompanyId, currentBankAccountId } =
    await getDemoPageData(searchParams);
  const companyId = demoContext.company?.id;
  const companyName = demoContext.company?.name ?? "Empresa demo indisponível";

  const [suggestions, categories] = companyId
    ? await Promise.all([
        listCategorizationSuggestions(
          {
            companyId,
            pendingOnly: false,
          },
          undefined,
        ),
        listActiveCategoriesForCompany(companyId),
      ])
    : [[], []];

  return (
    <DemoShell
      currentPath="/categorization"
      currentUserId={currentUserId}
      currentCompanyId={currentCompanyId ?? ""}
      currentBankAccountId={currentBankAccountId}
      companyName={companyName}
      userRoleLabel={currentUser?.role ?? "indefinido"}
      users={demoContext.users}
      companies={demoContext.companies}
      bankAccounts={demoContext.bankAccounts}
      title="Categorização"
      description="Revisão operacional de sugestões, correções e indefinições."
    >
      <section className="table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Transação</th>
              <th>Categoria sugerida</th>
              <th>Score</th>
              <th>Confiança</th>
              <th>Origem</th>
              <th>Status</th>
              <th>Pendência</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((suggestion) => (
              <tr key={suggestion.id}>
                <td>
                  <div className="stack compact">
                    <strong>{suggestion.transaction.description}</strong>
                    <span className="hint">
                      {suggestion.transaction.date.toISOString().slice(0, 10)} |{" "}
                      {suggestion.transaction.amount.toFixed(2)}
                    </span>
                    <span className="hint">
                      {suggestion.transaction.counterpartyName ?? "Sem contraparte"} |{" "}
                      {suggestion.explanation}
                    </span>
                  </div>
                </td>
                <td>{suggestion.suggestedCategory.name}</td>
                <td>{suggestion.score}</td>
                <td>{suggestion.confidenceBand}</td>
                <td>{suggestion.origin}</td>
                <td>{suggestion.status}</td>
                <td>
                  {suggestion.pendingItems.length > 0 ? (
                    <div className="stack compact">
                      {suggestion.pendingItems.map((pending) => (
                        <span className="badge warn" key={pending.id}>
                          {pending.type}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="hint">Sem pendência aberta</span>
                  )}
                </td>
                <td>
                  <CategorizationActions
                    userId={currentUserId}
                    companyId={companyId ?? ""}
                    transactionId={suggestion.transactionId}
                    suggestionId={suggestion.id}
                    suggestedCategoryId={suggestion.suggestedCategoryId}
                    categories={categories.map((category) => ({
                      id: category.id,
                      name: category.name,
                    }))}
                    suggestionStatus={suggestion.status}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </DemoShell>
  );
}
