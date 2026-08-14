/**
 * Thin OpenRouter client. Server-side only (reads OPENROUTER_API_KEY).
 *
 * Both LLM calls in the matching pipeline go through `chatJson`, which asks for
 * a JSON object back and parses it defensively - a hackathon-grade guard
 * against models that wrap JSON in prose or code fences.
 *
 * OPENROUTER_API_KEY is required. There is no keyword fallback: a missing key
 * or a failed call surfaces as an error rather than quietly degrading search.
 */
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Search latency is dominated by these two calls, so the default is chosen for
 * speed. Measured on the real pipeline (parse + filter + rank, 20 listings):
 *
 *   google/gemini-2.5-flash-lite      3.3s   <- default
 *   anthropic/claude-haiku-4.5       ~5s     good quality alternative
 *   qwen/qwen3-30b-a3b-instruct-2507 10.0s   slow to generate the ranking
 *   openai/gpt-5-mini                ~15s
 *
 * Verify a model ID against https://openrouter.ai/api/v1/models before setting
 * OPENROUTER_MODEL - retired IDs 404, and the failure is silent here because
 * the pipeline falls back to keyword matching.
 */
const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";

/** Overridable so a proxy (or a local mock in tests) can stand in. */
function completionsUrl(): string {
  const base = process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL;
  return `${base.replace(/\/$/, "")}/chat/completions`;
}

export class OpenRouterError extends Error {}

function requireApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new OpenRouterError(
      "OPENROUTER_API_KEY is not set. Search needs it to read the query and rank rooms - see .env.example.",
    );
  }
  return apiKey;
}

function requestBody(system: string, user: string, maxTokens: number) {
  return {
    model: process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL,
    temperature: 0.2,
    max_tokens: maxTokens,
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}

/**
 * Streams the assistant's content deltas as they are generated.
 *
 * The point is not throughput, it is that the *start* of a JSON object is
 * usable before the end exists: the ranking call puts the final order in the
 * first ~120 tokens and the explanations in the next ~500, so the caller can
 * commit to an order long before the reasons finish. See `rerankAndExplain`.
 */
export async function* chatStream({
  system,
  user,
  maxTokens = 1500,
  timeoutMs = 30_000,
}: {
  system: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
}): AsyncGenerator<string> {
  const apiKey = requireApiKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(completionsUrl(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ntu-room-finder.local",
        "X-Title": "NTU Room Finder",
      },
      body: JSON.stringify({ ...requestBody(system, user, maxTokens), stream: true }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new OpenRouterError(
        `OpenRouter ${res.status}: ${body.slice(0, 300)}`,
      );
    }
    if (!res.body) throw new OpenRouterError("OpenRouter returned no body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    /** Returns true when the frame was the terminator. */
    function* emit(line: string): Generator<string, boolean> {
      const trimmed = line.trim();
      // OpenRouter sends ": OPENROUTER PROCESSING" keepalive comments.
      if (!trimmed || trimmed.startsWith(":")) return false;
      if (!trimmed.startsWith("data:")) return false;
      const payload = trimmed.slice("data:".length).trim();
      if (payload === "[DONE]") return true;
      let chunk: {
        error?: { message?: string; code?: number };
        choices?: { delta?: { content?: string } }[];
      };
      try {
        chunk = JSON.parse(payload);
      } catch {
        // A frame split across reads is retried on the next pass.
        return false;
      }
      // A provider can fail mid-stream and say so in a frame. Without this the
      // stream just stops and the caller reports whatever half-written JSON it
      // had accumulated, which names the wrong culprit.
      if (chunk.error) {
        throw new OpenRouterError(
          `OpenRouter stream error: ${chunk.error.message ?? "unknown"}`,
        );
      }
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield delta;
      return false;
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are newline delimited; keep the trailing partial line.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (yield* emit(line)) return;
      }
    }

    // A final frame with no trailing newline is still a whole frame. Dropping
    // it truncates the JSON the caller is accumulating, which surfaces far away
    // as an unparseable response rather than as a stream that ended early.
    buffer += decoder.decode();
    if (buffer.trim()) yield* emit(buffer);
  } finally {
    clearTimeout(timer);
  }
}

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
  const apiKey = requireApiKey();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(completionsUrl(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Optional OpenRouter attribution headers.
        "HTTP-Referer": "https://ntu-room-finder.local",
        "X-Title": "NTU Room Finder",
      },
      body: JSON.stringify(requestBody(system, user, maxTokens)),
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
