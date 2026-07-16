# Auditoria de cobertura das pendencias de categorizacao

Gerado em: 2026-07-15T21:49:03.649Z

## Resumo

| Metrica | Resultado |
| --- | --- |
| Pendencias auditadas | 535 |
| Transactions reconciliadas | 1511/1511 |
| Deveriam ter categoria pelo ground truth | 461 |
| Possivel regra ausente | 0 |
| Realmente desconhecidas ou ambiguas | 74 |
| Ruido que virou Transaction | 0 |
| Sem correspondencia com os 69 patterns atuais | 11 |
| Sem contraparte persistida | 535 |
| Sem documento persistido | 535 |

## KPI paralelo de pendencias

| Metrica | Quantidade | Unidade |
| --- | --- | --- |
| pending_items_physical | 653 | linhas abertas de PendingItem |
| pending_items_by_business_event | 653 | company + tipo + entidade relacionada |
| pending_items_by_transaction | 535 | Transactions distintas com pendencia |
| pending_items_by_categorization_suggestion | 524 | sugestoes de categorizacao distintas |
| pending_items_by_recurrence_group | 98 | sugestoes acionaveis de recorrencia distintas |
| pending_items_by_duplicate | 20 | candidatos de duplicidade distintos |

O ground truth mistura eventos por transacao e por grupo logico. `pending_items_physical` e diretamente comparavel apenas quando a unidade esperada tambem e uma linha acionavel; recorrencias e conflitos exigem comparacao por entidade logica.

Pendencias atuais:

| Tipo | Quantidade |
| --- | --- |
| categorization_review | 447 |
| categorization_low_confidence | 63 |
| categorization_conflict | 14 |
| uncategorized_transaction | 11 |

Dimensoes principais:

| Dimensao | Valor | Quantidade |
| --- | --- | --- |
| empresa | published-company-004 | 119 |
| empresa | published-company-001 | 110 |
| empresa | published-company-002 | 103 |
| empresa | published-company-005 | 103 |
| empresa | published-company-003 | 100 |
| conta | published-account-company-004-001 | 119 |
| conta | published-account-company-001-001 | 110 |
| conta | published-account-company-002-001 | 103 |
| conta | published-account-company-005-001 | 103 |
| conta | published-account-company-003-001 | 100 |
| tipo | expense | 440 |
| tipo | income | 95 |
| faixa | 1000-4999.99 | 377 |
| faixa | 500-999.99 | 117 |
| faixa | 5000-19999.99 | 21 |
| faixa | 100-499.99 | 20 |

Ground truth publicado de pendencias:

| Tipo | Quantidade |
| --- | --- |
| categorization_conflict | 134 |
| recurrence_approval | 129 |
| missing_category | 60 |
| categorization_low_confidence | 44 |
| probable_duplicate_review | 20 |
| recurrence_ended_review | 17 |

Regras ativas por empresa:

| Empresa | Regras |
| --- | --- |
| published-company-004 | 70 |
| published-company-001 | 70 |
| published-company-003 | 70 |
| published-company-005 | 70 |
| published-company-002 | 70 |

## Top 50 descricoes sem cobertura

