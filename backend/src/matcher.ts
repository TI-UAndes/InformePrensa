const KEYWORD_REGEX = /\b(universidad de los andes|uandes)\b/i;

export function containsUandesMention(text: string): boolean {
  return KEYWORD_REGEX.test(text);
}
