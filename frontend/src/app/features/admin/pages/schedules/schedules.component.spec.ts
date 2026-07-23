import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';

import { SchedulesComponent } from './schedules.component';
import { DepartmentService } from '../../../../core/services/department.service';
import { EmployeeService } from '../../../../core/services/employee.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ScheduleService } from '../../../../core/services/schedule.service';
import { WebSocketNotificationService } from '../../../../core/services/websocket-notification.service';
import { CalendarEmployee } from '../../../../core/models/schedule.model';

function calendarEmployee(date: string): CalendarEmployee {
  return {
    employee_id: 'emp-id',
    employee_code: 'EMP-001',
    first_name: 'Ada',
    last_name: 'Lovelace',
    department_name: 'Engineering',
    default_schedule_name: 'Office',
    days: [{
      date,
      schedule_name: 'Office',
      check_in: '08:00:00',
      check_out: '17:00:00',
      is_day_off: false,
      exception_type: null,
      exception_description: null,
      color: '#ffffff',
    }],
  };
}

describe('SchedulesComponent', () => {
  let fixture: ComponentFixture<SchedulesComponent>;
  let component: SchedulesComponent;
  let scheduleServiceSpy: jasmine.SpyObj<ScheduleService>;

  beforeEach(async () => {
    scheduleServiceSpy = jasmine.createSpyObj('ScheduleService', [
      'getPatterns',
      'getCalendar',
      'createBulkAssignments',
      'deleteBulkAssignments',
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
    scheduleServiceSpy.deleteBulkAssignments.and.returnValue(of({ deleted_count: 1 }));

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

  it('keeps the API range, label, columns, and assignments aligned when navigating weeks', () => {
    fixture.detectChanges();
    component.filters.startDate = '2026-07-13';
    component.filters.endDate = '2026-07-19';
    component.loadCalendar();
    component.weekDays();
    component.weekLabel();
    scheduleServiceSpy.getCalendar.calls.reset();
    scheduleServiceSpy.getCalendar.and.returnValue(of({
      start_date: '2026-07-20',
      end_date: '2026-07-26',
      employees: [calendarEmployee('2026-07-20')],
    }));

    component.nextWeek();

    expect(scheduleServiceSpy.getCalendar).toHaveBeenCalledOnceWith('2026-07-20', '2026-07-26');
    expect(component.weekDays().map((day) => day.date)).toEqual([
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
      '2026-07-23',
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
    ]);
    expect(component.weekDays().map((day) => day.dayNumber)).toEqual([20, 21, 22, 23, 24, 25, 26]);
    expect(component.weekLabel()).toContain('20 jul - 26 jul, 2026');
    expect(component.filteredCalendar()[0].days[0].date).toBe('2026-07-20');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.schedule-time').textContent).toContain('08:00 | 17:00');

    scheduleServiceSpy.getCalendar.calls.reset();
    scheduleServiceSpy.getCalendar.and.returnValue(of({
      start_date: '2026-07-13',
      end_date: '2026-07-19',
      employees: [calendarEmployee('2026-07-13')],
    }));

    component.previousWeek();

    expect(scheduleServiceSpy.getCalendar).toHaveBeenCalledOnceWith('2026-07-13', '2026-07-19');
    expect(component.weekDays().map((day) => day.date)).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
      '2026-07-19',
    ]);
    expect(component.weekLabel()).toContain('13 jul - 19 jul, 2026');
    expect(component.filteredCalendar()[0].days[0].date).toBe('2026-07-13');
  });

  it('renders date-only filter values without timezone drift', () => {
    component.filters.startDate = '2026-07-20';
    component.filters.endDate = '2026-07-26';

    component.loadCalendar();

    expect(component.weekDays()[0]).toEqual(jasmine.objectContaining({
      date: '2026-07-20',
      dayName: 'Lun',
      dayNumber: 20,
      monthShort: 'Jul',
    }));
    expect(component.weekDays()[6]).toEqual(jasmine.objectContaining({
      date: '2026-07-26',
      dayName: 'Dom',
      dayNumber: 26,
      monthShort: 'Jul',
    }));
    expect(component.weekLabel()).toContain('20 jul - 26 jul, 2026');
  });

  it('ignores a stale calendar response after navigating to a newer week', () => {
    const firstResponse = new Subject<{ start_date: string; end_date: string; employees: CalendarEmployee[] }>();
    const secondResponse = new Subject<{ start_date: string; end_date: string; employees: CalendarEmployee[] }>();
    scheduleServiceSpy.getCalendar.and.returnValues(firstResponse, secondResponse);
    component.filters.startDate = '2026-07-13';
    component.filters.endDate = '2026-07-19';

    component.loadCalendar();
    component.nextWeek();
    secondResponse.next({
      start_date: '2026-07-20',
      end_date: '2026-07-26',
      employees: [calendarEmployee('2026-07-20')],
    });
    firstResponse.next({
      start_date: '2026-07-13',
      end_date: '2026-07-19',
      employees: [calendarEmployee('2026-07-13')],
    });

    expect(component.filteredCalendar()[0].days[0].date).toBe('2026-07-20');
  });

  it('shows selected employees and the current date range before deleting', () => {
    component.selectedEmployees.set(['emp-id', 'emp-2']);
    component.calendarRange.set({ startDate: '2026-07-13', endDate: '2026-07-19' });
    spyOn(window, 'confirm').and.returnValue(false);

    component.deleteSelectedAssignments();

    expect(window.confirm).toHaveBeenCalledWith(
      '¿Eliminar las asignaciones de 2 empleado(s) del 2026-07-13 al 2026-07-19?'
    );
    expect(scheduleServiceSpy.deleteBulkAssignments).not.toHaveBeenCalled();
  });

  it('sends one snapshot request and disables navigation while deletion is in flight', () => {
    const deletion = new Subject<{ deleted_count: number }>();
    scheduleServiceSpy.deleteBulkAssignments.and.returnValue(deletion);
    component.selectedEmployees.set(['emp-id']);
    component.calendarRange.set({ startDate: '2026-07-13', endDate: '2026-07-19' });
    spyOn(window, 'confirm').and.returnValue(true);

    component.deleteSelectedAssignments();
    component.filters.startDate = '2026-08-03';
    component.deleteSelectedAssignments();
    fixture.detectChanges();

    expect(scheduleServiceSpy.deleteBulkAssignments).toHaveBeenCalledOnceWith({
      employee_ids: ['emp-id'],
      start_date: '2026-07-13',
      end_date: '2026-07-19',
    });
    expect(component.deleting()).toBeTrue();
    expect(fixture.nativeElement.querySelectorAll('.nav-btn')[0].disabled).toBeTrue();
  });

  it('clears selection and refreshes the current range after a successful deletion', () => {
    component.selectedEmployees.set(['emp-id']);
    component.selectedCells.set(new Map([['emp-id', new Set(['2026-07-13'])]]));
    spyOn(window, 'confirm').and.returnValue(true);
    scheduleServiceSpy.getCalendar.calls.reset();

    component.deleteSelectedAssignments();

    expect(component.selectedEmployees()).toEqual([]);
    expect(component.selectedCells().size).toBe(0);
    expect(scheduleServiceSpy.getCalendar).toHaveBeenCalledOnceWith(
      component.filters.startDate,
      component.filters.endDate
    );
  });

  it('preserves selection and renders an actionable error when deletion fails', () => {
    const deletion = new Subject<{ deleted_count: number }>();
    scheduleServiceSpy.deleteBulkAssignments.and.returnValue(deletion);
    component.selectedEmployees.set(['emp-id']);
    spyOn(window, 'confirm').and.returnValue(true);

    component.deleteSelectedAssignments();
    deletion.error({ error: { detail: 'No se pudieron eliminar las asignaciones.' } });
    fixture.detectChanges();

    expect(component.selectedEmployees()).toEqual(['emp-id']);
    expect(fixture.nativeElement.textContent).toContain('No se pudieron eliminar las asignaciones.');
  });
});
