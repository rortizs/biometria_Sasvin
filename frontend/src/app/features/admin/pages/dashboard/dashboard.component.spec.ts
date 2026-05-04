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
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['logout'], {
      user: signal({ full_name: 'Admin UMG', email: 'admin@example.com' }),
    });

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
});
