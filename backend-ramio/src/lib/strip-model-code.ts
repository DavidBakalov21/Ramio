/**
 * LLMs often wrap code in markdown fences or add a short preamble.
 * The whole-buffer fence regex alone misses that; this extracts the first fenced block if present.
 */
export function stripModelCodeOutput(text: string): string {
  const trimmed = text.trim();
  const wholeFileFence = trimmed.match(
    /^```(?:[\w.-]+)?\s*\n?([\s\S]*?)\n?```$/,
  );
  if (wholeFileFence) return wholeFileFence[1].trim();

  const firstFence = trimmed.match(/```(?:[\w.-]+)?\s*\n([\s\S]*?)```/);
  if (firstFence) return firstFence[1].trim();

  return trimmed;
}
