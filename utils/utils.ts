import { redirect } from "next/navigation"

/**
 * Redirects to a specified path with an encoded message as a query parameter.
 * @param {('error' | 'success')} type - The type of message, either 'error' or 'success'.
 * @param {string} path - The path to redirect to.
 * @param {string} message - The message to be encoded and added as a query parameter.
 * @returns {never} This function doesn't return as it triggers a redirect.
 */
export function encodedRedirect(
  type: 'error' | 'success',
  path: string,
  message: string,
  additionalParams: Record<string, string> = {} // See actions.ts
) {
  const queryParams = new URLSearchParams({
    [type]: encodeURIComponent(message),
    ...additionalParams,
  })

  return redirect(`${path}?${queryParams}`)
}

export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj }
  keys.forEach((key) => delete result[key])
  return result
}

export function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, char) => char.toUpperCase())
    .replace(/^(.)/, (_, char) => char.toLowerCase());
}