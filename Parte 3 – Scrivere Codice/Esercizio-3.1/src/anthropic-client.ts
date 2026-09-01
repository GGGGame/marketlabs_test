import { AiTimeoutError, MalformedResponseError, type AiClient } from "./types/data-types.js";

export class AnthropicClient implements AiClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = "claude-sonnet-4-6",
    private readonly timeoutMs: number = 30000,
  ) {}

  async complete(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new MalformedResponseError(
          `Anthropic API ha risposto con status ${response.status}`,
        );
      }

      const data = await response.json();
      const textBlock = data.content?.find((block: any) => block.type === "text");

      if (!textBlock?.text) {
        throw new MalformedResponseError("Risposta Anthropic senza contenuto testuale");
      }

      return textBlock.text;
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new AiTimeoutError(`Timeout dopo ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}