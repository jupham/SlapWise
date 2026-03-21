import {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
} from 'aws-amplify/auth';
import { Player } from '../types';

export interface AuthService {
  register(email: string, password: string): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  currentPlayer(): Promise<Player | null>;
}

export const AuthService: AuthService = {
  async register(email: string, password: string): Promise<void> {
    try {
      await signUp({
        username: email,
        password,
        options: {
          userAttributes: { email },
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
    await signOut();
  },

  async currentPlayer(): Promise<Player | null> {
    try {
      const { userId, username } = await getCurrentUser();
      return {
        playerId: userId,
        username,
      } as Player;
    } catch {
      return null;
    }
  },
};
