import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  email: string;
  role: 'CUSTOMER' | 'TECHNICIAN' | 'MANAGER' | 'ADMIN';
}

export function generateAccessToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET || 'dev_secret', {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m',
  } as jwt.SignOptions);
}

export function generateRefreshToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET || 'dev_refresh_secret', {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d',
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET || 'dev_secret') as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET || 'dev_refresh_secret') as TokenPayload;
}

export type RequestUser = {
  userId: string;
  email: string;
  role: 'CUSTOMER' | 'TECHNICIAN' | 'MANAGER' | 'ADMIN';
};