| Descricao economica | Pendencias |
| --- | --- |
| TRANSFERENCIA INTERNA ENTRE CONTAS LUNAR CIFRA | 24 |
| TRANSFERENCIA INTERNA ENTRE CONTAS NEBLINA DE T | 24 |
| TRANSFERENCIA INTERNA ENTRE CONTAS ORBITA DE ES | 24 |
| TRANSFERENCIA INTERNA ENTRE CONTAS PANELA DE NO | 24 |
| TRANSFERENCIA INTERNA ENTRE CONTAS VIVANEXO CLI | 24 |
| EMPRESTIMO CAPITAL GIRO | 12 |
| EQUIPAMENTO IMAGEM PARC | 12 |
| ESTRUTURA ESTOQUE PARC | 12 |
| COMPRA NOTEBOOK DEV | 10 |
| FORNO COMBINADO PARCELA | 10 |
| KIT VIDEO PRODUTORA | 9 |
| REFORMA AREA EXTERNA | 8 |
| ANTECIPACAO FLUXO MIDIA | 6 |
| CONTRATO ATACADO TEMPORARIO | 6 |
| PROJETO SAUDE OCUPACIONAL | 6 |
| PROJETO TEMPORARIO ARQUITETURA | 6 |
| ADEQUACAO SALA PROCEDIMENTO | 5 |
| PAGTO MANUTENCAO EQUIPAMENTO ORBITA EQUIPAMENTO | 5 |
| PIX CURSO PROCEDIMENTOS CAMPO ABERTO FORMA | 5 |
| BONUS CAMPANHA LANCTO | 4 |
| DEBITO MATERIAL CLINICO EXTRA NUCLEO EXAME BASE | 4 |
| DEBITO PAGTO PIX ESTOQUE FORNECEDOR SEM HIS | 4 |
| PAGTO PIX SERVICOS CLINICA PRESTADOR SEM CADA | 4 |
| TED MANUTENCAO EQUIPAMENTO ORBITA EQUIPAMENTO | 4 |
| CAMPANHA SAZONAL FIM ANO | 3 |
| CRED REEMBOLSO DELIVERY AJUSTE PRISMA ENTREGAS SI A | 3 |
| CRED REEMBOLSO GLOSA REVERSA CASA PRISMA SAUDE | 3 |
| CRED REEMBOLSO MIDIA CAMPANHA VENTO SOLAR INDUST | 3 |
| DEB AUTO MANUTENCAO AUTOCLAVE FOCO MED EQUIPAMEN | 3 |
| DEB AUTO PIX CRIACAO FREELA COLETIVO QUADRO LI AJUSTE | 3 |
| DEB AUTO SUPORTE PLATAFORMA CRIACAO NEBULA GRID SISTEM | 3 |
| FESTIVAL INVERNO COTAS | 3 |
| PAGTO EVENTO CLIENTE PROSPECCAO FIO DE CENA PRODUC A | 3 |
| PAGTO SUPORTE PLATAFORMA CRIACAO NEBULA GRID SISTEM | 3 |
| PAGTO TREINAMENTO BRIGADA MESA ABERTA EVENTO AJUSTE | 3 |
| PIX AJUSTE FRETE EXTRA PRISMA ENTREGAS SI | 3 |
| PIX RECEB ESTORNO DEVOLUCAO FORNECEDOR CAMPO MODULAR FORN | 3 |
| RECEBIMENTO REEMBOLSO CLIENTE AJUSTE SLA ATLAS VAREJO SINTE | 3 |
| RECEBIMENTO REEMBOLSO CLIENTE AJUSTE SLA ATLAS VAREJO SINTE COMP | 3 |
| TED RECEB REEMBOLSO DELIVERY AJUSTE PRISMA ENTREGAS SI | 3 |
| TED TREINAMENTO HUB OPERACAO CAMPO ABERTO FORMA | 3 |
| CRED ESTORNO DEVOLUCAO FORNECEDOR CAMPO MODULAR FORN | 2 |
| CRED REEMBOLSO CLIENTE AJUSTE SLA ATLAS VAREJO SINTE | 2 |
| CRED REEMBOLSO GLOSA REVERSA CASA PRISMA SAUDE AJUSTE | 2 |
| DEB AUTO CURSO PROCEDIMENTOS CAMPO ABERTO FORMA | 2 |
| DEB AUTO EVENTO CLIENTE PROSPECCAO FIO DE CENA PRODUC | 2 |
| DEB AUTO PAGTO PIX ESTOQUE FORNECEDOR SEM HIS | 2 |
| DEB AUTO PIX DIVERSOS COZINHA FORNECEDOR SEM HIS A | 2 |
| DEBITO AJUSTE FRETE EXTRA PRISMA ENTREGAS SI | 2 |
| DEBITO EVENTO CLIENTE PROSPECCAO FIO DE CENA PRODUC | 2 |

## Top 50 contrapartes

