import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';

import { AttendanceComponent } from './attendance.component';
import type { AttendanceRecord } from '../../../../core/models/attendance.model';
import { AttendanceService } from '../../../../core/services/attendance.service';
import { DepartmentService } from '../../../../core/services/department.service';
import { EmployeeService } from '../../../../core/services/employee.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { WebSocketNotificationService } from '../../../../core/services/websocket-notification.service';

const baseRecord: AttendanceRecord = {
  id: 'record-1',
  employee_id: 'employee-1',
  employee_name: 'Ana López',
  record_date: '2026-07-21',
  check_in: '2026-07-21T14:00:00Z',
  check_out: null,
  status: 'present',
  confidence: 0.98,
  geo_validated: true,
};

function attendanceRecord(overrides: Partial<AttendanceRecord>): AttendanceRecord {
  return { ...baseRecord, ...overrides };
}

describe('AttendanceComponent', () => {
  let fixture: ComponentFixture<AttendanceComponent>;
  let component: AttendanceComponent;
  let attendanceServiceSpy: jasmine.SpyObj<AttendanceService>;
  let serviceRecords: AttendanceRecord[];

  beforeEach(async () => {
    serviceRecords = [baseRecord];

    attendanceServiceSpy = jasmine.createSpyObj('AttendanceService', ['getAttendance']);
    attendanceServiceSpy.getAttendance.and.callFake(() => of(serviceRecords));

    const employeeServiceSpy = jasmine.createSpyObj('EmployeeService', ['getAll']);
    employeeServiceSpy.getAll.and.returnValue(
      of([
        { id: 'employee-1', first_name: 'Ana', last_name: 'López', department_id: 'department-1' },
        {
          id: 'employee-2',
          first_name: 'Bruno',
          last_name: 'García',
          department_id: 'department-1',
        },
        {
          id: 'employee-3',
          first_name: 'Carlos',
          last_name: 'Díaz',
          department_id: 'department-2',
        },
      ]),
    );

    const departmentServiceSpy = jasmine.createSpyObj('DepartmentService', ['getDepartments']);
    departmentServiceSpy.getDepartments.and.returnValue(
      of([
        { id: 'department-1', name: 'Operaciones' },
        { id: 'department-2', name: 'Administración' },
      ]),
    );

    const notificationServiceSpy = jasmine.createSpyObj('NotificationService', [
      'getAll',
      'markRead',
      'markAllRead',
    ]);
    notificationServiceSpy.getAll.and.returnValue(of([]));
    notificationServiceSpy.markRead.and.returnValue(of({}));
    notificationServiceSpy.markAllRead.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      imports: [AttendanceComponent],
      providers: [
        provideRouter([]),
        { provide: AttendanceService, useValue: attendanceServiceSpy },
        { provide: EmployeeService, useValue: employeeServiceSpy },
        { provide: DepartmentService, useValue: departmentServiceSpy },
        { provide: NotificationService, useValue: notificationServiceSpy },
        {
          provide: WebSocketNotificationService,
          useValue: { notifications$: new Subject() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AttendanceComponent);
    component = fixture.componentInstance;
  });

  it('renders date-only record dates without timezone shifting', () => {
    serviceRecords = [attendanceRecord({ record_date: '2026-07-21' })];

    fixture.detectChanges();

    const firstRow = fixture.nativeElement.querySelector('tbody tr') as HTMLTableRowElement;

    expect(firstRow.textContent).toContain('21/07/2026');
    expect(firstRow.textContent).not.toContain('20/07/2026');
  });

  it('sorts report records chronologically by date, employee, check-in time, and id without mutating the service response', () => {
    serviceRecords = [
      attendanceRecord({
        id: 'z-later-date',
        employee_id: 'employee-3',
        employee_name: 'Carlos Díaz',
        record_date: '2026-07-22',
        check_in: '2026-07-22T14:00:00Z',
      }),
      attendanceRecord({
        id: 'b-same-time',
        employee_id: 'employee-1',
        employee_name: 'Ana López',
        record_date: '2026-07-21',
        check_in: '2026-07-21T14:00:00Z',
      }),
      attendanceRecord({
        id: 'a-same-time',
        employee_id: 'employee-1',
        employee_name: 'Ana López',
        record_date: '2026-07-21',
        check_in: '2026-07-21T14:00:00Z',
      }),
      attendanceRecord({
        id: 'bruno-earlier-time',
        employee_id: 'employee-2',
        employee_name: 'Bruno García',
        record_date: '2026-07-21',
        check_in: '2026-07-21T13:00:00Z',
      }),
      attendanceRecord({
        id: 'ana-earlier-time',
        employee_id: 'employee-1',
        employee_name: 'Ana López',
        record_date: '2026-07-21',
        check_in: '2026-07-21T12:00:00Z',
      }),
    ];
    const originalServiceOrder = serviceRecords.map((record) => record.id);

    fixture.detectChanges();

    expect(component.filteredAttendance().map((record) => record.id)).toEqual([
      'ana-earlier-time',
      'a-same-time',
      'b-same-time',
      'bruno-earlier-time',
      'z-later-date',
    ]);
    expect(serviceRecords.map((record) => record.id)).toEqual(originalServiceOrder);
  });

  it('exports CSV rows with the same sorted order and date-only formatting', async () => {
    serviceRecords = [
      attendanceRecord({
        id: 'later-date',
        employee_id: 'employee-2',
        employee_name: 'Bruno García',
        record_date: '2026-07-22',
        check_in: '2026-07-22T14:00:00Z',
      }),
      attendanceRecord({
        id: 'earlier-date',
        employee_id: 'employee-1',
        employee_name: 'Ana López',
        record_date: '2026-07-21',
        check_in: '2026-07-21T14:00:00Z',
      }),
    ];
    let capturedBlob: Blob | undefined;
    spyOn(URL, 'createObjectURL').and.callFake((blob: Blob | MediaSource) => {
      capturedBlob = blob as Blob;
      return 'blob:attendance-report';
    });
    spyOn(URL, 'revokeObjectURL').and.stub();
    spyOn(HTMLAnchorElement.prototype, 'click').and.stub();

    fixture.detectChanges();
    component.exportToCSV();

    const csv = await capturedBlob!.text();
    const rows = csv.split('\n').slice(1);

    expect(rows[0]).toContain('"Ana López","21/07/2026"');
    expect(rows[1]).toContain('"Bruno García","22/07/2026"');
  });
});
