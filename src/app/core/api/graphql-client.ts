export interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

const GRAPHQL_URL = 'http://localhost:8080/graphql';

export async function executeGraphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const result = (await response.json()) as GraphqlResponse<T>;

  if (result.errors?.length) {
    throw new Error(result.errors.map((error) => error.message).join('; '));
  }

  return result.data as T;
}
