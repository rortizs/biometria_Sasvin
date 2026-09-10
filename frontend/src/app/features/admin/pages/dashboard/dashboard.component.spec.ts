import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { DashboardComponent } from './dashboard.component';
import { AuthService } from '../../../../core/services/auth.service';
import { AttendanceService } from '../../../../core/services/attendance.service';
import { EmployeeService } from '../../../../core/services/employee.service';
import { NotificationService } from '../../../../core/services/notification.service';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let component: DashboardComponent;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['logout', 'hasPermission'], {
      user: signal({ full_name: 'Admin UMG', email: 'admin@example.com' }),
    });
    authServiceSpy.hasPermission.and.returnValue(false);

    const attendanceServiceSpy = jasmine.createSpyObj('AttendanceService', ['getTodayAttendance']);
    attendanceServiceSpy.getTodayAttendance.and.returnValue(of([
      {
        id: '1',
        employee_id: 'e1',
        employee_name: 'Juan Pérez',
        record_date: '2026-04-27',
        check_in: '2026-04-27T13:00:00Z',
        check_out: null,
        status: 'present',
        confidence: 0.98,
        geo_validated: true,
        distance_meters: 8.4,
        check_in_latitude: 14.2971,
        check_in_longitude: -89.8956,
        check_in_distance_meters: 8.4,
      },
    ]));

    const employeeServiceSpy = jasmine.createSpyObj('EmployeeService', ['getAll']);
    employeeServiceSpy.getAll.and.returnValue(of([
      { id: 'e1', has_face_registered: true },
    ]));

    const notificationServiceSpy = jasmine.createSpyObj('NotificationService', [
      'getUnreadCount',
      'getAll',
      'markRead',
      'markAllRead',
    ]);
    notificationServiceSpy.getUnreadCount.and.returnValue(of({ count: 0 }));
    notificationServiceSpy.getAll.and.returnValue(of([]));
    notificationServiceSpy.markRead.and.returnValue(of({} as any));
    notificationServiceSpy.markAllRead.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceSpy },
        { provide: AttendanceService, useValue: attendanceServiceSpy },
        { provide: EmployeeService, useValue: employeeServiceSpy },
        { provide: NotificationService, useValue: notificationServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  });

  it('should render geolocation coordinates and distance for today attendance', () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;

    expect(text).toContain('14.2971');
    expect(text).toContain('-89.8956');
    expect(text).toContain('8.4m');
  });

  // task 4.6: the scope-admin nav card is gated on the same permission
  // code (`user_scopes.manage`) that guards the `/admin/user-scopes` route
  // (task 4.6's `permissionGuard` wiring in app.routes.ts) — it must not
  // appear for actors who would just get redirected away.
  it('hides the Alcances nav card when the actor lacks user_scopes.manage', () => {
    (fixture.componentInstance.authService.hasPermission as jasmine.Spy).and.returnValue(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[routerLink="/admin/user-scopes"]')).toBeFalsy();
  });

  it('shows the Alcances nav card when the actor holds user_scopes.manage', () => {
    (fixture.componentInstance.authService.hasPermission as jasmine.Spy).and.returnValue(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[routerLink="/admin/user-scopes"]')).toBeTruthy();
  });

  // Task 4.7: design.md's Corrected Role Matrix scopes DECANO/DUEÑO to
  // read-only reporting + dashboard only ("MUST NOT... perform any
  // operational write action" — Business Top Role Boundaries). Real
  // migration grants confirm DECANO/DUEÑO hold `attendance.view` only —
  // none of `employees.manage.catedratico`, `locations.create`,
  // `schedules.create`, `departments.create`, `positions.create`,
  // `permission_requests.view`, `users.view`, or `settings.update`. Every
  // non-reporting nav-card must therefore be hidden by default (the spy's
  // `hasPermission` returns `false` unless a test overrides it).
  describe('non-reporting widget gating (DECANO/DUEÑO scope)', () => {
    it('hides every non-reporting nav card when the actor holds no write/admin permission', () => {
      (fixture.componentInstance.authService.hasPermission as jasmine.Spy).and.returnValue(false);
      fixture.detectChanges();

      const hiddenTargets = [
        '/admin/employees',
        '/admin/locations',
        '/admin/schedules',
        '/admin/departments',
        '/admin/positions',
        '/admin/permission-requests',
        '/admin/users',
        '/admin/settings',
      ];
      for (const target of hiddenTargets) {
        expect(fixture.nativeElement.querySelector(`a[routerLink="${target}"]`))
          .withContext(target)
          .toBeFalsy();
      }
    });

    it('keeps the Asistencia (reporting) nav card visible regardless of permission', () => {
      (fixture.componentInstance.authService.hasPermission as jasmine.Spy).and.returnValue(false);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('a[routerLink="/admin/attendance"]')).toBeTruthy();
    });

    it('shows each non-reporting nav card once its own real permission is granted', () => {
      const grants: Record<string, string> = {
        '/admin/employees': 'employees.manage.catedratico',
        '/admin/locations': 'locations.create',
        '/admin/schedules': 'schedules.create',
        '/admin/departments': 'departments.create',
        '/admin/positions': 'positions.create',
        '/admin/permission-requests': 'permission_requests.view',
        '/admin/users': 'users.view',
        '/admin/settings': 'settings.update',
      };
      const spy = fixture.componentInstance.authService.hasPermission as jasmine.Spy;
      spy.and.callFake((code: string) => code === grants['/admin/employees']);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('a[routerLink="/admin/employees"]')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('a[routerLink="/admin/locations"]')).toBeFalsy();
    });
  });
});
