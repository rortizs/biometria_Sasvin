import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { WebSocketNotificationService } from './websocket-notification.service';
import { environment } from '../../../environments/environment';
import { AuthMeResponse, User } from '../models/user.model';

// Regression coverage for the canonical uppercase `UserRole` migration
// (design.md "Canonical Roles", task 4.1) — `isAdmin`/`isCoordinadorOrAbove`
// previously compared against lowercase literals ('admin', 'director',
// 'coordinador') which silently never matched the backend's actual
// uppercase wire values ('ADMIN', 'DIRECTOR', 'COORDINADOR') after the
// role-split migration landed server-side, breaking every admin-gated
// computed signal without a compile error (TS2367 only fires for `===`
// literal comparisons where the literal itself is out of the union, which
// was already the case pre-fix; the array `.includes()` variant is not
// type-checked at all, which is why auth.guard.ts's identical bug never
// surfaced as a tsc error).
describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let wsNotifSpy: jasmine.SpyObj<WebSocketNotificationService>;

  const ACCESS_TOKEN_KEY = 'access_token';

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

  /** Constructs AuthService (which eagerly loads /auth/me on injection when
   *  a token is present) and flushes the mock response carrying `role`. */
  function createServiceWithRole(role: User['role']): AuthService {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'fake-token');
    const svc = TestBed.inject(AuthService);
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/me`);
    req.flush(buildUser(role));
    return svc;
  }

  /** Same as above but flushes the real `/auth/me` wire shape
   *  (`AuthMeResponse`, task 4.3a) carrying `permissions`. */
  function createServiceWithPermissions(permissions: string[]): AuthService {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'fake-token');
    const svc = TestBed.inject(AuthService);
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/me`);
    const response: AuthMeResponse = { ...buildUser('COORDINADOR'), permissions };
    req.flush(response);
    return svc;
  }

  beforeEach(() => {
    wsNotifSpy = jasmine.createSpyObj('WebSocketNotificationService', ['connect', 'disconnect']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: WebSocketNotificationService, useValue: wsNotifSpy },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    httpMock.verify();
  });

  describe('isAdmin', () => {
    it('is true for a canonical uppercase ADMIN user', () => {
      service = createServiceWithRole('ADMIN');
      expect(service.isAdmin()).toBe(true);
    });

    it('is false for a non-admin canonical role (proves the check is real, not a stub)', () => {
      service = createServiceWithRole('CATEDRATICO');
      expect(service.isAdmin()).toBe(false);
    });
  });

  describe('isCoordinadorOrAbove', () => {
    it('is true for COORDINADOR', () => {
      service = createServiceWithRole('COORDINADOR');
      expect(service.isCoordinadorOrAbove()).toBe(true);
    });

    it('is false for a role outside the coordinador-or-above set', () => {
      service = createServiceWithRole('CATEDRATICO');
      expect(service.isCoordinadorOrAbove()).toBe(false);
    });
  });

  // Task 4.3: `/auth/me` now returns `permissions: string[]` (task 4.3a).
  // `hasPermission()` is the single source of truth guards/components use
  // to check a granted permission code, instead of hardcoding a
  // role→permission map that would drift from the admin-configurable
  // Roles UI.
  describe('hasPermission', () => {
    it('is true for a permission code present in /auth/me\'s granted list', () => {
      service = createServiceWithPermissions(['user_scopes.manage', 'attendance.view']);
      expect(service.hasPermission('user_scopes.manage')).toBe(true);
    });

    it('is false for a permission code absent from the granted list (proves it is a real lookup, not a stub)', () => {
      service = createServiceWithPermissions(['attendance.view']);
      expect(service.hasPermission('user_scopes.manage')).toBe(false);
    });

    it('is false for every code before /auth/me resolves (no token)', () => {
      // No token set -> loadCurrentUser() short-circuits, permissions stays empty.
      service = TestBed.inject(AuthService);
      expect(service.hasPermission('user_scopes.manage')).toBe(false);
    });
  });
});
