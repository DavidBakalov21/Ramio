/**
 * LLMs often wrap code in markdown fences or add a short preamble.
 * Avoid treating ``` inside real Python (e.g. strings) as a fence: if the file
 * already begins like Python, return as-is.
 */
export function stripModelCodeOutput(text: string): string {
  const trimmed = text.trim().replace(/^\uFEFF/, '');
  const firstNonEmpty =
    trimmed.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  const head = firstNonEmpty.trim();
  const looksLikePythonStart =
    /^(import |from |#|class |@|async def |def |"""|''')/.test(head);

  if (looksLikePythonStart) {
    return trimmed;
  }

  const wholeFileFence = trimmed.match(
    /^```(?:[\w.-]+)?\s*\n?([\s\S]*?)\n?```$/,
  );
  if (wholeFileFence) return wholeFileFence[1].trim();

  const firstFence = trimmed.match(/```(?:[\w.-]+)?\s*\n([\s\S]*?)```/);
  if (firstFence) return firstFence[1].trim();

  return trimmed;
}
