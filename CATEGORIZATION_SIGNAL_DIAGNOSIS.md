# Diagnostico dos sinais de categorizacao

Data da analise: 2026-07-15

## Resultado

| Campo | Existe no XLSX? | Extraido pelo parser? | Persistido em ImportedTransactionRaw? | Persistido em Transaction? | Usado pelas regras? | Problema encontrado | Correcao recomendada |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `counterpartyName` | Nao como coluna. Alguns lancamentos reais codificam a contraparte na descricao; os 120 sinteticos usam texto compacto sem limites canonicos. | Sim quando a descricao segue um padrao Itau explicito (`PIX TRANSF`, `DA`, `DEB AUTOR`, `SISPAG`). | Sim quando extraido. | Sim quando extraido. | Sim por `counterparty_contains` e regras combinadas. | O dataset publicado nao transporta o campo canonico nem delimitadores suficientes para reconstruir com seguranca a contraparte declarada no JSON. | Manter o extrator Itau atual e nao inferir contraparte sintetica por dicionario/ground truth. |
| `documentNumber` | Nao como coluna. A descricao traz referencias como `NF SYN`/`COMP SYN`, diferentes do `documentNumber` canonico (`CP-SYN`, `ISO-SYN`) do JSON. | Sim para documentos explicitos de layouts Itau reconhecidos. | Sim quando extraido. | Sim quando extraido. | Sim por `document_equals`; tambem participa da identidade externa quando realmente extraido. | O identificador canonico do ground truth nao esta no workbook. Tratar a referencia textual como o mesmo documento seria incorreto e mudaria `externalId`. | Nao sintetizar documento ausente. Usar regras por descricao no harness publicado. |
| `description` | Sim, na coluna `lancamento`. | Sim. | Sim em `description` e em `rawData.cells`. | Sim. | Sim por `description_contains`/`description_equals`. | O seed publicado tinha apenas 14 tokens ativos por empresa para dezenas de familias economicas. | Adicionar familias semanticas generalizaveis ao seed do harness. |
| `type` | Derivavel do sinal de `valor`. | Sim. | Sim. | Sim. | Sim na validacao de compatibilidade da categoria. | Nenhum. | Preservar. |
| `amount` | Sim. | Sim. | Sim. | Sim. | Sim em regras por faixa. | Nenhum no fluxo validado. | Preservar. |
| `date` | Sim. | Sim. | Sim. | Sim. | Disponivel ao workflow. | Nenhum no fluxo validado. | Preservar. |
| `bankAccountId` | Fornecido pelo contexto da importacao, nao pela linha. | Nao aplicavel. | Sim. | Sim. | Garante escopo e isolamento. | Nenhum. | Preservar `companyId` + conta em toda avaliacao. |

## Evidencias

- O cabecalho dos XLSX publicados possui somente `data`, `lancamento`, `ag./origem`, `valor` e `saldo`.
- `rawData` persiste essas mesmas celulas e a origem sintetica, sem metadados adicionais de contraparte/documento.
- Antes da ampliacao do seed, as 1.511 `Transaction` e 1.531 evidencias raw publicadas tinham zero contraparte e zero documento extraidos.
- No fixture Itau real validado, o mesmo pipeline extrai e persiste sinais como `DA COPEL 0000001778170`, comprovando que parser e persistencia funcionam quando o arquivo fornece estrutura reconhecivel.

## Decisao

O problema do dataset amplo nao esta no adapter nem na persistencia. Ele combina ausencia dos campos no XLSX sintetico com seed insuficiente. O importador nao foi alterado: inferir os valores canonicos a partir do ground truth criaria acoplamento ao gerador, overfitting e mudanca indevida de `externalId`.
