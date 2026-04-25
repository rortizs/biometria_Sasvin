import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

const ADMIN_ROLES = ['admin', 'director', 'coordinador', 'secretaria'] as const;

function hasAdminRole(role: string): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.getAccessToken()) return true;
  router.navigate(['/auth/login']);
  return false;
};

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.getAccessToken()) {
    router.navigate(['/auth/login']);
    return false;
  }

  const user = authService.user();
  if (user !== null) {
    if (hasAdminRole(user.role)) return true;
    router.navigate(['/requests']);
    return false;
  }

  // User signal still loading (async /auth/me) — wait for it
  return toObservable(authService.user).pipe(
    filter(u => u !== null),
    take(1),
    map(u => {
      if (u && hasAdminRole(u.role)) return true;
      router.navigate(['/requests']);
      return false;
    })
  );
};

export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.getAccessToken()) return true;

  const user = authService.user();
  const destination = user && !hasAdminRole(user.role) ? '/requests' : '/admin/dashboard';
  router.navigate([destination]);
  return false;
};
