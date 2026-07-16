# Validation gap analysis

Gerado em: 2026-07-15T21:49:03.660Z

## Quadro de divergencias

| Classificacao | Severidade | Modulo | Evidencia | Causa provavel | Correcao recomendada | Risco | Bloqueia V1 demo? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Limitacao de sinal/dataset | baixa | Categorizacao | 0 regras faltantes; 11 casos restantes sem pattern seguro e 74 desconhecidos/ambiguos | O XLSX sintetico nao transporta contraparte/documento canonicos; a cobertura semantica por descricao foi concluida | Manter os casos desconhecidos em revisao e validar sinais adicionais apenas com layouts que realmente os fornecam | baixo: inferir metadados ausentes criaria overfitting e alteraria identidade de importacao | Nao |
| Limitacao esperada do detector V1 | media | Recorrencias core | 389 raw para 46 grupos; {"duplicate_variant":233,"ambiguous":65,"exact_match":45,"merge_error":20,"partial_match":17,"false_positive":9} | Detector retorna hipoteses por padrao e inclui repeticoes economicamente plausiveis fora do ground truth | Revisar core somente com matriz de falsos positivos e fragmentacoes aprovada | alto: reduzir recall ou esconder recorrencias validas | Nao, se a fila acionavel for apresentada como sugestao para revisao |
| Decisao de produto ainda nao fechada | media | Recorrencias/UI | 60 candidatas aceitaveis para revisao; contador estrito 38 | Nao esta definido se o contador representa ground truth estrito ou hipoteses plausiveis | Definir contrato do contador e politica para ambiguous | baixo tecnicamente; alto para expectativa do usuario | Nao, mas deve ser documentado |
| Bug ou limitacao da consolidacao | alta | Recorrencias/integracao | Raw representa 46/46 grupos, mas a fila acionavel representa 38/46 e perde 8 grupos | A equivalencia por sobreposicao pode selecionar merges ou falsos positivos como canonicos e superseder grupos esperados | Auditar os oito grupos perdidos e o grafo de equivalencia antes de mudar a consolidacao | alto: separar demais volta a gerar duplicatas; consolidar demais reduz recall | Sim para afirmar cobertura de recorrencias do dataset; nao para o fluxo tecnico basico |
| Ground truth restritivo ou ambiguo | media | Dataset | 0 grupos ausentes e padroes ambiguous classificados separadamente | Transacoes rotuladas como isoladas podem formar repeticoes plausiveis para o detector | Revisar casos ambiguous com produto sem alterar automaticamente o ground truth | medio: ajustar o ground truth pode mascarar falso positivo | Nao |
| Bug de implementacao | baixa/resolvida | Integracao de recorrencias | Rerun final cria 0 sugestoes e 0 pendencias; uma pendencia aberta por sugestao acionavel | Sobregeracao incremental ja corrigida | Manter regressao e diagnostico | baixo | Nao |
| Semantica divergente | media | Pendencias/ground truth | Ground truth: 404; V1 auditada: 535 apenas em categorizacao | Ground truth contabiliza eventos por transacao, enquanto a V1 consolida algumas pendencias por entidade logica | Definir unidade contabil do KPI antes de exigir igualdade | medio | Nao para demo; sim para gate numerico de 404 |

## Plano recomendado, sem implementacao nesta etapa

1. Fechar o contrato do ground truth de pendencias: evento por transacao versus pendencia acionavel por entidade.
2. Manter as 56 regras amplas sob regressao; nao adicionar novas regras enquanto `possibleMissingRule` permanecer zero.
3. Recuperar na consolidacao os oito grupos de recorrencia que o raw detecta e a fila acionavel perde.
4. Revisar manualmente duplicatas acionaveis, falsos positivos e `ambiguous` antes de qualquer mudanca no core.
5. Manter ground truth imutavel; qualquer revisao futura deve ser uma decisao versionada e independente.

## Gate da V1 demo

A cobertura ampla de categorizacao nao bloqueia mais a demo: a meta de `uncategorized < 250` foi superada e nao restam regras categorizaveis faltantes. Ainda bloqueiam a afirmacao de aderencia integral ao dataset publicado a perda de oito grupos na consolidacao de recorrencias e a falta de contrato comum para o KPI de 404 pendencias. Importacao, deduplicacao, RBAC, isolamento, categorizacao ampla, aprovacao de recorrencia e projecao estao funcionais.
