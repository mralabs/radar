/**
 * HTTP Client
 *
 * Fetch-based HTTP client for API requests.
 * Replaces the old Node.js https module.
 */

const USER_AGENT = 'radar/1.0'
const DEFAULT_TIMEOUT = 10000

export interface FetchOptions {
  headers?: Record<string, string>
  timeout?: number
}

/**
 * Fetch JSON from a URL
 *
 * @returns Parsed JSON data, null for 404, or throws on error
 */
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T | null> {
  const { headers = {}, timeout = DEFAULT_TIMEOUT } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        ...headers
      },
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`HTTP ${response.status}: ${text}`)
    }

    return await response.json() as T
  } catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout')
      }
      throw error
    }

    throw new Error('Unknown error')
  }
}
