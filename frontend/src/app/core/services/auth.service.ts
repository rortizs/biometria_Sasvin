import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User, LoginRequest, TokenResponse } from '../models/user.model';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly baseUrl = environment.apiUrl;

  private readonly currentUser = signal<User | null>(null);
  private readonly isLoading = signal(false);

  readonly user = this.currentUser.asReadonly();
  readonly loading = this.isLoading.asReadonly();
  readonly isAuthenticated = computed(() => !!this.currentUser());
  readonly isAdmin = computed(() => this.currentUser()?.role === 'admin');

  constructor() {
    this.loadCurrentUser();
  }

  login(credentials: LoginRequest): Observable<TokenResponse> {
    this.isLoading.set(true);
    const formData = new URLSearchParams();
    formData.set('username', credentials.username);
    formData.set('password', credentials.password);

    return this.http
      .post<TokenResponse>(`${this.baseUrl}/auth/login`, formData.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      .pipe(
        tap((response) => {
          this.setTokens(response);
          this.loadCurrentUser();
        }),
        catchError((error) => {
          this.isLoading.set(false);
          return throwError(() => error);
        })
      );
  }

  logout(): void {
    this.clearTokens();
    this.currentUser.set(null);
    this.router.navigate(['/auth/login']);
  }

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  refreshAccessToken(): Observable<TokenResponse> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token'));
    }

    return this.http
      .post<TokenResponse>(`${this.baseUrl}/auth/refresh`, { refresh_token: refreshToken })
      .pipe(
        tap((response) => this.setTokens(response)),
        catchError((error) => {
          this.logout();
          return throwError(() => error);
        })
      );
  }

  private loadCurrentUser(): void {
    const token = this.getAccessToken();
    if (!token) {
      this.isLoading.set(false);
      return;
    }

    this.http.get<User>(`${this.baseUrl}/auth/me`).subscribe({
      next: (user) => {
        this.currentUser.set(user);
        this.isLoading.set(false);
      },
      error: () => {
        this.clearTokens();
        this.isLoading.set(false);
      },
    });
  }

  private setTokens(response: TokenResponse): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, response.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, response.refresh_token);
  }

  private clearTokens(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}
