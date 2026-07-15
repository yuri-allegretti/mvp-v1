import { DomainInvariantError } from "../domain/errors";
import type { AuditEventRecord } from "../domain/models";
import type { AuditEventDraft, CategorizationStore } from "../ports/categorization-store";

export class AuditService {
  constructor(private readonly store: CategorizationStore) {}

  prepare(input: AuditEventDraft): AuditEventDraft {
    if (!input.companyId.trim()) throw new DomainInvariantError("Audit companyId is required");
    if (!input.entityType.trim()) throw new DomainInvariantError("Audit entityType is required");
    if (!input.entityId.trim()) throw new DomainInvariantError("Audit entityId is required");
    if (!input.action.trim()) throw new DomainInvariantError("Audit action is required");
    if (input.actorUserId !== null && !input.actorUserId.trim()) {
      throw new DomainInvariantError("Audit actorUserId cannot be blank");
    }
    return input;
  }

  record(input: AuditEventDraft): Promise<AuditEventRecord> {
    return this.store.createAuditEvent(this.prepare(input));
  }
}
