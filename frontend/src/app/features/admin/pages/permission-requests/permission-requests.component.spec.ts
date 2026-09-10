import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';

import { AdminPermissionRequestsComponent } from './permission-requests.component';
import type { PermissionRequest } from '../../../../core/models/permission-request.model';
import { PermissionRequestService } from '../../../../core/services/permission-request.service';
import { EmployeeService } from '../../../../core/services/employee.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { WebSocketNotificationService } from '../../../../core/services/websocket-notification.service';

// Regression coverage for the confirmed bug (task 4.4): stage-2
// approve/reject was previously gated on `role === 'DIRECTOR'` instead of
// the real backend gate — an actor holding
// `permission_requests.approve.stage2` (assigned SECRETARIA). Every test
// below asserts against `AuthService.hasPermission()`, mirroring exactly
// what `permission_requests.py`'s `approve_permission_request`/
// `reject_permission_request` check server-side.
const baseRequest: PermissionRequest = {
  id: 'req-1',
  requested_by_user_id: 'user-1',
  employee_id: 'employee-1',
  exception_type: 'personal',
  start_date: '2026-08-01',
  end_date: '2026-08-01',
  start_time: null,
  end_time: null,
  hours_affected: null,
  description: null,
  status: 'pending',
  coordinator_reviewed_by: null,
  coordinator_reviewed_at: null,
  coordinator_notes: null,
  director_reviewed_by: null,
  director_reviewed_at: null,
  director_notes: null,
  rejection_stage: null,
  rejection_reason: null,
  schedule_exception_id: null,
  created_at: '2026-07-20T00:00:00Z',
};

function buildRequest(overrides: Partial<PermissionRequest>): PermissionRequest {
  return { ...baseRequest, ...overrides };
}

