import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRouteSnapshot, Router, provideRouter } from '@angular/router';
import { adminGuard, guestGuard, permissionGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { User } from '../models/user.model';

// Regression coverage for the canonical uppercase `UserRole` migration
// (design.md "Canonical Roles", task 4.1) — `ADMIN_ROLES`/`hasAdminRole`
// previously compared against lowercase literals ('admin', 'director',
// 'coordinador', 'secretaria'), which silently stopped matching every real
// user after the backend started serializing uppercase canonical role
// values, locking every admin-gated route behind an unreachable check
// without ever producing a compile error (`.includes()` on a `string[]`
// literal is not type-checked against `UserRole`).
describe('auth.guard', () => {
  function setupWithUser(
    user: User | null,
    permissions: string[] = []
  ): { router: Router } {
    const authServiceSpy = jasmine.createSpyObj(
      'AuthService',
      ['getAccessToken', 'hasPermission'],
      { user: signal(user) }
    );
    authServiceSpy.getAccessToken.and.returnValue(user ? 'fake-token' : null);
    authServiceSpy.hasPermission.and.callFake((code: string) => permissions.includes(code));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceSpy },
      ],
    });

    return { router: TestBed.inject(Router) };
  }

  function routeWithPermission(permission: string | undefined): ActivatedRouteSnapshot {
    return { data: { permission } } as unknown as ActivatedRouteSnapshot;
  }

  function buildUser(role: User['role']): User {
    return {
      id: 'user-1',
      email: 'someone@miumg.edu.gt',
      full_name: 'Someone',
      role,
      is_active: true,
      must_change_password: false,
      employee_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
  }

  describe('adminGuard', () => {
    it('allows a canonical uppercase COORDINADOR user through', () => {
      setupWithUser(buildUser('COORDINADOR'));
      const result = TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));
      expect(result).toBe(true);
    });

    it('denies a role outside the admin set and redirects to /requests', () => {
      const { router } = setupWithUser(buildUser('CATEDRATICO'));
      const navigateSpy = spyOn(router, 'navigate');
      const result = TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));
      expect(result).toBe(false);
      expect(navigateSpy).toHaveBeenCalledWith(['/requests']);
    });

    // Task 4.7: design.md's Corrected Role Matrix gives DECANO/DUEÑO
    // read-only Dashboard access — they were missing from ADMIN_ROLES
    // (flagged as "a real dashboard access-boundary decision reserved for
    // task 4.7" by task 4.3's own comment), which made `/admin/dashboard`
    // unreachable for them and the widget-hiding work on that route dead
    // code from the router's perspective.
    it('allows DECANO through to /admin/dashboard', () => {
      setupWithUser(buildUser('DECANO'));
      const result = TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));
      expect(result).toBe(true);
    });

    it('allows DUEÑO through to /admin/dashboard', () => {
      setupWithUser(buildUser('DUEÑO'));
      const result = TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));
      expect(result).toBe(true);
    });
  });

  describe('guestGuard', () => {
    it('sends an authenticated admin-role user to /admin/dashboard', () => {
      const { router } = setupWithUser(buildUser('SECRETARIA'));
      const navigateSpy = spyOn(router, 'navigate');
      TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));
      expect(navigateSpy).toHaveBeenCalledWith(['/admin/dashboard']);
    });

    it('sends an authenticated non-admin-role user to /requests', () => {
      const { router } = setupWithUser(buildUser('CATEDRATICO'));
      const navigateSpy = spyOn(router, 'navigate');
      TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));
      expect(navigateSpy).toHaveBeenCalledWith(['/requests']);
    });
  });

  // Task 4.3: permission-code-keyed route guard, reads `route.data['permission']`
  // and checks it against `AuthService.hasPermission()` instead of a role name.
  describe('permissionGuard', () => {
    it('allows a user whose granted permissions include the route\'s required code', () => {
      setupWithUser(buildUser('COORDINADOR'), ['user_scopes.manage']);
      const route = routeWithPermission('user_scopes.manage');
      const result = TestBed.runInInjectionContext(() => permissionGuard(route, {} as never));
      expect(result).toBe(true);
    });

    it('denies a user missing the required permission and redirects to /requests', () => {
      const { router } = setupWithUser(buildUser('CATEDRATICO'), ['attendance.mark.self']);
      const navigateSpy = spyOn(router, 'navigate');
      const route = routeWithPermission('user_scopes.manage');
      const result = TestBed.runInInjectionContext(() => permissionGuard(route, {} as never));
      expect(result).toBe(false);
      expect(navigateSpy).toHaveBeenCalledWith(['/requests']);
    });

    it('redirects an unauthenticated request to /auth/login', () => {
      const { router } = setupWithUser(null);
      const navigateSpy = spyOn(router, 'navigate');
      const route = routeWithPermission('user_scopes.manage');
      const result = TestBed.runInInjectionContext(() => permissionGuard(route, {} as never));
      expect(result).toBe(false);
      expect(navigateSpy).toHaveBeenCalledWith(['/auth/login']);
    });
  });
});
