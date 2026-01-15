import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Check token directly instead of waiting for user to load
  const token = authService.getAccessToken();
  if (token) {
    return true;
  }

  router.navigate(['/auth/login']);
  return false;
};

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // For now, if user has token, allow access
  // Role check happens after user loads
  const token = authService.getAccessToken();
  if (token) {
    return true;
  }

  router.navigate(['/']);
  return false;
};

export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const token = authService.getAccessToken();
  if (!token) {
    return true;
  }

  router.navigate(['/admin/dashboard']);
  return false;
};
