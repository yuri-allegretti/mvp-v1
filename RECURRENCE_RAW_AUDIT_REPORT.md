# Auditoria raw de recorrencias vs ground truth

Gerado em: 2026-07-15T22:49:10.219Z

## Metodo

Cada transacao persistida e reconciliada com o ID sintetico por empresa, data, valor, descricao, documento e contraparte. A classificacao usa pertencimento transacional: `exact_match` exige precisao >= 90%, cobertura >= 80% e frequencia compativel; `partial_match` tem um grupo dominante com ao menos duas transacoes; `merge_error` mistura dois grupos com intersecoes relevantes; `duplicate_variant` sobrepoe mais de 70% de um candidato melhor; sem grupo, transferencias e padroes sem identidade estavel sao `false_positive`, enquanto repeticoes de contraparte em quatro ou mais meses sao `ambiguous`.

## Resumo

| Metrica | Resultado |
| --- | --- |
| Transactions reconciliadas | 1511/1511 |
| IDs sinteticos duplicados no ground truth | 2 |
| Transactions com identidade ground truth ambigua | 40 |
| Sugestoes raw | 389 |
| Grupos esperados | 46 |
| Grupos detectados | 46 |
| Grupos exatos | 45 |
| Grupos apenas parciais | 1 |
| Grupos fragmentados | 10 |
| Grupos ausentes | 0 |

### Classificacao dos 390 raw

| Classificacao | Quantidade | % |
| --- | --- | --- |
| duplicate_variant | 233 | 59.9% |
| ambiguous | 65 | 16.7% |
| exact_match | 45 | 11.6% |
| merge_error | 20 | 5.1% |
| partial_match | 17 | 4.4% |
| false_positive | 9 | 2.3% |

### Dimensoes

Por empresa:

| Empresa | Raw |
| --- | --- |
| published-company-002 | 94 |
| published-company-003 | 83 |
| published-company-005 | 74 |
| published-company-004 | 72 |
| published-company-001 | 66 |

Por `patternKind`:

| patternKind | Raw |
| --- | --- |
| monthly_variable | 101 |
| recurring_income | 93 |
| monthly_fixed | 54 |
| frequent_supplier | 53 |
| installment | 50 |
| null | 22 |
| irregular_business_recurring | 16 |

Por `recurrenceType`:

| recurrenceType | Raw |
| --- | --- |
| variable | 264 |
| fixed | 125 |

## Cobertura dos 46 grupos

Detectados: 46. Exatos: 45. Apenas parciais: 1. Fragmentados: 10. Ausentes: 0.

Grupos ausentes:

Nenhum.

IDs sinteticos duplicados no arquivo canonico:

- `tx-company-002-2025-07-0110`: 2 linhas
- `tx-company-002-2025-08-0111`: 2 linhas

### Top fragmentacoes

| Empresa | Grupo | Descricao | Candidatos | Melhor cobertura |
| --- | --- | --- | --- | --- |
| company-005 | rec-company-005-racking-12x-001 | ESTRUTURA ESTOQUE PARC | 5 | 100.0% |
| company-001 | rec-company-001-notebooks-10x-001 | COMPRA NOTEBOOK DEV | 4 | 100.0% |
| company-002 | rec-company-002-food-supplier-001 | FORNECIMENTO BASE COZINHA | 4 | 63.0% |
| company-003 | rec-company-003-ad-tools-001 | PLATAFORMA MIDIA PERFORMANCE | 4 | 100.0% |
| company-003 | rec-company-003-video-rig-9x-001 | KIT VIDEO PRODUTORA | 4 | 100.0% |
| company-003 | rec-company-003-loan-6x-001 | ANTECIPACAO FLUXO MIDIA | 3 | 100.0% |
| company-003 | rec-company-003-accounting-001 | BPO FINANCEIRO AGENCIA | 2 | 100.0% |
| company-003 | rec-company-003-retainer-client-001 | RETAINER GROWTH MENSAL | 2 | 100.0% |
| company-005 | rec-company-005-holiday-campaign-3x-001 | CAMPANHA SAZONAL FIM ANO | 2 | 100.0% |
| company-005 | rec-company-005-logistics-001 | REPASSE OPERADOR LOGISTICO | 2 | 100.0% |

