/** Count body words, excluding image metadata and link destinations.
 * Multiset comparison does not reward moving or reformatting existing words. */
export function bodyWords(markdown: string): string[] {
  return (
    markdown
      .normalize("NFKC")
      .toLowerCase()
      .replace(/!\[(?:\\.|[^\]])*\]\([^)]*\)/g, " ")
      .replace(/!\[(?:\\.|[^\]])*\]\[[^\]]*\]/g, " ")
      .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^\s*\[[^\]]+\]:.*$/gm, " ")
      .replace(/^\s*```[^\n]*$/gm, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/(?:https?:\/\/|asset:|annotation:)[^\s)]+/g, " ")
      .match(/[\p{L}\p{N}]+/gu) || []
  );
}
export function addedWords(baseline: string[], markdown: string): number {
  const counts = new Map<string, number>();
  baseline.forEach((w) => counts.set(w, (counts.get(w) || 0) + 1));
  let added = 0;
  for (const word of bodyWords(markdown)) {
    const count = counts.get(word) || 0;
    if (count) counts.set(word, count - 1);
    else added++;
  }
  return added;
}
export const normalizeLabel = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