describe('AdminPermissionRequestsComponent', () => {
  let fixture: ComponentFixture<AdminPermissionRequestsComponent>;
  let component: AdminPermissionRequestsComponent;
  let requestServiceSpy: jasmine.SpyObj<PermissionRequestService>;

  function setup(requests: PermissionRequest[], grantedPermissions: string[]): void {
    requestServiceSpy = jasmine.createSpyObj('PermissionRequestService', [
      'getAll',
      'approve',
      'reject',
    ]);
    requestServiceSpy.getAll.and.returnValue(of(requests));
    requestServiceSpy.approve.and.returnValue(of(requests[0]));
    requestServiceSpy.reject.and.returnValue(of(requests[0]));

    const employeeServiceSpy = jasmine.createSpyObj('EmployeeService', ['getAll']);
    employeeServiceSpy.getAll.and.returnValue(of([]));

    const authServiceSpy = jasmine.createSpyObj('AuthService', ['hasPermission'], {
      user: signal(null),
    });
    authServiceSpy.hasPermission.and.callFake((code: string) => grantedPermissions.includes(code));

    const notificationServiceSpy = jasmine.createSpyObj('NotificationService', [
      'getAll',
      'markRead',
      'markAllRead',
    ]);
    notificationServiceSpy.getAll.and.returnValue(of([]));
    notificationServiceSpy.markRead.and.returnValue(of({}));
    notificationServiceSpy.markAllRead.and.returnValue(of(void 0));

    TestBed.configureTestingModule({
      imports: [AdminPermissionRequestsComponent],
      providers: [
        provideRouter([]),
        { provide: PermissionRequestService, useValue: requestServiceSpy },
        { provide: EmployeeService, useValue: employeeServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: NotificationService, useValue: notificationServiceSpy },
        { provide: WebSocketNotificationService, useValue: { notifications$: new Subject() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminPermissionRequestsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('shows stage-1 approve/reject actions to an actor holding permission_requests.approve.stage1 on a pending request', () => {
    setup([buildRequest({ status: 'pending' })], ['permission_requests.approve.stage1']);
    const card = fixture.nativeElement.querySelector('.request-card');
    expect(card.querySelector('.card-actions .btn-approve')).toBeTruthy();
    expect(card.querySelector('.card-actions .btn-reject')).toBeTruthy();
  });

  it('hides stage-1 actions from an actor without the stage1 permission', () => {
    setup([buildRequest({ status: 'pending' })], []);
    const card = fixture.nativeElement.querySelector('.request-card');
    expect(card.querySelector('.card-actions .btn-approve')).toBeFalsy();
    expect(card.querySelector('.card-actions .btn-reject')).toBeFalsy();
  });

  it('shows stage-2 approve/reject actions to an actor holding permission_requests.approve.stage2 on a coordinator_approved request', () => {
    setup(
      [buildRequest({ status: 'coordinator_approved' })],
      ['permission_requests.approve.stage2']
    );
    const card = fixture.nativeElement.querySelector('.request-card');
    expect(card.querySelector('.card-actions .btn-approve')).toBeTruthy();
    expect(card.querySelector('.card-actions .btn-reject')).toBeTruthy();
  });

  it('hides stage-2 actions from DIRECTOR (read-only, holds neither stage permission)', () => {
    setup([buildRequest({ status: 'coordinator_approved' })], []);
    const card = fixture.nativeElement.querySelector('.request-card');
    expect(card.querySelector('.card-actions .btn-approve')).toBeFalsy();
    expect(card.querySelector('.card-actions .btn-reject')).toBeFalsy();
  });

  it('does not grant stage-2 access to an actor who only holds stage-1 permission', () => {
    setup(
      [buildRequest({ status: 'coordinator_approved' })],
      ['permission_requests.approve.stage1']
    );
    const card = fixture.nativeElement.querySelector('.request-card');
    expect(card.querySelector('.card-actions .btn-approve')).toBeFalsy();
  });

  it('shows no approve/reject actions for an already-terminal (approved) request', () => {
    setup(
      [buildRequest({ status: 'approved' })],
      ['permission_requests.approve.stage1', 'permission_requests.approve.stage2']
    );
    const card = fixture.nativeElement.querySelector('.request-card');
    expect(card.querySelector('.card-actions .btn-approve')).toBeFalsy();
    expect(card.querySelector('.card-actions .btn-reject')).toBeFalsy();
  });

  it('disables the stage-2 approve submit button until justification is non-empty', () => {
    setup(
      [buildRequest({ status: 'coordinator_approved' })],
      ['permission_requests.approve.stage2']
    );
    const card = fixture.nativeElement.querySelector('.request-card');
    (card.querySelector('.card-actions .btn-approve') as HTMLButtonElement).click();
    fixture.detectChanges();
    const submit = fixture.nativeElement.querySelector('.modal .btn-approve') as HTMLButtonElement;
    expect(submit.disabled).toBeTrue();

    component.approveNotes = 'Justificación válida';
    fixture.detectChanges();
    expect(submit.disabled).toBeFalse();
  });

  it('does not require justification to enable the stage-1 approve submit button', () => {
    setup([buildRequest({ status: 'pending' })], ['permission_requests.approve.stage1']);
    const card = fixture.nativeElement.querySelector('.request-card');
    (card.querySelector('.card-actions .btn-approve') as HTMLButtonElement).click();
    fixture.detectChanges();
    const submit = fixture.nativeElement.querySelector('.modal .btn-approve') as HTMLButtonElement;
    expect(submit.disabled).toBeFalse();
  });

  it('disables the reject submit button until a reason is entered', () => {
    setup([buildRequest({ status: 'pending' })], ['permission_requests.approve.stage1']);
    const card = fixture.nativeElement.querySelector('.request-card');
    (card.querySelector('.card-actions .btn-reject') as HTMLButtonElement).click();
    fixture.detectChanges();
    const submit = fixture.nativeElement.querySelector('.modal .btn-reject') as HTMLButtonElement;
    expect(submit.disabled).toBeTrue();

    component.rejectReason = 'Motivo';
    fixture.detectChanges();
    expect(submit.disabled).toBeFalse();
  });

  it('calls the real stage-2 approve endpoint with the entered justification', () => {
    setup(
      [buildRequest({ id: 'req-2', status: 'coordinator_approved' })],
      ['permission_requests.approve.stage2']
    );
    const card = fixture.nativeElement.querySelector('.request-card');
    (card.querySelector('.card-actions .btn-approve') as HTMLButtonElement).click();
    fixture.detectChanges();
    component.approveNotes = 'Justificación válida';
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.modal .btn-approve') as HTMLButtonElement).click();
    expect(requestServiceSpy.approve).toHaveBeenCalledWith('req-2', 'Justificación válida');
  });
});
