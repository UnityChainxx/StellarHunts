export function sanitizeText(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}
