import {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
} from 'aws-amplify/auth';
import { Player } from '../types';

export interface AuthService {
  register(username: string, email: string, password: string): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  currentPlayer(): Promise<Player | null>;
}

export const AuthService: AuthService = {
  async register(username: string, email: string, password: string): Promise<void> {
    try {
      await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            'custom:username': username,
          },
        },
      });
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.name === 'UsernameExistsException') {
        throw new Error('EMAIL_TAKEN');
      }
      if (
        error.name === 'UserLambdaValidationException' &&
        error.message?.includes('USERNAME_TAKEN')
      ) {
        throw new Error('USERNAME_TAKEN');
      }
      throw err;
    }
  },

  async login(email: string, password: string): Promise<void> {
    try {
      await signIn({ username: email, password });
    } catch (err: unknown) {
      const error = err as { name?: string };
      if (
        error.name === 'NotAuthorizedException' ||
        error.name === 'UserNotFoundException'
      ) {
        throw new Error('INVALID_CREDENTIALS');
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
