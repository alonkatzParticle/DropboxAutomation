/**
 * lib/monday-api.ts — Low-level Monday.com GraphQL client
 *
 * Makes authenticated GraphQL requests to the Monday.com API.
 * Uses fetch (works in both Node.js and Vercel edge/serverless).
 *
 * Depends on: MONDAY_API_TOKEN environment variable
 * Used by: lib/monday-client.ts, app/api/board-import/route.ts
 */

const MONDAY_API_URL = "https://api.monday.com/v2";

// Returns the HTTP headers required for every Monday.com request
function getHeaders(): Record<string, string> {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error("MONDAY_API_TOKEN is missing from environment variables.");
  return {
    Authorization: token,
    "Content-Type": "application/json",
    "API-Version": "2023-10",
  };
}

/**
 * Execute a GraphQL query or mutation against the Monday.com API.
 * Returns the "data" object from the response.
 * Throws if the request fails or Monday returns errors.
 *
 * query     — GraphQL query string
 * variables — optional dict of variables to pass to the query
 */
export async function runQuery(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Monday.com HTTP error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (data.errors) {
    throw new Error(`Monday.com API error: ${JSON.stringify(data.errors)}`);
  }

  return (data.data ?? {}) as Record<string, unknown>;
}
