import { analyzeDocument } from "../src/analysis-service.js";
import type { AiClient } from "../src/types/data-types.js";

function fakeClient(complete: AiClient["complete"]): AiClient {
  return { complete };
}

describe("analyzeDocument", () => {
  it("estrae correttamente le clausole da una risposta AI valida", async () => {
    const client = fakeClient(async () =>
      JSON.stringify({
        clauses: [
          {
            type: "penalty",
            extractedText: "Penale di 500€ in caso di ritardo",
            riskLevel: "high",
          },
        ],
      }),
    );

    const result = await analyzeDocument("Testo del contratto...", client);

    expect(result.clauses).toHaveLength(1);
    expect(result.clauses[0]!.type).toBe("penalty");
    expect(result.clauses[0]!.riskLevel).toBe("high");
  });

  it("lancia EmptyDocumentError se il documento è vuoto, senza chiamare l'AI", async () => {
    let called = false;
    const client = fakeClient(async () => {
      called = true;
      return "{}";
    });

    await expect(analyzeDocument("   ", client)).rejects.toThrow(
      "Il documento è vuoto",
    );
    expect(called).toBe(false);
  });

  it("riprova con backoff se la risposta è malformata, poi ha successo", async () => {
    let attempts = 0;
    const client = fakeClient(async () => {
      attempts++;
      if (attempts === 1) return "non è un json valido";
      return JSON.stringify({ clauses: [] });
    });

    const result = await analyzeDocument("Testo...", client);

    expect(result.clauses).toEqual([]);
    expect(attempts).toBe(2);
  });

  it("fallisce definitivamente dopo il numero massimo di tentativi", async () => {
    let attempts = 0;
    const client = fakeClient(async () => {
      attempts++;
      return "risposta sempre malformata";
    });

    await expect(analyzeDocument("Testo...", client)).rejects.toThrow();
    expect(attempts).toBe(3);
  });
});