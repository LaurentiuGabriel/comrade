/**
 * Authentication middleware
 */

import { Request, Response, NextFunction } from 'express';
import { ServerContext } from '../server.js';

export interface AuthenticatedRequest extends Request {
  actor?: {
    type: 'host' | 'remote';
    clientId?: string;
    tokenHash?: string;
    scope?: string;
  };
}

export function authMiddleware(context: ServerContext) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Skip auth for health check
    if (req.path === '/health' || req.path === '/') {
      return next();
    }

    const authHeader = req.headers.authorization;
    const hostTokenHeader = req.headers['x-comrade-host-token'] as string;

    // Debug logging
    console.log(`[auth] ${req.method} ${req.path}`);
    console.log(`[auth] Expected token: ${context.config.hostToken.slice(0, 8)}...`);
    console.log(`[auth] Received header: ${hostTokenHeader ? hostTokenHeader.slice(0, 8) + '...' : 'none'}`);

    // Check host token first (for admin access)
    if (hostTokenHeader) {
      if (hostTokenHeader === context.config.hostToken) {
        req.actor = {
          type: 'host',
          scope: 'owner',
        };
        console.log('[auth] ✓ Host token validated');
        return next();
      }
      console.log('[auth] ✗ Invalid host token');
      return res.status(401).json({ code: 'unauthorized', message: 'Invalid host token' });
    }

    // Check bearer token
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      console.log(`[auth] Bearer token received: ${token.slice(0, 8)}...`);
      const scope = await context.tokenService.validateToken(token);
      
      if (scope) {
        req.actor = {
          type: 'remote',
          scope,
          clientId: req.headers['x-comrade-client-id'] as string,
        };
        console.log('[auth] ✓ Bearer token validated');
        return next();
      }
      
      console.log('[auth] ✗ Invalid bearer token');
      return res.status(401).json({ code: 'unauthorized', message: 'Invalid bearer token' });
    }

    // For public endpoints, continue without auth
    if (req.path.startsWith('/public/')) {
      console.log('[auth] Public endpoint, skipping auth');
      return next();
    }

    console.log('[auth] ✗ No authentication provided');
    return res.status(401).json({ code: 'unauthorized', message: 'Authentication required' });
  };
}
