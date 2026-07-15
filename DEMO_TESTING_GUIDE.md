# DEMO_TESTING_GUIDE

## Objetivo

Este guia prepara uma demo manual reproduzível para validar o MVP V1 ponta a ponta via UI, com importação manual, categorização, pendências, duplicidades, recorrências e projeção.

## Pré-requisitos

- Banco configurado em `DATABASE_URL`
- Dependências instaladas
- Schema já migrado

## Reset da demo

```powershell
npm run demo:reset
```

O reset:

- limpa dados operacionais das empresas demo;
- preserva usuários demo, memberships, empresas, contas, categorias, regras e cenário base;
- remove uploads anteriores em `storage/uploads/demo-company` e `storage/uploads/demo-isolation-company`.

## Preparação dos fixtures

```powershell
npm run demo:fixtures
```

Arquivos gerados em `demo-fixtures/`:

- `01-itau-demo-principal.xlsx`
  Exercita importação principal, 46 transações, categorização automática, média, baixa, conflito, sem categoria, categoria inativa, categoria incompatível, duplicidade possível e recorrências.
- `02-itau-demo-reimportacao.xlsx`
  Cópia do arquivo principal para testar reimportação idempotente.
- `03-itau-demo-duplicidades-possiveis.xlsx`
  Reforça cenários de `DuplicateCandidate`.
- `04-itau-demo-segunda-conta.xlsx`
  Importável na conta secundária da `Empresa Demo`.
- `05-itau-demo-isolamento-empresa.xlsx`
  Importável na `Empresa Isolamento`.

## Subida da aplicação

```powershell
npm run dev
```

## URLs recomendadas

Empresa Demo, conta principal:

- `http://127.0.0.1:3000/dashboard?userId=demo-accountant&companyId=demo-company&bankAccountId=demo-itau-account`

Empresa Demo, conta secundária:

- `http://127.0.0.1:3000/dashboard?userId=demo-accountant&companyId=demo-company&bankAccountId=demo-itau-account-secondary`

Empresa Isolamento:

- `http://127.0.0.1:3000/dashboard?userId=demo-accountant&companyId=demo-isolation-company&bankAccountId=demo-isolation-itau-account`

Viewer bloqueado:

- `http://127.0.0.1:3000/dashboard?userId=demo-viewer&companyId=demo-company&bankAccountId=demo-itau-account`

## Usuários demo

- `demo-admin`
  Papel `admin`
- `demo-accountant`
  Papel `accountant`
- `demo-viewer`
  Papel `viewer`

## Fluxo manual principal

1. Rode `npm run demo:reset`.
2. Rode `npm run demo:fixtures`.
3. Rode `npm run dev`.
4. Abra a URL da `Empresa Demo` com `demo-accountant`.
5. Vá para `Importação`.
6. Selecione `demo-fixtures/01-itau-demo-principal.xlsx`.
7. Confirme o resumo do upload.
8. Vá para `Transações`.
9. Vá para `Categorização`.
10. Vá para `Pendências`.
11. Vá para `Recorrências`.
12. Edite uma sugestão, ajuste `nextDate` se necessário e aprove.
13. Vá para `Projeção` e regenere 30/60/90.

## O que deve aparecer por tela

### Importação

- upload aceitando `.xls`, `.xlsx` e `.pdf`;
- arquivo principal importado com sucesso;
- arquivo de reimportação gerando `0` novas transações;
- última importação exibindo formato e contagem.

### Transações

- pelo menos `46` transações após o primeiro import principal;
- receitas e despesas;
- itens com categoria automática;
- itens sem categoria;
- contraparte e documento em parte relevante dos lançamentos.

### Categorização

- sugestões `high`;
- sugestões `medium`;
- sugestões `low`;
- conflito para lançamentos `ACME CLOUD`;
- aceitação, correção e rejeição funcionando.

### Pendências

- `categorization_review`;
- `categorization_low_confidence`;
- `categorization_conflict`;
- `uncategorized_transaction`;
- `possible_duplicate`;
- `recurrence_approval`.

### Recorrências

- pelo menos uma sugestão mensal fixa;
- pelo menos uma sugestão mensal variável;
- pelo menos uma sugestão do tipo `installment`;
- edição antes de aprovar;
- aprovação criando `ApprovedRecurrence active`.

### Projeção

- geração de itens 30/60/90;
- regeneração sem duplicar registros;
- recorrências pausadas/encerradas não devem permanecer projetando.

### Dashboard

- total de transações coerente com os imports feitos;
- pendências abertas;
- sugestões de recorrência;
- recorrências aprovadas;
- contadores de projeção.

## Como testar categorização

- aceite uma sugestão `META ADS`;
- corrija uma sugestão `ACME CLOUD` para `Fornecedor`;
- rejeite uma sugestão `MERCADO CENTRAL`.

## Como testar duplicidades

- no arquivo principal já deve existir ao menos uma pendência `possible_duplicate`;
- importe `03-itau-demo-duplicidades-possiveis.xlsx` para aumentar os candidatos.

## Como testar recorrências

- use `demo-accountant` ou `demo-admin`;
- edite uma sugestão;
- ajuste `nextDate` para amanhã ou para uma data futura próxima;
- aprove a sugestão.

## Como testar projeção

- após aprovar uma recorrência, vá para `Projeção`;
- clique em `Regenerar projeção`;
- confirme itens em 30, 60 e 90 dias.

## Como testar viewer bloqueado

- abra a URL com `demo-viewer`;
- tente importar, aprovar recorrência ou disparar ações sensíveis;
- o viewer deve permanecer apenas em leitura.

## Como testar segunda conta

1. Mantenha `companyId=demo-company`.
2. Troque `bankAccountId` para `demo-itau-account-secondary` no seletor lateral.
3. Importe `demo-fixtures/04-itau-demo-segunda-conta.xlsx`.
4. Verifique que os lançamentos entram sem colidir com a conta principal.

## Como testar isolamento entre empresas

1. Troque `companyId` para `demo-isolation-company`.
2. Importe `demo-fixtures/05-itau-demo-isolamento-empresa.xlsx`.
3. Verifique que os dados aparecem apenas na empresa de isolamento.
4. Volte para `demo-company` e confirme que nada novo vazou para a empresa principal.

## Problemas comuns

- `IMPORT_FORBIDDEN`
  Verifique se o usuário atual é `demo-accountant` ou `demo-admin`.
- `BANK_ACCOUNT_NOT_FOUND`
  Confirme se `companyId` e `bankAccountId` estão alinhados.
- Sem fixtures
  Rode `npm run demo:fixtures`.
- Dados antigos misturados
  Rode `npm run demo:reset`.
- Nenhuma projeção
  Verifique se uma recorrência foi aprovada e está `active`.

## Limpar e recomeçar

```powershell
npm run demo:reset
npm run demo:fixtures
```

Depois recarregue a URL desejada e reimporte o arquivo principal.
