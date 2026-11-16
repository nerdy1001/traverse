/**
 * A byte stream as text, piece by piece. Through a reader rather than `for await`,
 * which Safari doesn't support on a fetch body. Used by both ends of /api/ask.
 */
export async function* streamText(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
    const rest = decoder.decode();
    if (rest) yield rest;
  } finally {
    reader.releaseLock();
  }
}
