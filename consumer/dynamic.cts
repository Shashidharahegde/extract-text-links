export async function links(input: string): Promise<string[]> {
  const { default: extractContent } = await import("extract-text-links");
  return extractContent(input).links;
}