### Top falsos positivos por empresa

| Empresa | Descricao | Padrao | Transacoes | Score | Motivo |
| --- | --- | --- | --- | --- | --- |
| published-company-001 | TRANSFERENCIA INTERNA ENTRE CONTAS LUNAR CIFRA | null | 24 | 89 | Padrao formado majoritariamente por transferencias, explicitamente nao recorrentes no ground truth. |
| published-company-001 | PIX MANUTENCAO EQUIPAMENTO ORBITA EQUIPAMENTO NF SYN 025-05 | irregular_business_recurring | 14 | 85 | Sem grupo esperado dominante e sem identidade economica repetida suficiente. |
| published-company-001 | PIX MANUTENCAO EQUIPAMENTO ORBITA EQUIPAMENTO NF SYN 025-05 | irregular_business_recurring | 13 | 84 | Sem grupo esperado dominante e sem identidade economica repetida suficiente. |
| published-company-002 | TRANSFERENCIA INTERNA ENTRE CONTAS PANELA DE NO | null | 24 | 89 | Padrao formado majoritariamente por transferencias, explicitamente nao recorrentes no ground truth. |
| published-company-002 | DEB AUTO PIX DIVERSOS COZINHA FORNECEDOR SEM HIS REF A 025-01 | monthly_variable | 4 | 79 | Sem grupo esperado dominante e sem identidade economica repetida suficiente. |
| published-company-003 | PAGTO PIX CRIACAO FREELA COLETIVO QUADRO LI DOC SYN 025-02 | frequent_supplier | 28 | 79 | Sem grupo esperado dominante e sem identidade economica repetida suficiente. |
| published-company-003 | TRANSFERENCIA INTERNA ENTRE CONTAS NEBLINA DE T | null | 24 | 89 | Padrao formado majoritariamente por transferencias, explicitamente nao recorrentes no ground truth. |
| published-company-004 | TRANSFERENCIA INTERNA ENTRE CONTAS VIVANEXO CLI | null | 24 | 89 | Padrao formado majoritariamente por transferencias, explicitamente nao recorrentes no ground truth. |
| published-company-005 | TRANSFERENCIA INTERNA ENTRE CONTAS ORBITA DE ES | null | 24 | 89 | Padrao formado majoritariamente por transferencias, explicitamente nao recorrentes no ground truth. |

### Padroes ambiguos plausiveis

