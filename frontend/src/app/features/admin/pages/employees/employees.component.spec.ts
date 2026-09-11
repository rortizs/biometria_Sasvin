import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { EmployeesComponent } from './employees.component';
import { AuthService } from '../../../../core/services/auth.service';
import { EmployeeService } from '../../../../core/services/employee.service';
import { PositionService } from '../../../../core/services/position.service';
import { DepartmentService } from '../../../../core/services/department.service';
import { LocationService } from '../../../../core/services/location.service';
import { CameraService } from '../../../../core/services/camera.service';
import { LivenessService } from '../../../../core/services/liveness.service';
import { Position } from '../../../../core/models/position.model';

/**
 * Task 4.7: `employees.component.ts`'s create/edit restriction. Backend
 * source of truth: `employees.py`'s `_require_teacher_target_position()`
 * (task 3.9) unconditionally rejects any create/update whose target
 * `position_id` doesn't map to `canonical_role === 'CATEDRATICO'` -- there
 * is no separate "manage all positions" permission, so every real actor
 * that can open this form (in practice: `SECRETARIA`, who holds
 * `employees.manage.catedratico`) is bound by the same restriction. This
 * spec proves (1) the create/edit actions are hidden entirely when the
 * actor lacks `employees.manage.catedratico`, and (2) the position
 * dropdown only ever offers catedrático positions once the form is
 * reachable.
 */
describe('EmployeesComponent', () => {
  let fixture: ComponentFixture<EmployeesComponent>;
  let component: EmployeesComponent;

  const positions: Position[] = [
    { id: 'p1', name: 'Catedrático de Cálculo I', description: null, is_active: true, created_at: '2026-01-01', canonical_role: 'CATEDRATICO' },
    { id: 'p2', name: 'Coordinador Académico', description: null, is_active: true, created_at: '2026-01-01', canonical_role: 'COORDINADOR' },
    { id: 'p3', name: 'Conserje', description: null, is_active: true, created_at: '2026-01-01', canonical_role: null },
  ];

  function setup(hasManagePermission: boolean): void {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['hasPermission']);
    authServiceSpy.hasPermission.and.callFake((code: string) => hasManagePermission && code === 'employees.manage.catedratico');

    const employeeServiceSpy = jasmine.createSpyObj('EmployeeService', ['getAll']);
    employeeServiceSpy.getAll.and.returnValue(of([]));

    const positionServiceSpy = jasmine.createSpyObj('PositionService', ['getPositions']);
    positionServiceSpy.getPositions.and.returnValue(of(positions));

    const departmentServiceSpy = jasmine.createSpyObj('DepartmentService', ['getDepartments']);
    departmentServiceSpy.getDepartments.and.returnValue(of([]));

    const locationServiceSpy = jasmine.createSpyObj('LocationService', ['getLocations']);
    locationServiceSpy.getLocations.and.returnValue(of([]));

    const cameraServiceSpy = jasmine.createSpyObj('CameraService', ['start', 'stop', 'captureFrame']);
    const livenessServiceSpy = jasmine.createSpyObj('LivenessService', ['analyzeLiveness']);

    TestBed.configureTestingModule({
      imports: [EmployeesComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: AuthService, useValue: authServiceSpy },
        { provide: EmployeeService, useValue: employeeServiceSpy },
        { provide: PositionService, useValue: positionServiceSpy },
        { provide: DepartmentService, useValue: departmentServiceSpy },
        { provide: LocationService, useValue: locationServiceSpy },
        { provide: CameraService, useValue: cameraServiceSpy },
        { provide: LivenessService, useValue: livenessServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EmployeesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('exposes only catedrático positions to the create/edit form', () => {
    setup(true);

    const roles = component.catedraticoPositions().map((p) => p.canonical_role);
    expect(roles).toEqual(['CATEDRATICO']);
    expect(component.catedraticoPositions().length).toBe(1);
  });

  it('shows the "Nuevo Empleado" button when the actor holds employees.manage.catedratico', () => {
    setup(true);

    expect(fixture.nativeElement.querySelector('.header-right .btn-primary')).toBeTruthy();
  });

  it('hides the "Nuevo Empleado" button when the actor lacks employees.manage.catedratico', () => {
    setup(false);

    expect(fixture.nativeElement.querySelector('.header-right .btn-primary')).toBeFalsy();
  });

  it('canManageEmployees() is false when the actor lacks the grant', () => {
    setup(false);
    expect(component.canManageEmployees()).toBe(false);
  });

  it('canManageEmployees() is true when the actor holds the grant', () => {
    setup(true);
    expect(component.canManageEmployees()).toBe(true);
  });
});
