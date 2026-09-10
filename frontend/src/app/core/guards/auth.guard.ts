import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Canonical uppercase roles (user.model.ts's `UserRole`, design.md "Canonical
// Roles"). `DECANO`/`DUEÑO` added by task 4.7 — design.md's Corrected Role
// Matrix gives them read-only Dashboard + reporting access, and they were
// previously locked out of every `/admin/*` route entirely (redirected to
// `/requests`), making the dashboard's DECANO/DUEÑO widget-hiding work
// unreachable. Narrowing DIRECTOR/COORDINADOR further (D10: DIRECTOR is now
// read-only) is a separate, not-yet-decided access-boundary change, left
// untouched here — see apply-progress.md task 4.7 evidence.
const ADMIN_ROLES = ['ADMIN', 'DIRECTOR', 'COORDINADOR', 'SECRETARIA', 'DECANO', 'DUEÑO'] as const;

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

/**
 * Permission-code-keyed guard (task 4.3, design.md permission-code model).
 * Reads `route.data['permission']` and checks it against
 * `AuthService.hasPermission()` (backed by `/auth/me`'s `permissions`,
 * task 4.3a) instead of comparing against a hardcoded role name — the same
 * discipline `adminGuard`'s role-name check does not have, since
 * role-to-permission grants are admin-configurable via the Roles UI.
 *
 * Added as a NEW exported guard rather than changing `adminGuard`'s
 * existing behavior: no route in `app.routes.ts` is wired to this guard
 * yet (see apply-progress.md task 4.3 evidence for why none of the three
 * permission codes named by this task currently has a genuine
 * route-level target — future permission-gated routes, e.g. task 4.6's
 * scope-admin page, are meant to use this).
 */
export const permissionGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const requiredPermission = route.data?.['permission'] as string | undefined;

  if (!authService.getAccessToken()) {
    router.navigate(['/auth/login']);
    return false;
  }

  const checkPermission = (): boolean => {
    if (!requiredPermission || authService.hasPermission(requiredPermission)) return true;
    router.navigate(['/requests']);
    return false;
  };

  if (authService.user() !== null) {
    return checkPermission();
  }

  // User signal still loading (async /auth/me) — wait for it, same pattern
  // as adminGuard above.
  return toObservable(authService.user).pipe(
    filter(u => u !== null),
    take(1),
    map(() => checkPermission())
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
