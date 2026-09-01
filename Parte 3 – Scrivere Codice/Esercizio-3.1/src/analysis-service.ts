import { AiTimeoutError, EmptyDocumentError, MalformedResponseError, type AiClient, type AnalysisResult, type Clause } from "./types/data-types.js";


const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildPrompt(documentText: string): string {
  return `Sei un assistente legale. Estrai le clausole dal seguente contratto e rispondi SOLO con un JSON nel formato:
{"clauses": [{"type": "penalty|automatic_renewal|confidentiality|other", "extractedText": "...", "riskLevel": "low|medium|high"}]}

Contratto:
${documentText}`;
}

export function parseAiResponse(raw: string): AnalysisResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new MalformedResponseError("La risposta dell'AI non è un JSON valido");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("clauses" in parsed) ||
    !Array.isArray((parsed as any).clauses)
  ) {
    throw new MalformedResponseError("Formato risposta AI inatteso: manca il campo 'clauses'");
  }

  const clauses = (parsed as any).clauses.map((c: any) => {
    if (!c.type || !c.extractedText || !c.riskLevel) {
      throw new MalformedResponseError("Clausola incompleta nella risposta AI");
    }
    return {
      type: c.type,
      extractedText: c.extractedText,
      riskLevel: c.riskLevel,
    } as Clause;
  });

  return { clauses };
}

export async function analyzeDocument(
  documentText: string,
  aiClient: AiClient,
): Promise<AnalysisResult> {
  if (!documentText || documentText.trim().length === 0) {
    throw new EmptyDocumentError("Il documento è vuoto, nessun testo da analizzare");
  }

  const prompt = buildPrompt(documentText);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const raw = await aiClient.complete(prompt);
      return parseAiResponse(raw);
    } catch (err) {
      lastError = err as Error;

      const isRetryable =
        err instanceof AiTimeoutError || err instanceof MalformedResponseError;

      if (!isRetryable || attempt === MAX_ATTEMPTS) {
        break;
      }

      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      await sleep(delay);
    }
  }

  throw lastError ?? new Error("Analisi fallita per motivo sconosciuto");
}