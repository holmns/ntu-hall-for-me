/**
 * Thin OpenRouter client. Server-side only (reads OPENROUTER_API_KEY).
 *
 * Both LLM calls in the matching pipeline ask for a JSON object back and parse
 * it defensively - `extractJson` is a hackathon-grade guard against models that
 * wrap JSON in prose or code fences, and `withJsonRetries` asks again when even
 * that cannot read the answer.
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
 * OPENROUTER_MODEL - a retired ID 404s, which is not retried and surfaces as a
 * failed search.
 */
const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";

/** Low, because both prompts want a fixed shape rather than invention. */
const DEFAULT_TEMPERATURE = 0.2;

/** Overridable so a proxy (or a local mock in tests) can stand in. */
function completionsUrl(): string {
  const base = process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL;
  return `${base.replace(/\/$/, "")}/chat/completions`;
}

export class OpenRouterError extends Error {}

/**
 * The call succeeded but the model's output was not usable JSON.
 *
 * Split out from `OpenRouterError` because it is the one failure worth asking
 * again for: the key is fine, the model is reachable, it just wrote prose or
 * stopped mid-object. Everything else here (no key, 401, 429, a dead model ID)
 * fails again identically, so `withJsonRetries` only retries this one.
 *
 * Callers that validate the parsed object themselves - a zod schema over the
 * intent, say - should throw this on a schema miss so it retries the same way.
 * A JSON object with the wrong shape is the same defect as no object at all.
 */
export class UnparseableOutputError extends OpenRouterError {}

/**
 * Total tries, not extra ones. Three because the failure this covers is a bad
 * sample rather than a broken request: if the model cannot produce the shape
 * twice at rising temperature, a fourth ask is latency the seeker pays for
 * nothing.
 */
const MAX_JSON_ATTEMPTS = 3;

/**
 * Temperature per attempt. The retry is pointless at a fixed low temperature -
 * same prompt, same near-greedy path, same malformed output - so each retry
 * samples wider to get off it. The first attempt keeps the 0.2 the prompts were
 * written against, so normal searches are unaffected.
 */
const ATTEMPT_TEMPERATURES = [DEFAULT_TEMPERATURE, 0.5, 0.8];

/**
 * Runs `run` again while it fails to produce parseable JSON.
 *
 * No backoff between attempts. This is not a rate limit or an overloaded
 * upstream, it is one bad completion, and both call sites sit on the search
 * critical path where a sleep is a second of blank page for nothing.
 */
export async function withJsonRetries<T>(
  label: string,
  run: (attempt: { index: number; temperature: number }) => Promise<T>,
  attempts = MAX_JSON_ATTEMPTS,
): Promise<T> {
  let lastError: unknown;

  for (let index = 0; index < attempts; index++) {
    try {
      return await run({
        index,
        temperature:
          ATTEMPT_TEMPERATURES[index] ??
          ATTEMPT_TEMPERATURES[ATTEMPT_TEMPERATURES.length - 1],
      });
    } catch (error) {
      // Anything else - no key, HTTP error, aborted stream - would fail the
      // same way on a second ask, so it goes straight up.
      if (!(error instanceof UnparseableOutputError)) throw error;
      lastError = error;
      console.warn(
        `[openrouter] ${label}: unparseable output on attempt ${index + 1}/${attempts}: ${error.message}`,
      );
    }
  }

  throw lastError;
}

function requireApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new OpenRouterError(
      "OPENROUTER_API_KEY is not set. Search needs it to read the query and rank rooms - see .env.example.",
    );
  }
  return apiKey;
}

function requestBody(
  system: string,
  user: string,
  maxTokens: number,
  temperature: number,
) {
  return {
    model: process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL,
    temperature,
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
  temperature = DEFAULT_TEMPERATURE,
}: {
  system: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
  temperature?: number;
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
      body: JSON.stringify({
        ...requestBody(system, user, maxTokens, temperature),
        stream: true,
      }),
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
  temperature = DEFAULT_TEMPERATURE,
}: {
  system: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
  temperature?: number;
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
      body: JSON.stringify(requestBody(system, user, maxTokens, temperature)),
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
    // An empty completion is the same defect as an unreadable one, and asking
    // again is the same remedy - so it is retryable, not fatal.
    if (!content) {
      throw new UnparseableOutputError("OpenRouter returned no content");
    }

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
  throw new UnparseableOutputError(
    `Could not parse JSON from model output: ${text.slice(0, 200)}`,
  );
}
