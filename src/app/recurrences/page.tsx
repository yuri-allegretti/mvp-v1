import { DemoShell } from "../_components/demoShell";
import { ActionButton } from "../_components/actionButton";
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
  const { demoContext, currentUser, currentUserId } = await getDemoPageData(searchParams);
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
      companyName={companyName}
      userRoleLabel={currentUser?.role ?? "indefinido"}
      users={demoContext.users}
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
                  <td>
                    <div className="actions">
                      <ActionButton
                        userId={currentUserId}
                        endpoint={`/api/companies/${companyId}/recurrences/${suggestion.id}/approve`}
                        label="Aprovar"
                        body={{ reason: "Aprovação manual via demo UI" }}
                        variant="primary"
                      />
                      <ActionButton
                        userId={currentUserId}
                        endpoint={`/api/companies/${companyId}/recurrences/${suggestion.id}/reject`}
                        label="Rejeitar"
                        body={{ reason: "Rejeição manual via demo UI" }}
                      />
                    </div>
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
