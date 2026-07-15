import { DemoShell } from "../_components/demoShell";
import { ActionButton } from "../_components/actionButton";
import { RecurrenceSuggestionActions } from "../_components/recurrenceSuggestionActions";
import { getDemoPageData } from "../_components/demoPageData";
import {
  listApprovedRecurrencesForDemo,
  listRecurrenceSuggestionsForDemo,
} from "@/modules/demo/demoReadService";

export default async function RecurrencesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { demoContext, currentUser, currentUserId, currentCompanyId, currentBankAccountId } =
    await getDemoPageData(searchParams);
  const companyId = demoContext.company?.id;
  const companyName = demoContext.company?.name ?? "Empresa demo indisponível";
  const [suggestions, approvedRecurrences] = companyId
    ? await Promise.all([
        listRecurrenceSuggestionsForDemo({ companyId }, undefined),
        listApprovedRecurrencesForDemo(companyId),
      ])
    : [[], []];

  return (
    <DemoShell
      currentPath="/recurrences"
      currentUserId={currentUserId}
      currentCompanyId={currentCompanyId ?? ""}
      currentBankAccountId={currentBankAccountId}
      companyName={companyName}
      userRoleLabel={currentUser?.role ?? "indefinido"}
      users={demoContext.users}
      companies={demoContext.companies}
      bankAccounts={demoContext.bankAccounts}
      title="Recorrências"
      description="Sugestões detectadas, aprovações e gestão mínima de status."
    >
      <div className="stack">
        <section className="table-card">
          <h3>Sugestões</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Frequência</th>
                <th>Valor estimado</th>
                <th>Score</th>
                <th>Status</th>
                <th>Próxima data</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((suggestion) => (
                <tr key={suggestion.id}>
                  <td>{suggestion.representativeDescription}</td>
                  <td>{suggestion.frequency}</td>
                  <td>{suggestion.estimatedNextAmount.toFixed(2)}</td>
                  <td>{suggestion.confidenceScore}</td>
                  <td>{suggestion.status}</td>
                  <td>{suggestion.expectedNextDate?.toISOString().slice(0, 10) ?? "-"}</td>
                  <td>
                    <RecurrenceSuggestionActions
                      userId={currentUserId}
                      companyId={companyId ?? ""}
                      suggestionId={suggestion.id}
                      defaultDescription={suggestion.representativeDescription}
                      defaultEstimatedAmount={suggestion.estimatedNextAmount.toFixed(2)}
                      defaultFrequency={suggestion.frequency}
                      defaultNextDate={suggestion.expectedNextDate?.toISOString().slice(0, 10) ?? null}
                      defaultEndDate={suggestion.endDate?.toISOString().slice(0, 10) ?? null}
                      defaultInstallmentCount={suggestion.installmentCount}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="table-card">
          <h3>Recorrências aprovadas</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Valor</th>
                <th>Frequência</th>
                <th>Status</th>
                <th>Próxima data</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {approvedRecurrences.map((recurrence) => (
                <tr key={recurrence.id}>
                  <td>{recurrence.description}</td>
                  <td>{recurrence.estimatedAmount.toFixed(2)}</td>
                  <td>{recurrence.frequency}</td>
                  <td>{recurrence.status}</td>
                  <td>{recurrence.nextDate?.toISOString().slice(0, 10) ?? "-"}</td>
                  <td>
                    <div className="actions">
                      <ActionButton
                        userId={currentUserId}
                        endpoint={`/api/companies/${companyId}/approved-recurrences/${recurrence.id}/status`}
                        label="Ativar"
                        body={{ status: "active" }}
                      />
                      <ActionButton
                        userId={currentUserId}
                        endpoint={`/api/companies/${companyId}/approved-recurrences/${recurrence.id}/status`}
                        label="Pausar"
                        body={{ status: "paused" }}
                      />
                      <ActionButton
                        userId={currentUserId}
                        endpoint={`/api/companies/${companyId}/approved-recurrences/${recurrence.id}/status`}
                        label="Encerrar"
                        body={{ status: "ended" }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </DemoShell>
  );
}
