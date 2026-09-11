import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserScopeService, UserScopeAssignmentCreate } from '../../../../core/services/user-scope.service';
import { UserManagementService } from '../../../../core/services/user-management.service';
import { DepartmentService } from '../../../../core/services/department.service';
import { LocationService } from '../../../../core/services/location.service';
import { User, UserScopeAssignment } from '../../../../core/models/user.model';

// design.md D4/task 3.8: `user_scope_assignments` binds COORDINADOR/DIRECTOR
// to a facultad (department) and/or sede (location), and SECRETARIA to one
// or more DIRECTOR users. Backend enforces exactly one target per row (D4's
// CHECK constraint), so a user needing both a facultad and a sede gets two
// rows here, not one combined row.
const ASSIGNABLE_SCOPE_ROLES: readonly string[] = ['COORDINADOR', 'DIRECTOR', 'SECRETARIA'];

interface ScopeFormData {
  userId: string;
  targetType: 'department' | 'location';
  departmentId: string;
  locationId: string;
  directorUserId: string;
}

function emptyFormData(): ScopeFormData {
  return { userId: '', targetType: 'department', departmentId: '', locationId: '', directorUserId: '' };
}

@Component({
  selector: 'app-user-scopes',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page">
      <header class="header">
        <div>
          <a routerLink="/admin/dashboard" class="back-link">← Dashboard</a>
          <h1>Asignación de Alcance (Scope)</h1>
        </div>
      </header>

      <div class="table-container">
        @if (loading()) {
          <div class="loading">Cargando...</div>
        } @else if (assignments().length === 0) {
          <div class="empty">No hay asignaciones de alcance registradas.</div>
        } @else {
          <table>
            <thead>
              <tr><th>Usuario</th><th>Rol</th><th>Alcance</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              @for (a of assignments(); track a.id) {
                <tr>
                  <td>{{ userLabel(a.user_id) }}</td>
                  <td>{{ userRole(a.user_id) }}</td>
                  <td>{{ scopeLabel(a) }}</td>
                  <td><button class="btn btn-sm btn-danger" (click)="deleteAssignment(a)">🗑️ Eliminar</button></td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

      <div class="form-container">
        <h2>Nueva Asignación</h2>
        <form (ngSubmit)="save()">
          <div class="form-group">
            <label>Usuario *</label>
            <select [(ngModel)]="formData.userId" name="userId" required (ngModelChange)="onUserChange()">
              <option value="" disabled>Seleccione un usuario</option>
              @for (u of assignableUsers(); track u.id) {
                <option [value]="u.id">{{ u.full_name || u.email }} ({{ u.role }})</option>
              }
            </select>
          </div>

          @if (selectedUserRole() === 'COORDINADOR' || selectedUserRole() === 'DIRECTOR') {
            <div class="form-group">
              <label>Tipo de alcance *</label>
              <select [(ngModel)]="formData.targetType" name="targetType" required>
                <option value="department">Facultad (Departamento)</option>
                <option value="location">Sede (Ubicación)</option>
              </select>
            </div>
            @if (formData.targetType === 'department') {
              <div class="form-group">
                <label>Facultad *</label>
                <select [(ngModel)]="formData.departmentId" name="departmentId" required>
                  <option value="" disabled>Seleccione una facultad</option>
                  @for (d of departments(); track d.id) {
                    <option [value]="d.id">{{ d.name }}</option>
                  }
                </select>
              </div>
            } @else {
              <div class="form-group">
                <label>Sede *</label>
                <select [(ngModel)]="formData.locationId" name="locationId" required>
                  <option value="" disabled>Seleccione una sede</option>
                  @for (l of locations(); track l.id) {
                    <option [value]="l.id">{{ l.name }}</option>
                  }
                </select>
              </div>
            }
          } @else if (selectedUserRole() === 'SECRETARIA') {
            <div class="form-group">
              <label>Director asignado *</label>
              <select [(ngModel)]="formData.directorUserId" name="directorUserId" required>
                <option value="" disabled>Seleccione un director</option>
                @for (d of directorUsers(); track d.id) {
                  <option [value]="d.id">{{ d.full_name || d.email }}</option>
                }
              </select>
            </div>
          }

          @if (errorMsg()) {
            <div class="error-msg">{{ errorMsg() }}</div>
          }

          <button type="submit" class="btn btn-primary" [disabled]="saving() || !formData.userId">
            {{ saving() ? 'Guardando...' : 'Crear Asignación' }}
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .page { min-height: 100dvh; background: #f3f4f6; padding: 2rem; }
    .header { margin-bottom: 2rem; }
    .back-link { color: #6b7280; text-decoration: none; font-size: 0.875rem; display: block; margin-bottom: 0.25rem; }
    h1 { font-size: 1.8rem; color: #1f2937; margin: 0; }
    h2 { font-size: 1.1rem; color: #1f2937; margin: 0 0 1rem; }
    .table-container, .form-container { background: white; border-radius: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 1.25rem; margin-bottom: 1.5rem; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 0.75rem; text-align: left; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: #6b7280; }
    td { padding: 0.875rem 0.75rem; border-top: 1px solid #f3f4f6; color: #374151; font-size: 0.9rem; }
    .loading, .empty { padding: 2rem; text-align: center; color: #9ca3af; }
    .form-group { margin-bottom: 1.25rem; max-width: 420px; }
    .form-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; color: #374151; font-size: 0.9rem; }
    .form-group select { width: 100%; padding: 0.625rem; border: 2px solid #e5e7eb; border-radius: 0.5rem; font-size: 0.9rem; box-sizing: border-box; }
    .btn { padding: 0.625rem 1.25rem; border-radius: 0.5rem; font-weight: 500; cursor: pointer; border: none; font-size: 0.9rem; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.8rem; }
    .btn-danger { background: #fee2e2; color: #991b1b; }
    .error-msg { background: #fee2e2; color: #991b1b; padding: 0.75rem; border-radius: 0.5rem; font-size: 0.875rem; margin-bottom: 1rem; max-width: 420px; }
  `],
})
export class UserScopesComponent implements OnInit {
  private readonly userScopeService = inject(UserScopeService);
  private readonly userManagementService = inject(UserManagementService);
  private readonly departmentService = inject(DepartmentService);
  private readonly locationService = inject(LocationService);

  readonly assignments = signal<UserScopeAssignment[]>([]);
  readonly users = signal<User[]>([]);
  readonly departments = signal<{ id: string; name: string }[]>([]);
  readonly locations = signal<{ id: string; name: string }[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMsg = signal<string | null>(null);

  readonly assignableUsers = computed(() =>
    this.users().filter((u) => ASSIGNABLE_SCOPE_ROLES.includes(u.role))
  );
  readonly directorUsers = computed(() => this.users().filter((u) => u.role === 'DIRECTOR'));

  formData: ScopeFormData = emptyFormData();

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.loading.set(true);
    this.userScopeService.getAll().subscribe({
      next: (data) => { this.assignments.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.userManagementService.getUsers().subscribe((data) => this.users.set(data));
    this.departmentService.getDepartments(false).subscribe((data) => this.departments.set(data));
    this.locationService.getLocations(false).subscribe((data) => this.locations.set(data));
  }

  selectedUserRole(): string | null {
    return this.users().find((u) => u.id === this.formData.userId)?.role ?? null;
  }

  onUserChange(): void {
    this.formData.departmentId = '';
    this.formData.locationId = '';
    this.formData.directorUserId = '';
  }

  userLabel(userId: string): string {
    const user = this.users().find((u) => u.id === userId);
    return user ? user.full_name || user.email : userId;
  }

  userRole(userId: string): string {
    return this.users().find((u) => u.id === userId)?.role ?? '—';
  }

  scopeLabel(a: UserScopeAssignment): string {
    if (a.department_id) {
      const dept = this.departments().find((d) => d.id === a.department_id);
      return `Facultad: ${dept?.name ?? a.department_id}`;
    }
    if (a.location_id) {
      const loc = this.locations().find((l) => l.id === a.location_id);
      return `Sede: ${loc?.name ?? a.location_id}`;
    }
    if (a.director_user_id) {
      return `Director: ${this.userLabel(a.director_user_id)}`;
    }
    return '—';
  }

  save(): void {
    if (!this.formData.userId) return;
    const role = this.selectedUserRole();
    const payload: UserScopeAssignmentCreate = { user_id: this.formData.userId };

    if (role === 'SECRETARIA') {
      if (!this.formData.directorUserId) return;
      payload.director_user_id = this.formData.directorUserId;
    } else if (role === 'COORDINADOR' || role === 'DIRECTOR') {
      if (this.formData.targetType === 'department') {
        if (!this.formData.departmentId) return;
        payload.department_id = this.formData.departmentId;
      } else {
        if (!this.formData.locationId) return;
        payload.location_id = this.formData.locationId;
      }
    } else {
      return;
    }

    this.saving.set(true);
    this.errorMsg.set(null);
    this.userScopeService.create(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.formData = emptyFormData();
        this.loadAll();
      },
      error: (err) => {
        const detail = err.error?.detail;
        this.errorMsg.set(
          Array.isArray(detail) ? detail.map((e: any) => e.msg).join(', ') : detail || 'Error al guardar'
        );
        this.saving.set(false);
      },
    });
  }

  deleteAssignment(a: UserScopeAssignment): void {
    if (!confirm('¿Eliminar esta asignación de alcance?')) return;
    this.userScopeService.delete(a.id).subscribe({
      next: () => this.loadAll(),
      error: (err) => alert(err.error?.detail || 'Error al eliminar'),
    });
  }
}
