import { RegisterInput, LoginInput } from './auth.validation';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: 'CUSTOMER' | 'TECHNICIAN' | 'MANAGER' | 'ADMIN';
    image?: string;
  };
}

export interface RegisterResponse extends AuthResponse {}

export interface LoginResponse extends AuthResponse {}
