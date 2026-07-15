# Zelo MVP V1

## Demo manual consolidada

Comandos:

```powershell
npm run demo:reset
npm run demo:fixtures
npm run dev
```

URLs:

- `http://127.0.0.1:3000/dashboard?userId=demo-accountant&companyId=demo-company&bankAccountId=demo-itau-account`
- `http://127.0.0.1:3000/dashboard?userId=demo-viewer&companyId=demo-company&bankAccountId=demo-itau-account`
- `http://127.0.0.1:3000/dashboard?userId=demo-accountant&companyId=demo-isolation-company&bankAccountId=demo-isolation-itau-account`

Usuários demo:

- `demo-admin`
- `demo-accountant`
- `demo-viewer`

Arquivos de importação:

- `demo-fixtures/01-itau-demo-principal.xlsx`
- `demo-fixtures/02-itau-demo-reimportacao.xlsx`
- `demo-fixtures/03-itau-demo-duplicidades-possiveis.xlsx`
- `demo-fixtures/04-itau-demo-segunda-conta.xlsx`
- `demo-fixtures/05-itau-demo-isolamento-empresa.xlsx`

O roteiro operacional completo está em `DEMO_TESTING_GUIDE.md`.