| Contraparte | Pendencias |
| --- | --- |
| CAMPO ABERTO FORMACAO | 45 |
| FORNECEDOR SEM HISTORICO | 30 |
| PRISMA ENTREGAS SINTETICO | 28 |
| FOCO MED EQUIPAMENTOS | 26 |
| LUNAR CIFRA LABS | 24 |
| METAL BRASA EQUIPAMENTOS | 24 |
| NEBLINA DE TRACAO STUDIO | 24 |
| ORBITA DE ESTOQUE SHOP | 24 |
| ORBITA EQUIPAMENTOS | 24 |
| PANELA DE NORTE BISTRO | 24 |
| VIVANEXO CLINICA | 24 |
| CAIXA FLUXO FOMENTO | 18 |
| FIO DE CENA PRODUCOES | 18 |
| MESA ABERTA EVENTOS | 18 |
| VENTO SOLAR INDUSTRIA SINTETICA | 18 |
| ORBITA SERVICOS DIVERSOS | 15 |
| PRESTADOR SEM CADASTRO | 15 |
| ATLAS VAREJO SINTETICO | 14 |
| CAMPO MODULAR FORNECIMENTOS | 14 |
| CASA PRISMA SAUDE SINTETICA | 14 |
| COLETIVO QUADRO LIVRE | 14 |
| NEBULA GRID SISTEMAS | 14 |
| NUCLEO EXAME BASE | 14 |
| PRUMO OBRAS SINTETICAS | 13 |
| ROTA CLARA GALPOES | 12 |
| QUADRO VIVO EQUIPAMENTOS | 9 |
| CINTILA INDUSTRIA SINTETICA | 6 |
| DELTA LOJA SINTETICA | 6 |
| TRAMA DIAGNOSTICO TECH | 6 |

## Top 50 documentos

| Documento | Pendencias |
| --- | --- |
| ISO SYN 0001 | 5 |
| ISO SYN 0003 | 5 |
| ISO SYN 0006 | 5 |
| ISO SYN 0009 | 5 |
| ISO SYN 0015 | 5 |
| ISO SYN 0018 | 5 |
| ISO SYN 0021 | 5 |
| ISO SYN 0023 | 5 |
| ISO SYN 0026 | 5 |
| ISO SYN 0029 | 5 |
| ISO SYN 0035 | 5 |
| ISO SYN 0038 | 5 |
| ISO SYN 0041 | 5 |
| ISO SYN 0043 | 5 |
| ISO SYN 0046 | 5 |
| ISO SYN 0049 | 5 |
| ISO SYN 0055 | 5 |
| ISO SYN 0058 | 5 |
| ISO SYN 0061 | 5 |
| ISO SYN 0063 | 5 |
| ISO SYN 0066 | 5 |
| ISO SYN 0069 | 5 |
| ISO SYN 0075 | 5 |
| ISO SYN 0078 | 5 |
| ISO SYN 0081 | 5 |
| ISO SYN 0083 | 5 |
| ISO SYN 0086 | 5 |
| ISO SYN 0089 | 5 |
| ISO SYN 0095 | 5 |
| TEMP SYN 0001 | 5 |
| TEMP SYN 0002 | 5 |
| TEMP SYN 0003 | 5 |
| TEMP SYN 0004 | 5 |
| TEMP SYN 0005 | 5 |
| TEMP SYN 0006 | 5 |
| TEMP SYN 0007 | 5 |
| TEMP SYN 0008 | 5 |
| TEMP SYN 0009 | 5 |
| TEMP SYN 0010 | 5 |
| TEMP SYN 0011 | 5 |
| TEMP SYN 0012 | 5 |
| TEMP SYN 0013 | 5 |
| TEMP SYN 0014 | 5 |
| TEMP SYN 0015 | 5 |
| TEMP SYN 0016 | 5 |
| TEMP SYN 0017 | 5 |
| TEMP SYN 0018 | 5 |
| TEMP SYN 0019 | 5 |
| TRF SYN 0001 | 5 |
| TRF SYN 0002 | 5 |

## Top 50 descricao + faixa de valor

