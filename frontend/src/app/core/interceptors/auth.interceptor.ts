import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject, Injector, runInInjectionContext } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { TokenStorageService } from '../services/token-storage.service';
import { AuthService } from '../services/auth.service';

// Reads the token via TokenStorageService (no HTTP dependency) instead of
// AuthService. AuthService's own constructor makes an HTTP call
// (loadCurrentUser -> GET /auth/me), which is routed back through this same
// interceptor -- injecting AuthService synchronously here is a circular
// dependency (NG0200) the first time AuthService is constructed with a
// token already present, thrown inside the interceptor and silently
// swallowed by loadCurrentUser()'s catch-all error handler, wiping a valid
// session on every cold load/reload. AuthService is only needed for the
// 401 refresh/logout path below, resolved lazily via the injector well
// after AuthService has finished constructing (HTTP responses are always
// asynchronous relative to the request that triggered them).
export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const tokenStorage = inject(TokenStorageService);
  const injector = inject(Injector);
  const token = tokenStorage.getAccessToken();

  // Skip auth for login and refresh endpoints
  if (req.url.includes('/auth/login') || req.url.includes('/auth/refresh')) {
    return next(req);
  }

  // Add token if available
  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !req.url.includes('/auth/')) {
        const authService = runInInjectionContext(injector, () => inject(AuthService));
        // Try to refresh token
        return authService.refreshAccessToken().pipe(
          switchMap((response) => {
            const newReq = req.clone({
              setHeaders: {
                Authorization: `Bearer ${response.access_token}`,
              },
            });
            return next(newReq);
          }),
          catchError(() => {
            authService.logout();
            return throwError(() => error);
          })
        );
      }
      return throwError(() => error);
    })
  );
};
