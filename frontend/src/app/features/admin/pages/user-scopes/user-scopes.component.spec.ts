import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { UserScopesComponent } from './user-scopes.component';
import type { User } from '../../../../core/models/user.model';
import type { Department } from '../../../../core/models/department.model';
import type { Location } from '../../../../core/models/location.model';
import type { UserScopeAssignment } from '../../../../core/models/user.model';
import { UserScopeService } from '../../../../core/services/user-scope.service';
import { UserManagementService } from '../../../../core/services/user-management.service';
import { DepartmentService } from '../../../../core/services/department.service';
import { LocationService } from '../../../../core/services/location.service';

// task 4.6: admin surface for design.md D4's `user_scope_assignments`
// (COORDINADOR/DIRECTOR -> facultad/sede, SECRETARIA -> DIRECTOR), gated on
// `user_scopes.manage` (task 3.8's real backend endpoint).
function buildUser(overrides: Partial<User>): User {
  return {
    id: 'user-1',
    email: 'user@example.com',
    full_name: 'Test User',
    role: 'COORDINADOR',
    is_active: true,
    must_change_password: false,
    employee_id: null,
    created_at: '2026-07-20T00:00:00Z',
    updated_at: '2026-07-20T00:00:00Z',
    ...overrides,
  };
}

const departments: Department[] = [
  { id: 'dept-1', name: 'Ingeniería', description: null, is_active: true, created_at: '2026-01-01T00:00:00Z' },
];

const locations: Location[] = [
  { id: 'loc-1', name: 'Sede Central', address: null, latitude: 0, longitude: 0, radius_meters: 100, is_active: true, created_at: '2026-01-01T00:00:00Z' },
];

const users: User[] = [
  buildUser({ id: 'coord-1', full_name: 'Coordinador Uno', role: 'COORDINADOR' }),
  buildUser({ id: 'dir-1', full_name: 'Director Uno', role: 'DIRECTOR' }),
  buildUser({ id: 'sec-1', full_name: 'Secretaria Uno', role: 'SECRETARIA' }),
  buildUser({ id: 'cat-1', full_name: 'Catedrático Uno', role: 'CATEDRATICO' }),
];

describe('UserScopesComponent', () => {
  let fixture: ComponentFixture<UserScopesComponent>;
  let component: UserScopesComponent;
  let userScopeServiceSpy: jasmine.SpyObj<UserScopeService>;

  function setup(assignments: UserScopeAssignment[]): void {
    userScopeServiceSpy = jasmine.createSpyObj('UserScopeService', ['getAll', 'create', 'delete']);
    userScopeServiceSpy.getAll.and.returnValue(of(assignments));
    userScopeServiceSpy.create.and.returnValue(
      of({ id: 'new-1', user_id: 'coord-1', department_id: 'dept-1', location_id: null, director_user_id: null, created_at: '2026-08-01T00:00:00Z' })
    );
    userScopeServiceSpy.delete.and.returnValue(of(void 0));

    const userManagementServiceSpy = jasmine.createSpyObj('UserManagementService', ['getUsers']);
    userManagementServiceSpy.getUsers.and.returnValue(of(users));

    const departmentServiceSpy = jasmine.createSpyObj('DepartmentService', ['getDepartments']);
    departmentServiceSpy.getDepartments.and.returnValue(of(departments));

    const locationServiceSpy = jasmine.createSpyObj('LocationService', ['getLocations']);
    locationServiceSpy.getLocations.and.returnValue(of(locations));

    TestBed.configureTestingModule({
      imports: [UserScopesComponent],
      providers: [
        provideRouter([]),
        { provide: UserScopeService, useValue: userScopeServiceSpy },
        { provide: UserManagementService, useValue: userManagementServiceSpy },
        { provide: DepartmentService, useValue: departmentServiceSpy },
        { provide: LocationService, useValue: locationServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserScopesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('renders existing scope assignments with resolved user and target labels', () => {
    setup([
      { id: 'a-1', user_id: 'coord-1', department_id: 'dept-1', location_id: null, director_user_id: null, created_at: '2026-07-01T00:00:00Z' },
    ]);
    const row = fixture.nativeElement.querySelector('tbody tr');
    expect(row.textContent).toContain('Coordinador Uno');
    expect(row.textContent).toContain('Ingeniería');
  });

  it('restricts the assignable-user select to COORDINADOR/DIRECTOR/SECRETARIA roles', () => {
    setup([]);
    expect(component.assignableUsers().map((u) => u.id).sort()).toEqual(['coord-1', 'dir-1', 'sec-1']);
  });

  it('shows department/location target selectors when the selected user is COORDINADOR', () => {
    setup([]);
    component.formData.userId = 'coord-1';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('select[name="targetType"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('select[name="directorUserId"]')).toBeFalsy();
  });

  it('shows the director selector, restricted to DIRECTOR users, when the selected user is SECRETARIA', () => {
    setup([]);
    component.formData.userId = 'sec-1';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('select[name="directorUserId"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('select[name="targetType"]')).toBeFalsy();
    expect(component.directorUsers().map((u) => u.id)).toEqual(['dir-1']);
  });

  it('creates a department-scoped assignment for a COORDINADOR with the right payload', () => {
    setup([]);
    component.formData.userId = 'coord-1';
    component.formData.targetType = 'department';
    component.formData.departmentId = 'dept-1';
    component.save();
    expect(userScopeServiceSpy.create).toHaveBeenCalledWith({
      user_id: 'coord-1',
      department_id: 'dept-1',
    });
  });

  it('creates a director-scoped assignment for a SECRETARIA with the right payload', () => {
    setup([]);
    component.formData.userId = 'sec-1';
    component.formData.directorUserId = 'dir-1';
    component.save();
    expect(userScopeServiceSpy.create).toHaveBeenCalledWith({
      user_id: 'sec-1',
      director_user_id: 'dir-1',
    });
  });

  it('deletes an assignment after confirmation', () => {
    setup([
      { id: 'a-1', user_id: 'coord-1', department_id: 'dept-1', location_id: null, director_user_id: null, created_at: '2026-07-01T00:00:00Z' },
    ]);
    spyOn(window, 'confirm').and.returnValue(true);
    component.deleteAssignment({ id: 'a-1', user_id: 'coord-1', department_id: 'dept-1', location_id: null, director_user_id: null, created_at: '2026-07-01T00:00:00Z' });
    expect(userScopeServiceSpy.delete).toHaveBeenCalledWith('a-1');
  });
});
