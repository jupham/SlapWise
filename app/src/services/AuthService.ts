import {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  fetchUserAttributes,
  deleteUser,
} from 'aws-amplify/auth';
import { authFetch } from './authFetch';
import { unregisterFromPush } from './PushService';
import { Player } from '../types';

export interface AuthService {
  register(email: string, password: string, username: string): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  currentPlayer(): Promise<Player | null>;
  deleteAccount(): Promise<void>;
}

export const AuthService: AuthService = {
  async register(email: string, password: string, username: string): Promise<void> {
    try {
      await signUp({
        // Cognito's sign-in identifier stays the email (signInAliases is
        // email-only). preferred_username carries the display name — it is a
        // mutable standard attribute and, since it isn't a sign-in alias, it
        // has no uniqueness constraint, so two friends may share a name.
        username: email,
        password,
        options: {
          userAttributes: { email, preferred_username: username },
        },
      });
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.name === 'UsernameExistsException') {
        throw new Error('EMAIL_TAKEN');
      }
      throw err;
    }
  },

  async login(email: string, password: string): Promise<void> {
    try {
      const result = await signIn({ username: email, password });
      if (result.nextStep?.signInStep === 'CONFIRM_SIGN_UP') {
        throw new Error('NOT_CONFIRMED');
      }
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.message === 'NOT_CONFIRMED') throw err;
      if (error.name === 'UserAlreadyAuthenticatedException') {
        await signOut();
        return this.login(email, password);
      }
      if (
        error.name === 'NotAuthorizedException' ||
        error.name === 'UserNotFoundException'
      ) {
        throw new Error('INVALID_CREDENTIALS');
      }
      if (error.name === 'UserNotConfirmedException') {
        throw new Error('NOT_CONFIRMED');
      }
      throw err;
    }
  },

  async logout(): Promise<void> {
    // Before signOut, while the request can still authenticate. It swallows its
    // own failures, so a device that cannot reach the API still gets to log
    // out — the token it leaves behind expires on its TTL.
    await unregisterFromPush();
    await signOut({ global: true });
  },

  async currentPlayer(): Promise<Player | null> {
    try {
      const { userId } = await getCurrentUser();
      // Not getCurrentUser().username: this pool signs in by email alias, so
      // Cognito's own username is an internal UUID. It was surfacing raw on the
      // welcome screen and in the drawer ("Hey 64384458-8031-…").
      const attrs = await fetchUserAttributes();
      return {
        playerId: userId,
        username: attrs.preferred_username ?? attrs.email ?? userId,
        email: attrs.email ?? '',
      } as Player;
    } catch {
      return null;
    }
  },

  /**
   * Deletes the account, as App Store guideline 5.1.1(v) requires of any app
   * that supports account creation.
   *
   * Split across two calls for the same reason updateUsername is: a Lambda in
   * LambdaStack cannot reference the user pool without a circular stack
   * dependency, so the client owns the Cognito half via the user-scoped
   * deleteUser().
   *
   * Order is the opposite of updateUsername's, though. There, Cognito goes
   * first so a failed fan-out still converges. Here the DynamoDB cleanup has to
   * go first: it is an authenticated call, and deleting the Cognito user is the
   * step that cannot be undone or retried. If the API call fails, nothing has
   * happened yet and the caller can try again.
   */
  async deleteAccount(): Promise<void> {
    const res = await authFetch('/players/me', { method: 'DELETE' });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Failed to delete account data: ${res.status} ${detail}`);
    }
    await deleteUser();
  },
};
