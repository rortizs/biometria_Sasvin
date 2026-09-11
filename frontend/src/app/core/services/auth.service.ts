import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthMeResponse, User, LoginRequest, TokenResponse } from '../models/user.model';
import { WebSocketNotificationService } from './websocket-notification.service';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly wsNotif = inject(WebSocketNotificationService);
  private readonly baseUrl = environment.apiUrl;

  private readonly currentUser = signal<User | null>(null);
  private readonly isLoading = signal(false);
  // `/auth/me`'s granted permission codes (task 4.3a's `AuthMeResponse`).
  // Populated atomically alongside `currentUser` from the same response, so
  // any consumer that has already observed a non-null `user()` can rely on
  // `permissions()`/`hasPermission()` being in sync with it.
  private readonly userPermissions = signal<string[]>([]);

  readonly user = this.currentUser.asReadonly();
  readonly loading = this.isLoading.asReadonly();
  readonly permissions = this.userPermissions.asReadonly();
  readonly isAuthenticated = computed(() => !!this.currentUser());
  // Canonical uppercase roles (user.model.ts's `UserRole`, design.md "Canonical
  // Roles"). Casing fixed 1:1 with the pre-migration literals below — no
  // change to which roles are included. `isCoordinadorOrAbove` is currently
  // unused anywhere in the codebase (confirmed by grep); its inclusion of
  // `DIRECTOR` predates design.md's D10 (`DIRECTOR` is now read-only), so a
  // future caller should re-evaluate whether `DIRECTOR` still belongs here
  // rather than assume this call's casing-only fix re-validated the set.
  readonly isAdmin = computed(() => this.currentUser()?.role === 'ADMIN');
  readonly isCoordinadorOrAbove = computed(() => ['ADMIN', 'DIRECTOR', 'COORDINADOR'].includes(this.currentUser()?.role ?? ''));
  readonly mustChangePassword = computed(() => this.currentUser()?.must_change_password ?? false);

  /** Checks a granted permission code (design.md's permission-code model,
   * `/auth/me`'s `permissions: string[]`) instead of matching a role name.
   * Returns `false` before `/auth/me` resolves or when unauthenticated. */
  hasPermission(code: string): boolean {
    return this.userPermissions().includes(code);
  }

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
    this.wsNotif.disconnect();
    this.clearTokens();
    this.currentUser.set(null);
    this.userPermissions.set([]);
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

  changeFirstPassword(newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/auth/change-first-password`, { new_password: newPassword }).pipe(
      tap(() => this.currentUser.update(u => u ? { ...u, must_change_password: false } : null))
    );
  }

  private loadCurrentUser(): void {
    const token = this.getAccessToken();
    if (!token) {
      this.isLoading.set(false);
      return;
    }

    this.http.get<AuthMeResponse>(`${this.baseUrl}/auth/me`).subscribe({
      next: (user) => {
        this.currentUser.set(user);
        this.userPermissions.set(user.permissions ?? []);
        this.isLoading.set(false);
        // Reconnect WebSocket when user is loaded from stored token
        this.wsNotif.connect(token, () => this.getAccessToken());
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