| Empresa | Descricao | Padrao | Transacoes | Score |
| --- | --- | --- | --- | --- |
| published-company-001 | PAGTO TREINAMENTO EQUIPE PRODUTO CAMPO ABERTO FORMA AJUSTE 025-03 | frequent_supplier | 15 | 84 |
| published-company-001 | PIX MANUTENCAO EQUIPAMENTO ORBITA EQUIPAMENTO NF SYN 025-05 | frequent_supplier | 14 | 82 |
| published-company-001 | PAGTO TREINAMENTO EQUIPE PRODUTO CAMPO ABERTO FORMA AJUSTE 025-03 | frequent_supplier | 14 | 82 |
| published-company-001 | PAGTO TREINAMENTO EQUIPE PRODUTO CAMPO ABERTO FORMA AJUSTE 025-03 | irregular_business_recurring | 13 | 83 |
| published-company-001 | PAGTO TREINAMENTO EQUIPE PRODUTO CAMPO ABERTO FORMA AJUSTE 025-03 | irregular_business_recurring | 13 | 83 |
| published-company-001 | RECEBIMENTO REEMBOLSO CLIENTE AJUSTE SLA ATLAS VAREJO SINTE COMP SYN 025-03 | recurring_income | 12 | 83 |
| published-company-001 | RECEBIMENTO REEMBOLSO CLIENTE AJUSTE SLA ATLAS VAREJO SINTE COMP SYN 025-03 | recurring_income | 11 | 83 |
| published-company-001 | PIX MANUTENCAO EQUIPAMENTO ORBITA EQUIPAMENTO NF SYN 025-05 | frequent_supplier | 11 | 82 |
| published-company-001 | PAGTO TREINAMENTO EQUIPE PRODUTO CAMPO ABERTO FORMA AJUSTE 025-03 | irregular_business_recurring | 11 | 82 |
| published-company-001 | PIX IMPOSTO EXTRA CAIXA TESOURO LOCAL SINT REF A 025-05 | frequent_supplier | 9 | 85 |
| published-company-002 | DEBITO PIX DIVERSOS COZINHA FORNECEDOR SEM HIS AJUSTE 025-07 | frequent_supplier | 15 | 84 |
| published-company-002 | PAGTO TREINAMENTO BRIGADA MESA ABERTA EVENTO AJUSTE 025-04 | frequent_supplier | 15 | 84 |
| published-company-002 | PAGTO TARIFA BANCARIA OPERACAO ITAU SINTETICO COMP SYN 025-01 | frequent_supplier | 14 | 86 |
| published-company-002 | CRED REEMBOLSO DELIVERY AJUSTE PRISMA ENTREGAS SI REF A 025-04 | recurring_income | 14 | 84 |
| published-company-002 | TED MANUTENCAO EXAUSTAO METAL BRASA EQUIPA REF A 025-06 | frequent_supplier | 14 | 82 |
| published-company-002 | TED MANUTENCAO EXAUSTAO METAL BRASA EQUIPA REF A 025-06 | frequent_supplier | 12 | 83 |
| published-company-002 | PAGTO TREINAMENTO BRIGADA MESA ABERTA EVENTO AJUSTE 025-04 | frequent_supplier | 12 | 83 |
| published-company-002 | PAGTO TREINAMENTO BRIGADA MESA ABERTA EVENTO AJUSTE 025-04 | frequent_supplier | 12 | 83 |
| published-company-002 | PAGTO TREINAMENTO BRIGADA MESA ABERTA EVENTO AJUSTE 025-04 | frequent_supplier | 11 | 83 |
| published-company-002 | PAGTO TREINAMENTO BRIGADA MESA ABERTA EVENTO NF SYN 025-02 | frequent_supplier | 11 | 82 |
| published-company-003 | TED GUIA EXTRA MIDIA TESOURO LOCAL SINT COMP SYN 025-03 | frequent_supplier | 15 | 86 |
| published-company-003 | TED RECEB REEMBOLSO MIDIA CAMPANHA VENTO SOLAR INDUST AJUSTE 025-01 | recurring_income | 14 | 83 |
| published-company-003 | PAGTO PIX CRIACAO FREELA COLETIVO QUADRO LI DOC SYN 025-02 | frequent_supplier | 14 | 83 |
| published-company-003 | PAGTO SUPORTE PLATAFORMA CRIACAO NEBULA GRID SISTEM NF SYN 025-04 | frequent_supplier | 14 | 83 |
| published-company-003 | DEBITO GUIA EXTRA MIDIA TESOURO LOCAL SINT COMP SYN 025-08 | frequent_supplier | 12 | 85 |
| published-company-003 | TED GUIA EXTRA MIDIA TESOURO LOCAL SINT COMP SYN 025-03 | frequent_supplier | 12 | 85 |
| published-company-003 | TED GUIA EXTRA MIDIA TESOURO LOCAL SINT COMP SYN 025-03 | frequent_supplier | 11 | 86 |
| published-company-003 | DEBITO GUIA EXTRA MIDIA TESOURO LOCAL SINT COMP SYN 025-08 | irregular_business_recurring | 11 | 85 |
| published-company-003 | PAGTO SUPORTE PLATAFORMA CRIACAO NEBULA GRID SISTEM NF SYN 025-04 | frequent_supplier | 11 | 82 |
| published-company-003 | PIX RECEB REEMBOLSO MIDIA CAMPANHA VENTO SOLAR INDUST NF SYN 026-07 | recurring_income | 10 | 84 |
| published-company-004 | PAGTO PIX SERVICOS CLINICA PRESTADOR SEM CADA DOC SYN 025-11 | frequent_supplier | 15 | 84 |
| published-company-004 | PIX CURSO PROCEDIMENTOS CAMPO ABERTO FORMA DOC SYN 025-09 | frequent_supplier | 15 | 84 |
| published-company-004 | CRED REEMBOLSO GLOSA REVERSA CASA PRISMA SAUDE AJUSTE 025-05 | recurring_income | 14 | 84 |
| published-company-004 | PAGTO MANUTENCAO AUTOCLAVE FOCO MED EQUIPAMEN REF A 025-01 | frequent_supplier | 14 | 83 |
| published-company-004 | DEBITO MATERIAL CLINICO EXTRA NUCLEO EXAME BASE DOC SYN 025-01 | frequent_supplier | 14 | 82 |
| published-company-004 | CRED REEMBOLSO GLOSA REVERSA CASA PRISMA SAUDE AJUSTE 025-05 | recurring_income | 13 | 84 |
| published-company-004 | CRED REEMBOLSO GLOSA REVERSA CASA PRISMA SAUDE AJUSTE 025-05 | recurring_income | 12 | 85 |
| published-company-004 | CRED REEMBOLSO GLOSA REVERSA CASA PRISMA SAUDE AJUSTE 025-05 | recurring_income | 11 | 84 |
| published-company-004 | TED PIX SERVICOS CLINICA PRESTADOR SEM CADA NF SYN 025-07 | irregular_business_recurring | 11 | 82 |
| published-company-004 | DEBITO CURSO PROCEDIMENTOS CAMPO ABERTO FORMA REF A 025-03 | frequent_supplier | 11 | 82 |
| published-company-005 | TED PAGTO PIX ESTOQUE FORNECEDOR SEM HIS NF SYN 025-03 | frequent_supplier | 15 | 84 |
| published-company-005 | DEB AUTO GUIA EXTRA SUBSTITUICAO TESOURO LOCAL SINT COMP SYN 026-01 | frequent_supplier | 14 | 86 |
| published-company-005 | PIX RECEB ESTORNO DEVOLUCAO FORNECEDOR CAMPO MODULAR FORN NF SYN 025-07 | recurring_income | 14 | 84 |
| published-company-005 | TED AJUSTE FRETE EXTRA PRISMA ENTREGAS SI COMP SYN 025-09 | frequent_supplier | 14 | 82 |
| published-company-005 | TED PAGTO PIX ESTOQUE FORNECEDOR SEM HIS NF SYN 025-03 | frequent_supplier | 12 | 83 |
| published-company-005 | PAGTO PAGTO PIX ESTOQUE FORNECEDOR SEM HIS AJUSTE 025-07 | frequent_supplier | 11 | 83 |
| published-company-005 | DEBITO AJUSTE FRETE EXTRA PRISMA ENTREGAS SI DOC SYN 025-06 | frequent_supplier | 11 | 82 |
| published-company-005 | PAGTO TREINAMENTO HUB OPERACAO CAMPO ABERTO FORMA COMP SYN 026-01 | frequent_supplier | 11 | 82 |

