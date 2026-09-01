export interface Clause {
  type: string;
  extractedText: string;
  riskLevel: "low" | "medium" | "high";
}

export interface AnalysisResult {
  clauses: Clause[];
}

export class EmptyDocumentError extends Error {}
export class AiTimeoutError extends Error {}
export class MalformedResponseError extends Error {}

export interface AiClient {
  complete(prompt: string): Promise<string>;
}