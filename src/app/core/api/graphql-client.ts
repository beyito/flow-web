export interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

const GRAPHQL_URL = 'http://localhost:8080/graphql';
const AUTH_TOKEN_KEY = 'flow-web-auth-token';

export async function executeGraphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers,
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