| Grupo | Pendencias |
| --- | --- |
| TRANSFERENCIA INTERNA ENTRE CONTAS LUNAR CIFRA\|1000-4999.99 | 24 |
| TRANSFERENCIA INTERNA ENTRE CONTAS NEBLINA DE T\|1000-4999.99 | 24 |
| TRANSFERENCIA INTERNA ENTRE CONTAS ORBITA DE ES\|1000-4999.99 | 24 |
| TRANSFERENCIA INTERNA ENTRE CONTAS PANELA DE NO\|1000-4999.99 | 24 |
| TRANSFERENCIA INTERNA ENTRE CONTAS VIVANEXO CLI\|1000-4999.99 | 24 |
| EMPRESTIMO CAPITAL GIRO\|1000-4999.99 | 12 |
| EQUIPAMENTO IMAGEM PARC\|1000-4999.99 | 12 |
| ESTRUTURA ESTOQUE PARC\|1000-4999.99 | 12 |
| COMPRA NOTEBOOK DEV\|1000-4999.99 | 10 |
| FORNO COMBINADO PARCELA\|1000-4999.99 | 10 |
| KIT VIDEO PRODUTORA\|1000-4999.99 | 9 |
| REFORMA AREA EXTERNA\|1000-4999.99 | 8 |
| ANTECIPACAO FLUXO MIDIA\|1000-4999.99 | 6 |
| CONTRATO ATACADO TEMPORARIO\|5000-19999.99 | 6 |
| PROJETO SAUDE OCUPACIONAL\|5000-19999.99 | 6 |
| PROJETO TEMPORARIO ARQUITETURA\|5000-19999.99 | 6 |
| ADEQUACAO SALA PROCEDIMENTO\|1000-4999.99 | 5 |
| BONUS CAMPANHA LANCTO\|1000-4999.99 | 4 |
| DEBITO PAGTO PIX ESTOQUE FORNECEDOR SEM HIS\|1000-4999.99 | 4 |
| PAGTO MANUTENCAO EQUIPAMENTO ORBITA EQUIPAMENTO\|1000-4999.99 | 4 |
| CAMPANHA SAZONAL FIM ANO\|1000-4999.99 | 3 |
| CRED REEMBOLSO GLOSA REVERSA CASA PRISMA SAUDE\|500-999.99 | 3 |
| CRED REEMBOLSO MIDIA CAMPANHA VENTO SOLAR INDUST\|1000-4999.99 | 3 |
| DEB AUTO MANUTENCAO AUTOCLAVE FOCO MED EQUIPAMEN\|1000-4999.99 | 3 |
| DEB AUTO SUPORTE PLATAFORMA CRIACAO NEBULA GRID SISTEM\|500-999.99 | 3 |
| DEBITO MATERIAL CLINICO EXTRA NUCLEO EXAME BASE\|1000-4999.99 | 3 |
| FESTIVAL INVERNO COTAS\|5000-19999.99 | 3 |
| PAGTO EVENTO CLIENTE PROSPECCAO FIO DE CENA PRODUC A\|1000-4999.99 | 3 |
| PAGTO SUPORTE PLATAFORMA CRIACAO NEBULA GRID SISTEM\|500-999.99 | 3 |
| PIX AJUSTE FRETE EXTRA PRISMA ENTREGAS SI\|1000-4999.99 | 3 |
| PIX CURSO PROCEDIMENTOS CAMPO ABERTO FORMA\|500-999.99 | 3 |
| CRED REEMBOLSO CLIENTE AJUSTE SLA ATLAS VAREJO SINTE\|500-999.99 | 2 |
| CRED REEMBOLSO DELIVERY AJUSTE PRISMA ENTREGAS SI A\|500-999.99 | 2 |
| CRED REEMBOLSO GLOSA REVERSA CASA PRISMA SAUDE AJUSTE\|500-999.99 | 2 |
| DEB AUTO CURSO PROCEDIMENTOS CAMPO ABERTO FORMA\|1000-4999.99 | 2 |
| DEB AUTO PIX CRIACAO FREELA COLETIVO QUADRO LI AJUSTE\|1000-4999.99 | 2 |
| DEBITO AJUSTE FRETE EXTRA PRISMA ENTREGAS SI\|1000-4999.99 | 2 |
| DEBITO EVENTO CLIENTE PROSPECCAO FIO DE CENA PRODUC\|1000-4999.99 | 2 |
| DEBITO MANUTENCAO AUTOCLAVE FOCO MED EQUIPAMEN\|1000-4999.99 | 2 |
| DEBITO TREINAMENTO BRIGADA MESA ABERTA EVENTO AJUSTE\|500-999.99 | 2 |
| DEBITO TREINAMENTO BRIGADA MESA ABERTA EVENTO\|1000-4999.99 | 2 |
| PAGTO EVENTO CLIENTE PROSPECCAO FIO DE CENA PRODUC\|1000-4999.99 | 2 |
| PAGTO PIX SERVICOS CLINICA PRESTADOR SEM CADA\|500-999.99 | 2 |
| PAGTO SUPORTE PLATAFORMA CRIACAO NEBULA GRID SISTEM AJUSTE\|500-999.99 | 2 |
| PAGTO TREINAMENTO BRIGADA MESA ABERTA EVENTO AJUSTE\|1000-4999.99 | 2 |
| PAGTO TREINAMENTO EQUIPE PRODUTO CAMPO ABERTO FORMA A\|1000-4999.99 | 2 |
| PAGTO TREINAMENTO HUB OPERACAO CAMPO ABERTO FORMA COMP\|1000-4999.99 | 2 |
| PAGTO TREINAMENTO HUB OPERACAO CAMPO ABERTO FORMA\|1000-4999.99 | 2 |
| PIX AJUSTE FRETE EXTRA PRISMA ENTREGAS SI COMP\|500-999.99 | 2 |
| PIX CURSO PROCEDIMENTOS CAMPO ABERTO FORMA\|1000-4999.99 | 2 |

