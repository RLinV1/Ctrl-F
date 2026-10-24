// Read a response body as JSON without throwing. An empty or non-JSON body (the API server is down
// or restarting, so the Vite proxy returns a bare 502) becomes a readable error instead of
// "Unexpected end of JSON input".
export async function readJson<T = any>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: `API server not reachable (HTTP ${res.status}). Is dev-test/server.py running on port 8000?` } as T & { error: string };
  }
}
