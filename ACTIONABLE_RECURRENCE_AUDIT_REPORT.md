# Auditoria das recorrencias acionaveis

Gerado em: 2026-07-15T22:48:22.458Z

## Escopo

A populacao inclui sugestoes `pending`, `edited` e a sugestao `approved` pelo sumarizador. Isso preserva as 99 sugestoes originalmente acionaveis mesmo depois do teste de aprovacao.

| Metrica | Resultado |
| --- | --- |
| Sugestoes auditadas | 74 |
| Grupos esperados representados | 46 |
| Grupos esperados sem sugestao acionavel | 0 |
| Contador estrito recomendado | 46 |
| Contador aceitavel para revisao humana | 72 |
| Sugestoes redundantes para supersede | 1 |
| Falsos positivos claros para rejeicao | 1 |
| Padroes ambiguos plausiveis | 26 |

## Classificacao

| Classificacao | Quantidade | % |
| --- | --- | --- |
| true_positive | 42 | 56.8% |
| ambiguous | 26 | 35.1% |
| fragmented_true_positive | 5 | 6.8% |
| false_positive | 1 | 1.4% |

## Distribuicao por empresa

| Empresa | Sugestoes |
| --- | --- |
| published-company-001 | 17 |
| published-company-003 | 16 |
| published-company-004 | 15 |
| published-company-002 | 13 |
| published-company-005 | 13 |

## Candidatos que nao deveriam permanecer acionaveis

| Empresa | Descricao | Classificacao | Grupo | Transacoes | Score | Pendencia aberta | Disposicao |
| --- | --- | --- | --- | --- | --- | --- | --- |
| published-company-003 | PAGTO PIX CRIACAO FREELA COLETIVO QUADRO LI DOC SYN 025-02 | false_positive | - | 13 | 84 | sim | non_actionable/rejected |

Grupos esperados sem sugestao acionavel:

Nenhum.

## Respostas objetivas

1. Pelo ground truth, o contador deveria representar 46 grupos detectados; aceitando padroes plausiveis para revisao humana, pode mostrar 72.
2. 1 sugestoes sao redundantes ou fragmentos adicionais e deveriam ser superseded se a politica de produto exigir uma linha por grupo.
3. 1 sao falsos positivos claros e deveriam ser rejeitados, nao apenas superseded.
4. 73 sao uteis ou aceitaveis como sugestoes para revisao humana.
5. O numero 74 e aceitavel com revisao humana e limitacao documentada; 98.6% da fila e util ou plausivel segundo esta auditoria.

## Observacao de produto

`Ambiguous` nao significa erro comprovado: e uma recorrencia economicamente repetida que o dataset nao publicou como grupo esperado. Remover essas sugestoes automaticamente exigiria uma decisao de produto ou revisao do ground truth, nao apenas uma correcao tecnica.
