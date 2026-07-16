# Grupos perdidos pela consolidacao de recorrencias

Gerado em: 2026-07-15T22:50:03.821Z

## Causa raiz

A versao anterior usava `intersection / min(set sizes)` como equivalencia e ordenava primeiro por quantidade de transacoes. Assim, um superset contaminado contendo todo o grupo real era considerado equivalente e vencia mesmo com score e coerencia muito inferiores.

| groundTruthGroupId | companyId | expectedPattern | rawCandidates | chosenCanonical anterior | lostReason | estado atual | recommendedFix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rec-company-001-loan-12x-001 | company-001 | monthly; 12 transacoes | rec_published-company-001_xm4clo (exact_match, 12)<br>rec_published-company-001_m1tfvd (duplicate_variant, 9)<br>rec_published-company-001_5zb7qd (duplicate_variant, 3) | rec_published-company-001_y5txhi (23 transacoes, score 62) | superset contaminado venceu o grupo exato de 12 transacoes | recuperado: rec_published-company-001_xm4clo | identidade economica + ranking por coerencia + protecao contra bridge/merge |
| rec-company-002-reforma-8x-001 | company-002 | monthly; 8 transacoes | rec_published-company-002_bs0xk0 (exact_match, 8)<br>rec_published-company-002_tz161b (duplicate_variant, 4)<br>rec_published-company-002_tw5q8d (duplicate_variant, 4) | rec_published-company-002_66g6qt (18 transacoes, score 75) | merge de reforma e forno substituiu os dois parcelamentos | recuperado: rec_published-company-002_bs0xk0 | identidade economica + ranking por coerencia + protecao contra bridge/merge |
| rec-company-002-forno-10x-001 | company-002 | monthly; 10 transacoes | rec_published-company-002_c1gvlf (exact_match, 10)<br>rec_published-company-002_408rah (merge_error, 18)<br>rec_published-company-002_di9vfm (duplicate_variant, 5) | rec_published-company-002_66g6qt (18 transacoes, score 75) | merge de reforma e forno substituiu os dois parcelamentos | recuperado: rec_published-company-002_c1gvlf | identidade economica + ranking por coerencia + protecao contra bridge/merge |
| rec-company-003-campaign-burst-4x-001 | company-003 | monthly; 4 transacoes | rec_published-company-003_csygma (exact_match, 4)<br>rec_published-company-003_naj4f1 (duplicate_variant, 3)<br>rec_published-company-003_78ic8y (duplicate_variant, 3) | rec_published-company-003_9sf4yo (31 transacoes, score 83) | receita ampla com overlap conteve o burst temporario de 4 transacoes | recuperado: rec_published-company-003_csygma | identidade economica + ranking por coerencia + protecao contra bridge/merge |
| rec-company-004-ultrasound-12x-001 | company-004 | monthly; 12 transacoes | rec_published-company-004_durpcm (exact_match, 12)<br>rec_published-company-004_rgl26p (merge_error, 17)<br>rec_published-company-004_yi276m (duplicate_variant, 7) | rec_published-company-004_p21830 (17 transacoes, score 64) | merge de equipamentos e adequacao venceu o parcelamento exato | recuperado: rec_published-company-004_durpcm | identidade economica + ranking por coerencia + protecao contra bridge/merge |
| rec-company-004-specialty-project-6x-001 | company-004 | monthly; 6 transacoes | rec_published-company-004_2fvj8u (exact_match, 6)<br>rec_published-company-004_hasknz (duplicate_variant, 4)<br>rec_published-company-004_6gu3ee (duplicate_variant, 3) | rec_published-company-004_x88zco (28 transacoes, score 61) | receita mensal contaminada venceu o projeto temporario | recuperado: rec_published-company-004_2fvj8u | identidade economica + ranking por coerencia + protecao contra bridge/merge |
| rec-company-004-fitout-5x-001 | company-004 | monthly; 5 transacoes | rec_published-company-004_upj9b (exact_match, 5)<br>rec_published-company-004_dnnlgs (duplicate_variant, 3) | rec_published-company-004_p21830 (17 transacoes, score 64) | merge de equipamentos e adequacao venceu o parcelamento exato | recuperado: rec_published-company-004_upj9b | identidade economica + ranking por coerencia + protecao contra bridge/merge |
| rec-company-005-payroll-001 | company-005 | monthly; 24 transacoes | rec_published-company-005_sw7uq7 (exact_match, 24)<br>rec_published-company-005_z1vibn (duplicate_variant, 17)<br>rec_published-company-005_ejs2jt (duplicate_variant, 7) | rec_published-company-005_om71we (64 transacoes, score 69) | grupo amplo de despesas venceu a folha exata de 24 meses | recuperado: rec_published-company-005_sw7uq7 | identidade economica + ranking por coerencia + protecao contra bridge/merge |

## Medicao atual em memoria

| Metrica | Resultado |
| --- | --- |
| Raw | 389 |
| Consolidadas | 76 |
| Grupos representados | 46/46 |
| Grupos ausentes | 0 |
| Classificacoes | {"exact_match":44,"ambiguous":28,"partial_match":3,"false_positive":1} |

O ground truth e usado somente neste script de auditoria. A consolidacao de runtime nao recebe IDs ou classificacoes esperadas.
