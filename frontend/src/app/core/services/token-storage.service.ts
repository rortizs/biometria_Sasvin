import { Injectable } from '@angular/core';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

// Split out of AuthService so authInterceptor can read/attach the token
// without injecting AuthService itself. AuthService's constructor makes its
// own HTTP call (loadCurrentUser -> GET /auth/me), which goes back through
// this same interceptor -- injecting AuthService there is a circular
// dependency (NG0200) the first time AuthService is constructed with a
// token already present, silently wiping a valid session on every cold
// load/reload.
@Injectable({
  providedIn: 'root',
})
export class TokenStorageService {
  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }

  clearTokens(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}
