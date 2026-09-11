import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { UsersComponent } from './users.component';
import { AuthService } from '../../../../core/services/auth.service';
import { UserManagementService } from '../../../../core/services/user-management.service';
import { RoleService } from '../../../../core/services/role.service';
import { EmployeeService } from '../../../../core/services/employee.service';
import { User } from '../../../../core/models/user.model';

/**
 * Security-critical follow-up to the backend `/auth/register` fix: that
 * endpoint (and `PATCH`/`DELETE /users/{id}`, `POST
 * /users/{id}/change-password`) now requires the `users.manage` permission
 * instead of the coarse `get_current_active_admin` gate, which used to admit
 * DECANO/DUEÑO. Task 4.7 separately added DECANO/DUEÑO to `auth.guard.ts`'s
 * `ADMIN_ROLES`, which as a side effect lets them reach `/admin/users` (the
 * "Usuarios" nav card is itself gated on `users.view`, a permission neither
 * role holds today -- but this component had zero gating of its own, so a
 * direct URL visit would still render a live create/edit/delete UI that
 * always 403s on submit). This spec proves the create/edit/password/delete
 * actions are hidden entirely without `users.manage`, mirroring the backend
 * gate exactly (same permission code, verified against `users.py`/
 * `auth.py`, not invented). "Roles RBAC" is deliberately NOT gated on
 * `users.manage` -- `roles.py`'s role-assignment endpoints use
 * `get_current_technical_rbac_admin` (a DEV/bootstrap-admin-only
 * dependency), an unrelated permission domain with no corresponding
 * permission code (same documented gap as task 4.7's "Roles" nav card).
 */
describe('UsersComponent', () => {
  let fixture: ComponentFixture<UsersComponent>;
  let component: UsersComponent;

  const users: User[] = [
    {
      id: 'u1',
      email: 'teacher@miumg.edu.gt',
      full_name: 'Teacher One',
      role: 'CATEDRATICO',
      is_active: true,
      must_change_password: false,
      employee_id: null,
    } as User,
  ];

  function setup(hasManagePermission: boolean): void {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['hasPermission'], {
      user: signal({ id: 'actor-1', email: 'actor@miumg.edu.gt' } as User),
    });
    authServiceSpy.hasPermission.and.callFake((code: string) => hasManagePermission && code === 'users.manage');

    const userServiceSpy = jasmine.createSpyObj('UserManagementService', [
      'getUsers', 'createUser', 'updateUser', 'deleteUser', 'changePassword',
    ]);
    userServiceSpy.getUsers.and.returnValue(of(users));

    const roleServiceSpy = jasmine.createSpyObj('RoleService', ['getRoles', 'getUserRoles', 'assignUserRoles']);
    roleServiceSpy.getRoles.and.returnValue(of([]));
    roleServiceSpy.getUserRoles.and.returnValue(of([]));

    const employeeServiceSpy = jasmine.createSpyObj('EmployeeService', ['getAll']);
    employeeServiceSpy.getAll.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: AuthService, useValue: authServiceSpy },
        { provide: UserManagementService, useValue: userServiceSpy },
        { provide: RoleService, useValue: roleServiceSpy },
        { provide: EmployeeService, useValue: employeeServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UsersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('canManageUsers() is false when the actor lacks users.manage', () => {
    setup(false);
    expect(component.canManageUsers()).toBe(false);
  });

  it('canManageUsers() is true when the actor holds users.manage', () => {
    setup(true);
    expect(component.canManageUsers()).toBe(true);
  });

  it('hides the "+ Nuevo Usuario" button when the actor lacks users.manage', () => {
    setup(false);
    expect(fixture.nativeElement.querySelector('.header-right .btn-primary')).toBeFalsy();
  });

  it('shows the "+ Nuevo Usuario" button when the actor holds users.manage', () => {
    setup(true);
    expect(fixture.nativeElement.querySelector('.header-right .btn-primary')).toBeTruthy();
  });

  it('hides Editar/Contraseña/Eliminar row actions when the actor lacks users.manage', () => {
    setup(false);
    const actions = fixture.nativeElement.querySelector('.actions');
    expect(actions.querySelector('.btn-edit')).toBeFalsy();
    expect(actions.querySelector('.btn-perms')).toBeFalsy();
    expect(actions.querySelector('.btn-danger')).toBeFalsy();
  });

  it('shows Editar/Contraseña/Eliminar row actions when the actor holds users.manage', () => {
    setup(true);
    const actions = fixture.nativeElement.querySelector('.actions');
    expect(actions.querySelector('.btn-edit')).toBeTruthy();
    expect(actions.querySelector('.btn-perms')).toBeTruthy();
    expect(actions.querySelector('.btn-danger')).toBeTruthy();
  });

  it('keeps the "Roles RBAC" row action visible regardless of users.manage (unrelated permission domain)', () => {
    setup(false);
    const actions = fixture.nativeElement.querySelector('.actions');
    expect(actions.querySelector('.btn-rbac')).toBeTruthy();
  });
});
