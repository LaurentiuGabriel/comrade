/**
 * Token service for managing authentication tokens
 */

import { ServerConfig, Token, TokenScope, hashToken, generateToken, generateId } from '@comrade/core';

export class TokenService {
  private tokens: Map<string, Token> = new Map();

  constructor(private config: ServerConfig) {}

  async create(scope: TokenScope, options: { label?: string; expiresInHours?: number } = {}): Promise<Token> {
    const tokenValue = generateToken();
    const token: Token = {
      id: generateId(),
      token: tokenValue,
      scope,
      label: options.label,
      createdAt: Date.now(),
    };

    if (options.expiresInHours) {
      token.expiresAt = Date.now() + options.expiresInHours * 60 * 60 * 1000;
    }

    this.tokens.set(token.id, token);
    return token;
  }

  async validateToken(tokenValue: string): Promise<TokenScope | null> {
    for (const token of this.tokens.values()) {
      if (token.token === tokenValue) {
        // Check expiration
        if (token.expiresAt && Date.now() > token.expiresAt) {
          return null;
        }
        
        // Update last used
        token.lastUsedAt = Date.now();
        return token.scope;
      }
    }
    return null;
  }

  async list(): Promise<Omit<Token, 'token'>[]> {
    return Array.from(this.tokens.values()).map(t => ({
      id: t.id,
      scope: t.scope,
      label: t.label,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
      expiresAt: t.expiresAt,
    })) as any;
  }

  async revoke(tokenId: string): Promise<boolean> {
    return this.tokens.delete(tokenId);
  }

  async revokeByValue(tokenValue: string): Promise<boolean> {
    for (const [id, token] of this.tokens.entries()) {
      if (token.token === tokenValue) {
        return this.tokens.delete(id);
      }
    }
    return false;
  }
}
