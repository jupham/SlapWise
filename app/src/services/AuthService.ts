import {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  fetchUserAttributes,
} from 'aws-amplify/auth';
import { Player } from '../types';

export interface AuthService {
  register(email: string, password: string, username: string): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  currentPlayer(): Promise<Player | null>;
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
};
