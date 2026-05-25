import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';

import { SchedulesComponent } from './schedules.component';
import { DepartmentService } from '../../../../core/services/department.service';
import { EmployeeService } from '../../../../core/services/employee.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ScheduleService } from '../../../../core/services/schedule.service';
import { WebSocketNotificationService } from '../../../../core/services/websocket-notification.service';

describe('SchedulesComponent', () => {
  let fixture: ComponentFixture<SchedulesComponent>;
  let component: SchedulesComponent;
  let scheduleServiceSpy: jasmine.SpyObj<ScheduleService>;

  beforeEach(async () => {
    scheduleServiceSpy = jasmine.createSpyObj('ScheduleService', [
      'getPatterns',
      'getCalendar',
      'createBulkAssignments',
    ]);
    scheduleServiceSpy.getPatterns.and.returnValue(of([]));
    scheduleServiceSpy.getCalendar.and.returnValue(of({
      start_date: '2026-05-02',
      end_date: '2026-06-26',
      employees: [],
    }));
    scheduleServiceSpy.createBulkAssignments.and.returnValue(of({
      created: 1,
      message: 'Assignments created',
    }));

    const employeeServiceSpy = jasmine.createSpyObj('EmployeeService', ['getAll']);
    employeeServiceSpy.getAll.and.returnValue(of([]));

    const departmentServiceSpy = jasmine.createSpyObj('DepartmentService', ['getDepartments']);
    departmentServiceSpy.getDepartments.and.returnValue(of([]));

    const notificationServiceSpy = jasmine.createSpyObj('NotificationService', [
      'getAll',
      'markRead',
      'markAllRead',
    ]);
    notificationServiceSpy.getAll.and.returnValue(of([]));
    notificationServiceSpy.markRead.and.returnValue(of({}));
    notificationServiceSpy.markAllRead.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      imports: [SchedulesComponent],
      providers: [
        provideRouter([]),
        { provide: ScheduleService, useValue: scheduleServiceSpy },
        { provide: EmployeeService, useValue: employeeServiceSpy },
        { provide: DepartmentService, useValue: departmentServiceSpy },
        { provide: NotificationService, useValue: notificationServiceSpy },
        {
          provide: WebSocketNotificationService,
          useValue: { notifications$: new Subject() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SchedulesComponent);
    component = fixture.componentInstance;
  });

  it('sends backend bulk assignment contract with concrete Friday dates', () => {
    component.selectedEmployees.set(['emp-id']);
    component.assignForm = {
      patternId: 'pattern-id',
      isDayOff: false,
      startDate: '2026-05-02',
      endDate: '2026-06-26',
      daysOfWeek: [4],
    };

    component.saveAssignment();

    expect(scheduleServiceSpy.createBulkAssignments).toHaveBeenCalledTimes(1);
    const payload = scheduleServiceSpy.createBulkAssignments.calls.mostRecent().args[0] as unknown as Record<string, unknown>;

    expect(payload).toEqual({
      employee_ids: ['emp-id'],
      schedule_id: 'pattern-id',
      dates: [
        '2026-05-08',
        '2026-05-15',
        '2026-05-22',
        '2026-05-29',
        '2026-06-05',
        '2026-06-12',
        '2026-06-19',
        '2026-06-26',
      ],
      is_day_off: false,
    });
    expect(payload['schedule_pattern_id']).toBeUndefined();
    expect(payload['start_date']).toBeUndefined();
    expect(payload['end_date']).toBeUndefined();
    expect(payload['days_of_week']).toBeUndefined();
  });
});
