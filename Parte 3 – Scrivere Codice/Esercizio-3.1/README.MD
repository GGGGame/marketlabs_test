## Esercizio 3.1 – Il servizio di analisi documenti

Il codice è nei file separati `src/analysis-service.ts` (servizio principale),
`src/anthropic-client.ts` (implementazione reale del client AI, dimostrativa)
e `tests/analysis-service.test.ts` (test).

I test non richiedono nessuna API key: usano un `fakeAiClient` iniettato al
posto del client reale, che implementa la stessa interfaccia `AiClient`.