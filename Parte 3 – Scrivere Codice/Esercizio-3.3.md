## Esercizio 3.3 – Il prompt per l'AI

### Prompt

```
Sei un assistente legale esperto in analisi contrattuale. Il tuo compito è
leggere il testo di un contratto ed estrarre tutte le clausole rilevanti.

ISTRUZIONI:
1. Identifica ogni clausola distinta nel testo
2. Classificala per tipo: "penalty", "automatic_renewal", "confidentiality", "other"
3. Assegna un livello di rischio: "low", "medium", "high" (alto = impatto economico/legale significativo)
4. Se il documento non sembra un contratto, rispondi con clauses: []
5. Se il testo è in più lingue, estrai comunque le clausole mantenendo il testo originale
6. Se una clausola è ambigua, classificala col tipo più probabile e usa risk_level "medium"

Rispondi ESCLUSIVAMENTE con un JSON in questo formato, senza testo aggiuntivo:
{
  "clauses": [
    { "type": "string", "extractedText": "string", "riskLevel": "low|medium|high" }
  ]
}

ESEMPIO:
Input: "In caso di mancato pagamento entro 30 giorni, il fornitore applicherà una penale del 5% mensile."
Output:
{
  "clauses": [
    { "type": "penalty", "extractedText": "In caso di mancato pagamento entro 30 giorni, il fornitore applicherà una penale del 5% mensile.", "riskLevel": "high" }
  ]
}

Documento da analizzare:
{{DOCUMENT_TEXT}}
```

### Funzione di validazione

```typescript
interface ValidatedClause {
  type: "penalty" | "automatic_renewal" | "confidentiality" | "other";
  extractedText: string;
  riskLevel: "low" | "medium" | "high";
}

function validateAiResponse(raw: string): ValidatedClause[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("JSON malformato: risposta non parsabile");
  }

  if (typeof parsed !== "object" || parsed === null || !("clauses" in parsed)) {
    throw new Error("Campo 'clauses' mancante nella risposta");
  }

  const rawClauses = (parsed as any).clauses;
  if (!Array.isArray(rawClauses)) {
    throw new Error("'clauses' deve essere un array");
  }

  const validTypes = ["penalty", "automatic_renewal", "confidentiality", "other"];
  const validRisks = ["low", "medium", "high"];

  return rawClauses.map((c: any, i: number) => {
    if (!validTypes.includes(c.type)) {
      throw new Error(`Clausola ${i}: tipo non valido "${c.type}"`);
    }
    if (!validRisks.includes(c.riskLevel)) {
      throw new Error(`Clausola ${i}: risk level non valido "${c.riskLevel}"`);
    }
    if (typeof c.extractedText !== "string" || c.extractedText.trim() === "") {
      throw new Error(`Clausola ${i}: extractedText mancante o vuoto`);
    }
    return {
      type: c.type,
      extractedText: c.extractedText,
      riskLevel: c.riskLevel,
    };
  });
}
```

Se il JSON è malformato o incompleto, la funzione lancia un errore esplicito invece di restituire dati parziali/silenziosamente sbagliati, questo si aggancia al retry con backoff già previsto in `analyzeDocument` (3.1): un `MalformedResponseError` triggera un nuovo tentativo invece di salvare clausole corrotte nel database.