import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * Authenticated call against SlapWiseRest.
 *
 * Lived in GroupService until AuthService needed it too for account deletion.
 * Kept as its own module rather than exported from GroupService so the auth
 * layer does not have to depend on the group layer to make a request.
 */
export async function authFetch(path: string, options: RequestInit): Promise<Response> {
  const { tokens } = await fetchAuthSession();
  const token = tokens?.idToken?.toString();
  if (!token) throw new Error('Not authenticated');

  // Import the REST endpoint from amplifyconfiguration at runtime
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const config = require('../../amplifyconfiguration.json') as {
    API: { REST: { SlapWiseRest: { endpoint: string } } };
  };
  const base = config.API.REST.SlapWiseRest.endpoint.replace(/\/$/, '');

  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
      ...options.headers,
    },
  });
}