## Cobertura por tipo de regra

| Tipo | Regras teoricas | Transactions teoricas | Regras generalizaveis | Transactions generalizaveis |
| --- | --- | --- | --- | --- |
| document_equals | 0 | 0 | 0 | 0 |
| counterparty_contains | 0 | 0 | 0 | 0 |
| description_contains | 0 | 0 | 0 | 0 |
| counterparty_and_amount_range | 0 | 0 | 0 | 0 |

As tabelas de contraparte e documento usam o ground truth como evidencia quando o campo persistido esta vazio. As estimativas de regras, entretanto, usam apenas campos realmente persistidos; por isso `counterparty_contains` e `document_equals` nao recebem cobertura artificial.

## Regras generalizaveis recomendadas para avaliacao

| Tipo | Valor | Categoria esperada | Cobertura | Meses | Pureza |
| --- | --- | --- | --- | --- | --- |

## Cobertura de 80%

Nao restam pendencias categorizaveis sem pattern ativo; portanto nao ha nova cobertura de seed a recomendar.

| Ordem | Tipo | Valor | Categoria | Cobertura bruta |
| --- | --- | --- | --- | --- |

## Respostas objetivas

1. Existem 11 uncategorized apos aplicar 69 patterns description-based por empresa; os casos restantes nao possuem categoria segura ou familia semantica coberta.
2. O seed nao apresenta lacuna categorizavel restante: nenhuma pendencia aponta para categoria conhecida sem pattern ativo.
3. 11 pendencias usam descricoes que nao contem nenhum pattern publicado no seed.
4. O harness continua usando principalmente description_contains porque o XLSX publicado nao transporta contraparte/documento canonicos; isso agora e limitacao de sinal, nao lacuna de cobertura.
5. Nao ha novas regras recomendadas: todas as pendencias categorizaveis restantes ja possuem pattern e exigem revisao, conflito ou baixa confianca por desenho.
6. Regras unitarias por documento continuam excluidas para evitar overfitting; futuras regras so devem ser consideradas se novos dados reais trouxerem sinais persistidos confiaveis.
7. O esperado de 404 pendencias nao e compativel com o seed atual: ele pressupoe cobertura de categorizacao e uma semantica de pendencia de recorrencia diferente da implementada pela V1.
