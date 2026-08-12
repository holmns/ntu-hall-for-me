/**
 * Thin OpenRouter client. Server-side only (reads OPENROUTER_API_KEY).
 *
 * Both LLM calls in the matching pipeline go through `chatJson`, which asks for
 * a JSON object back and parses it defensively - a hackathon-grade guard
 * against models that wrap JSON in prose or code fences.
 */
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-3.5-haiku";

export function hasOpenRouterKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export class OpenRouterError extends Error {}

export async function chatJson<T>({
  system,
  user,
  maxTokens = 1500,
  timeoutMs = 20_000,
}: {
  system: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new OpenRouterError("OPENROUTER_API_KEY is not set");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Optional OpenRouter attribution headers.
        "HTTP-Referer": "https://ntu-room-finder.local",
        "X-Title": "NTU Room Finder",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL,
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new OpenRouterError(
        `OpenRouter ${res.status}: ${body.slice(0, 300)}`,
      );
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new OpenRouterError("OpenRouter returned no content");

    return extractJson<T>(content);
  } finally {
    clearTimeout(timer);
  }
}

/** Tolerates ```json fences and leading/trailing prose. */
export function extractJson<T>(raw: string): T {
  const text = raw.trim();
  const attempts: string[] = [text];

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) attempts.push(fence[1].trim());

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(text.slice(firstBrace, lastBrace + 1));
  }

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as T;
    } catch {
      // try the next shape
    }
  }
  throw new OpenRouterError(
    `Could not parse JSON from model output: ${text.slice(0, 200)}`,
  );
}
