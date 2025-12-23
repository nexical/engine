/**
 * Interpolates a template string with values from a context object.
 * Replaces {key} with the corresponding value from the context.
 *
 * @param template The template string containing placeholders like {key}.
 * @param context An object containing key-value pairs for replacement.
 * @returns The interpolated string.
 */
export function interpolate(template: string, context: Record<string, unknown>): string {
  let result = template;
  for (const [key, value] of Object.entries(context)) {
    result = result.replace(new RegExp(`{${key}}`, 'g'), String(value));
  }
  return result;
}
