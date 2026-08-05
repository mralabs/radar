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
 * GET a URL
 *
 * @returns Response, null for 404, or throws on error
 */
async function request(url: string, accept: string, options: FetchOptions): Promise<Response | null> {
  const { headers = {}, timeout = DEFAULT_TIMEOUT } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: accept,
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

    return response
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

/**
 * Fetch JSON from a URL
 *
 * @returns Parsed JSON data, null for 404, or throws on error
 */
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T | null> {
  const response = await request(url, 'application/json', options)
  return response ? await response.json() as T : null
}

/**
 * Fetch raw text (HTML, markdown) from a URL
 *
 * @returns Body text, null for 404, or throws on error
 */
export async function fetchText(url: string, options: FetchOptions = {}): Promise<string | null> {
  const response = await request(url, 'text/html, text/plain, */*', options)
  return response ? await response.text() : null
}