### Descricoes normalizadas com mais variacoes

| Empresa e descricao | Variacoes |
| --- | --- |
| published-company-002\|receb repasse canal pedidos prisma entregas si comp syn | 23 |
| published-company-005\|repasse operador logistico prisma entregas si nf syn | 11 |
| published-company-003\|plataforma midia performance nebula grid sistem ajuste | 10 |
| published-company-002\|receb repasse canal pedidos prisma entregas si nf syn | 8 |
| published-company-003\|guia extra midia tesouro local sint comp syn | 7 |
| published-company-003\|plataforma midia performance nebula grid sistem nf syn | 7 |
| published-company-002\|energia camara fria lumen sul distribu comp syn | 6 |
| published-company-004\|plano saude equipe clinica vida base benefici syn | 6 |
| published-company-004\|recebimento suporte laboratorial semanal nucleo exame base comp syn | 6 |
| published-company-005\|receb repasse marketplace mercado orbital si ajuste | 6 |
| published-company-001\|manutencao equipamento orbita nf syn | 5 |
| published-company-001\|treinamento equipe produto campo aberto forma ajuste | 5 |
| published-company-002\|cred repasse canal pedidos prisma entregas si ref | 5 |
| published-company-002\|treinamento brigada mesa aberta evento ajuste | 5 |
| published-company-004\|receb suporte laboratorial semanal nucleo exame base syn | 5 |
| published-company-005\|folha operacao fulfillment equipe interna comp syn | 5 |
| published-company-001\|folha equipe produto interna comp syn | 4 |
| published-company-002\|reforma area externa prumo obras sintet ref parc | 4 |
| published-company-003\|deb antecipacao fluxo midia caixa foment syn parc | 4 |
| published-company-003\|folha time conteudo equipe interna comp syn | 4 |
| published-company-003\|plataforma midia performance nebula grid sistem comp syn | 4 |
| published-company-004\|cred reembolso glosa reversa casa prisma saude ajuste | 4 |
| published-company-005\|aluguel hub logistico rota clara galpoes ref | 4 |
| published-company-005\|deb estrutura estoque parc rota clara galpoes nf syn | 4 |
| published-company-005\|estrutura estoque parc rota clara galpoes ajuste | 4 |
| published-company-001\|aluguel hub tecnico modulo patio locac ref | 3 |
| published-company-001\|cred mensalidade contrato plataforma atlas varejo sinte nf syn | 3 |
| published-company-001\|emprestimo capital giro caixa fluxo foment nf syn parc | 3 |
| published-company-001\|internet empresa fibra pulso link dados ajuste | 3 |
| published-company-001\|notebook dev orbita equipamento ref parc | 3 |
| published-company-001\|recebimento projeto temporario arquitetura trama diagnostico comp syn parc | 3 |
| published-company-001\|recebimento reembolso cliente ajuste sla atlas varejo sinte comp syn | 3 |
| published-company-002\|folha operacao salao equipe interna comp syn | 3 |
| published-company-002\|forno combinado parcela metal brasa equipa ajuste parc | 3 |
| published-company-002\|forno combinado parcela metal brasa equipa nf syn parc | 3 |
| published-company-002\|link caixa delivery pulso dados syn | 3 |
| published-company-003\|bpo financeiro ponte norte contab ajuste | 3 |
| published-company-003\|cred retainer growth mensal vento solar indust nf syn | 3 |
| published-company-003\|kit video produtora quadro vivo equipa nf syn parc | 3 |
| published-company-003\|receb retencao conteudo social casa prisma saude syn | 3 |
| published-company-003\|suporte plataforma criacao nebula grid sistem comp syn | 3 |
| published-company-004\|aluguel consultorios viga clara imoveis syn | 3 |
| published-company-004\|deb aluguel consultorios viga clara imoveis ajuste | 3 |
| published-company-004\|equipamento imagem parc foco med equipamen comp syn | 3 |
| published-company-004\|equipamento imagem parc foco med equipamen ref | 3 |
| published-company-004\|mensalidade sistema clinico nebula grid sistem nf syn | 3 |
| published-company-004\|receb projeto saude ocupacional cintila industria ref parc | 3 |
| published-company-004\|receb suporte laboratorial semanal nucleo exame base comp syn | 3 |
| published-company-004\|recebimento pacote mensal atendimentos casa prisma saude ajuste | 3 |
| published-company-005\|deb folha operacao fulfillment equipe interna syn | 3 |

## Respostas objetivas

1. Dos 46 grupos, 46 foram detectados por ao menos um candidato dominante.
2. 45 foram detectados exatamente.
3. 1 ficaram apenas parciais.
4. 10 foram fragmentados em mais de um candidato nao redundante.
5. 0 nao foram detectados.
6. Dos 389 raw, 9 sao falsos positivos claros.
7. 65 sao plausiveis ou ambiguos fora do ground truth.
8. O problema dominante e fragmentacao e variacoes redundantes.
9. A utilidade das sugestoes acionaveis e medida separadamente em `ACTIONABLE_RECURRENCE_AUDIT_REPORT.md`.
10. O alvo de 46 nao e realista sem alterar o core: a saida raw contem variacoes e padroes fora do ground truth que a persistencia so pode consolidar com risco de esconder candidatos plausiveis.

## Evidencia detalhada

O JSON completo, incluindo IDs sinteticos, intersecoes, precisao e cobertura por sugestao, esta em `tmp/recurrence-raw-audit.json`.
