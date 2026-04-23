import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserManagementService, UserCreatePayload, UserUpdatePayload } from '../../../../core/services/user-management.service';
import { RoleService } from '../../../../core/services/role.service';
import { AuthService } from '../../../../core/services/auth.service';
import { User, UserRole } from '../../../../core/models/user.model';
import { Role, UserRoleAssignmentResponse } from '../../../../core/models/role.model';
import { NotificationBellComponent } from '../../../../core/components/notification-bell/notification-bell.component';

type ModalType = 'create' | 'edit' | 'password' | 'rbac' | null;

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NotificationBellComponent],
  template: `
    <div class="page">
      <header class="header">
        <div>
          <a routerLink="/admin/dashboard" class="back-link">← Dashboard</a>
          <h1>Gestión de Usuarios</h1>
        </div>
        <div class="header-right">
          <app-notification-bell />
          <button class="btn btn-primary" (click)="openCreateModal()">+ Nuevo Usuario</button>
        </div>
      </header>

      <!-- Tabla -->
      <div class="table-container">
        @if (loading()) {
          <div class="loading">Cargando usuarios...</div>
        } @else if (users().length === 0) {
          <div class="empty">No hay usuarios registrados.</div>
        } @else {
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (user of users(); track user.id) {
                <tr>
                  <td>{{ user.email }}</td>
                  <td>{{ user.full_name || '—' }}</td>
                  <td>
                    <span class="role-badge" [style.background]="roleBgColor(user.role)"
                          [style.color]="roleTextColor(user.role)">
                      {{ roleName(user.role) }}
                    </span>
                  </td>
                  <td>
                    <span class="badge" [style.background]="user.is_active ? '#d1fae5' : '#f3f4f6'"
                          [style.color]="user.is_active ? '#065f46' : '#6b7280'">
                      {{ user.is_active ? 'Activo' : 'Inactivo' }}
                    </span>
                  </td>
                  <td>
                    <div class="actions">
                      <button class="btn btn-sm btn-edit" (click)="openEditModal(user)">Editar</button>
                      <button class="btn btn-sm btn-perms" (click)="openPasswordModal(user)">Contraseña</button>
                      <button class="btn btn-sm btn-rbac" (click)="openRbacModal(user)">Roles RBAC</button>
                      @if (user.id !== currentUserId()) {
                        <button class="btn btn-sm btn-danger" (click)="deleteUser(user)">Eliminar</button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

      <!-- Modal crear usuario -->
      @if (activeModal() === 'create') {
        <div class="modal-overlay" (click)="closeModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <h2>Nuevo Usuario</h2>
            <form (ngSubmit)="saveCreate()">
              <div class="form-group">
                <label>Email institucional *</label>
                <input [(ngModel)]="createForm.email" name="email" type="email" required
                  placeholder="usuario@miumg.edu.gt" />
              </div>
              <div class="form-group">
                <label>Contraseña *</label>
                <input [(ngModel)]="createForm.password" name="password" type="password" required
                  minlength="8" placeholder="Mínimo 8 caracteres" />
              </div>
              <div class="form-group">
                <label>Nombre completo</label>
                <input [(ngModel)]="createForm.full_name" name="full_name"
                  placeholder="Ej: Juan López" />
              </div>
              <div class="form-group">
                <label>Rol *</label>
                <select [(ngModel)]="createForm.role" name="role" required>
                  @for (r of roleOptions; track r.value) {
                    <option [value]="r.value">{{ r.label }}</option>
                  }
                </select>
              </div>
              @if (formError()) {
                <div class="error-msg">{{ formError() }}</div>
              }
              <div class="modal-actions">
                <button type="button" class="btn btn-secondary" (click)="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ saving() ? 'Creando...' : 'Crear Usuario' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Modal editar usuario -->
      @if (activeModal() === 'edit') {
        <div class="modal-overlay" (click)="closeModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <h2>Editar Usuario</h2>
            <form (ngSubmit)="saveEdit()">
              <div class="form-group">
                <label>Email institucional</label>
                <input [(ngModel)]="editForm.email" name="email" type="email"
                  placeholder="usuario@miumg.edu.gt" />
              </div>
              <div class="form-group">
                <label>Nombre completo</label>
                <input [(ngModel)]="editForm.full_name" name="full_name"
                  placeholder="Ej: Juan López" />
              </div>
              <div class="form-group">
                <label>Rol</label>
                <select [(ngModel)]="editForm.role" name="role">
                  @for (r of roleOptions; track r.value) {
                    <option [value]="r.value">{{ r.label }}</option>
                  }
                </select>
              </div>
              <div class="form-group">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="editForm.is_active" name="is_active" />
                  Usuario activo
                </label>
              </div>
              @if (formError()) {
                <div class="error-msg">{{ formError() }}</div>
              }
              <div class="modal-actions">
                <button type="button" class="btn btn-secondary" (click)="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ saving() ? 'Guardando...' : 'Guardar cambios' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Modal cambiar contraseña -->
      @if (activeModal() === 'password') {
        <div class="modal-overlay" (click)="closeModal()">
          <div class="modal modal-sm" (click)="$event.stopPropagation()">
            <h2>Cambiar Contraseña</h2>
            <p class="modal-subtitle">Usuario: <strong>{{ selectedUser()?.email }}</strong></p>
            <form (ngSubmit)="savePassword()">
              <div class="form-group">
                <label>Nueva contraseña *</label>
                <input [(ngModel)]="passwordForm.new_password" name="new_password" type="password"
                  required minlength="8" placeholder="Mínimo 8 caracteres" />
              </div>
              @if (formError()) {
                <div class="error-msg">{{ formError() }}</div>
              }
              <div class="modal-actions">
                <button type="button" class="btn btn-secondary" (click)="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ saving() ? 'Cambiando...' : 'Cambiar contraseña' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Modal asignar roles RBAC -->
      @if (activeModal() === 'rbac') {
        <div class="modal-overlay" (click)="closeModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <h2>Roles RBAC</h2>
            <p class="modal-subtitle">Usuario: <strong>{{ selectedUser()?.email }}</strong></p>

            @if (['secretaria', 'catedratico'].includes(selectedUser()?.role ?? '')) {
              <div class="info-msg">
                Los usuarios con rol <strong>{{ roleName(selectedUser()!.role) }}</strong> solo pueden tener 1 rol RBAC asignado.
              </div>
            }

            @if (loadingRbac()) {
              <div class="loading">Cargando roles...</div>
            } @else {
              <div class="roles-list">
                @for (role of availableRoles(); track role.id) {
                  <label class="role-check-item">
                    <input type="checkbox"
                      [checked]="selectedRoleIds().has(role.id)"
                      (change)="toggleRbacRole(role, $any($event.target).checked)" />
                    <div class="role-check-info">
                      <span class="role-check-name">{{ role.name }}</span>
                      @if (role.description) {
                        <span class="role-check-desc">{{ role.description }}</span>
                      }
                      <span class="perm-count">{{ role.permissions.length }} permisos</span>
                    </div>
                  </label>
                }
                @if (availableRoles().length === 0) {
                  <div class="empty-sm">No hay roles activos disponibles.</div>
                }
              </div>
            }

            @if (formError()) {
              <div class="error-msg">{{ formError() }}</div>
            }
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" (click)="closeModal()">Cancelar</button>
              <button class="btn btn-primary" (click)="saveRbacRoles()" [disabled]="saving()">
                {{ saving() ? 'Guardando...' : 'Guardar roles' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { min-height: 100dvh; background: #f3f4f6; padding: 2rem; }
    .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2rem; gap: 1rem; }
    .header-right { display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; }
    .back-link { color: #6b7280; text-decoration: none; font-size: 0.875rem; display: block; margin-bottom: 0.25rem; }
    h1 { font-size: 1.8rem; color: #1f2937; margin: 0; }

    .table-container { background: white; border-radius: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 700px; }
    thead { background: #f9fafb; }
    th { padding: 0.875rem 1.25rem; text-align: left; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; }
    td { padding: 1rem 1.25rem; border-top: 1px solid #f3f4f6; color: #374151; font-size: 0.9rem; }
    tr:hover td { background: #f9fafb; }
    .loading, .empty { padding: 3rem; text-align: center; color: #9ca3af; }

    .role-badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }

    .btn { padding: 0.625rem 1.25rem; border-radius: 0.5rem; font-weight: 500; cursor: pointer; border: none; font-size: 0.9rem; transition: all 0.2s; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover { background: #2563eb; }
    .btn-secondary { background: #e5e7eb; color: #374151; }
    .btn-secondary:hover { background: #d1d5db; }
    .btn-edit { background: #fef3c7; color: #92400e; }
    .btn-edit:hover { background: #fde68a; }
    .btn-perms { background: #e0f2fe; color: #0369a1; }
    .btn-perms:hover { background: #bae6fd; }
    .btn-rbac { background: #ede9fe; color: #5b21b6; }
    .btn-rbac:hover { background: #ddd6fe; }
    .btn-danger { background: #fee2e2; color: #991b1b; }
    .btn-danger:hover { background: #fecaca; }
    .btn-sm { padding: 0.3rem 0.6rem; font-size: 0.78rem; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }

    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
    .modal { background: white; padding: 2rem; border-radius: 1rem; width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; }
    .modal-sm { max-width: 380px; }
    .modal h2 { margin: 0 0 0.5rem; color: #1f2937; font-size: 1.25rem; }
    .modal-subtitle { color: #6b7280; font-size: 0.875rem; margin: 0 0 1.5rem; }

    .form-group { margin-bottom: 1.25rem; }
    .form-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; color: #374151; font-size: 0.9rem; }
    .form-group input, .form-group select { width: 100%; padding: 0.625rem; border: 2px solid #e5e7eb; border-radius: 0.5rem; font-size: 0.9rem; box-sizing: border-box; font-family: inherit; background: white; }
    .form-group input:focus, .form-group select:focus { outline: none; border-color: #3b82f6; }
    .checkbox-label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: 500; }
    .checkbox-label input { width: auto; }
    .error-msg { background: #fee2e2; color: #991b1b; padding: 0.75rem; border-radius: 0.5rem; font-size: 0.875rem; margin-bottom: 1rem; }
    .info-msg { background: #fef3c7; color: #92400e; padding: 0.75rem; border-radius: 0.5rem; font-size: 0.875rem; margin-bottom: 1rem; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem; }

    .roles-list { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.5rem; max-height: 320px; overflow-y: auto; }
    .role-check-item { display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem; border: 1px solid #e5e7eb; border-radius: 0.5rem; cursor: pointer; transition: background 0.15s; }
    .role-check-item:hover { background: #f9fafb; }
    .role-check-item input { margin-top: 0.15rem; flex-shrink: 0; }
    .role-check-info { display: flex; flex-direction: column; gap: 0.15rem; }
    .role-check-name { font-weight: 600; color: #1f2937; font-size: 0.875rem; }
    .role-check-desc { font-size: 0.78rem; color: #6b7280; }
    .perm-count { font-size: 0.72rem; color: #9ca3af; }
    .empty-sm { padding: 1rem; text-align: center; color: #9ca3af; font-size: 0.875rem; }

    @media (max-width: 768px) {
      .page { padding: 1rem; }
      .header { flex-direction: column; align-items: flex-start; }
      .header-right { width: 100%; }
      th:nth-child(2), td:nth-child(2) { display: none; }
    }
  `],
})
export class UsersComponent implements OnInit {
  private readonly userService = inject(UserManagementService);
  private readonly roleService = inject(RoleService);
  private readonly authService = inject(AuthService);

  readonly users = signal<User[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly activeModal = signal<ModalType>(null);
  readonly selectedUser = signal<User | null>(null);

  // RBAC modal state
  readonly availableRoles = signal<Role[]>([]);
  readonly selectedRoleIds = signal<Set<string>>(new Set());
  readonly loadingRbac = signal(false);

  readonly currentUserId = computed(() => this.authService.user()?.id ?? null);

  readonly roleOptions: { value: UserRole; label: string }[] = [
    { value: 'admin', label: 'Administrador' },
    { value: 'director', label: 'Director' },
    { value: 'coordinador', label: 'Coordinador' },
    { value: 'secretaria', label: 'Secretaria' },
    { value: 'catedratico', label: 'Catedrático' },
  ];

  createForm: { email: string; password: string; full_name: string; role: UserRole } = {
    email: '',
    password: '',
    full_name: '',
    role: 'catedratico',
  };

  editForm: { email: string; full_name: string; role: UserRole; is_active: boolean } = {
    email: '',
    full_name: '',
    role: 'catedratico',
    is_active: true,
  };

  passwordForm: { new_password: string } = { new_password: '' };

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading.set(true);
    this.userService.getUsers().subscribe({
      next: (data) => { this.users.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  closeModal(): void {
    this.activeModal.set(null);
    this.selectedUser.set(null);
    this.formError.set(null);
    this.passwordForm = { new_password: '' };
  }

  // --- Create ---

  openCreateModal(): void {
    this.createForm = { email: '', password: '', full_name: '', role: 'catedratico' };
    this.formError.set(null);
    this.activeModal.set('create');
  }

  saveCreate(): void {
    if (!this.createForm.email || !this.createForm.password) return;
    this.saving.set(true);
    this.formError.set(null);

    const payload: UserCreatePayload = {
      email: this.createForm.email,
      password: this.createForm.password,
      full_name: this.createForm.full_name || null,
      role: this.createForm.role,
    };

    this.userService.createUser(payload).subscribe({
      next: () => { this.saving.set(false); this.closeModal(); this.loadUsers(); },
      error: (err: unknown) => {
        const e = err as { error?: { detail?: string | { msg: string }[] } };
        const detail = e.error?.detail;
        this.formError.set(Array.isArray(detail)
          ? detail.map((d) => d.msg).join(', ')
          : (detail as string) || 'Error al crear el usuario');
        this.saving.set(false);
      },
    });
  }

  // --- Edit ---

  openEditModal(user: User): void {
    this.selectedUser.set(user);
    this.editForm = {
      email: user.email,
      full_name: user.full_name ?? '',
      role: user.role,
      is_active: user.is_active,
    };
    this.formError.set(null);
    this.activeModal.set('edit');
  }

  saveEdit(): void {
    const user = this.selectedUser();
    if (!user) return;
    this.saving.set(true);
    this.formError.set(null);

    const payload: UserUpdatePayload = {
      email: this.editForm.email || undefined,
      full_name: this.editForm.full_name || null,
      role: this.editForm.role,
      is_active: this.editForm.is_active,
    };

    this.userService.updateUser(user.id, payload).subscribe({
      next: () => { this.saving.set(false); this.closeModal(); this.loadUsers(); },
      error: (err: unknown) => {
        const e = err as { error?: { detail?: string | { msg: string }[] } };
        const detail = e.error?.detail;
        this.formError.set(Array.isArray(detail)
          ? detail.map((d) => d.msg).join(', ')
          : (detail as string) || 'Error al actualizar el usuario');
        this.saving.set(false);
      },
    });
  }

  // --- Password ---

  openPasswordModal(user: User): void {
    this.selectedUser.set(user);
    this.passwordForm = { new_password: '' };
    this.formError.set(null);
    this.activeModal.set('password');
  }

  savePassword(): void {
    const user = this.selectedUser();
    if (!user || this.passwordForm.new_password.length < 8) return;
    this.saving.set(true);
    this.formError.set(null);

    this.userService.changePassword(user.id, this.passwordForm.new_password).subscribe({
      next: () => { this.saving.set(false); this.closeModal(); },
      error: (err: unknown) => {
        const e = err as { error?: { detail?: string } };
        this.formError.set(e.error?.detail || 'Error al cambiar la contraseña');
        this.saving.set(false);
      },
    });
  }

  // --- RBAC roles ---

  openRbacModal(user: User): void {
    this.selectedUser.set(user);
    this.selectedRoleIds.set(new Set());
    this.formError.set(null);
    this.loadingRbac.set(true);
    this.activeModal.set('rbac');

    // Load available roles and current user roles in parallel
    let rolesLoaded = false;
    let assignmentsLoaded = false;
    let loadedRoles: Role[] = [];
    let loadedAssignments: UserRoleAssignmentResponse[] = [];

    const tryFinish = () => {
      if (rolesLoaded && assignmentsLoaded) {
        this.availableRoles.set(loadedRoles);
        this.selectedRoleIds.set(new Set(loadedAssignments.map((a) => a.role_id)));
        this.loadingRbac.set(false);
      }
    };

    this.roleService.getRoles(true).subscribe({
      next: (roles) => { loadedRoles = roles; rolesLoaded = true; tryFinish(); },
      error: () => { this.loadingRbac.set(false); this.formError.set('Error al cargar roles'); },
    });

    this.roleService.getUserRoles(user.id).subscribe({
      next: (assignments) => { loadedAssignments = assignments; assignmentsLoaded = true; tryFinish(); },
      error: () => { loadedAssignments = []; assignmentsLoaded = true; tryFinish(); },
    });
  }

  toggleRbacRole(role: Role, checked: boolean): void {
    const user = this.selectedUser();
    const isRestricted = ['secretaria', 'catedratico'].includes(user?.role ?? '');

    if (checked && isRestricted) {
      // Only allow 1 role for restricted types
      this.selectedRoleIds.set(new Set([role.id]));
    } else {
      this.selectedRoleIds.update((set) => {
        const next = new Set(set);
        if (checked) next.add(role.id);
        else next.delete(role.id);
        return next;
      });
    }
  }

  saveRbacRoles(): void {
    const user = this.selectedUser();
    if (!user) return;
    this.saving.set(true);
    this.formError.set(null);

    const roleIds = Array.from(this.selectedRoleIds());
    this.roleService.assignUserRoles(user.id, roleIds).subscribe({
      next: () => { this.saving.set(false); this.closeModal(); },
      error: (err: unknown) => {
        const e = err as { error?: { detail?: string } };
        this.formError.set(e.error?.detail || 'Error al guardar roles');
        this.saving.set(false);
      },
    });
  }

  // --- Delete ---

  deleteUser(user: User): void {
    if (user.id === this.currentUserId()) return;
    if (!confirm(`¿Eliminar al usuario "${user.email}"?\nEsta acción no se puede deshacer.`)) return;
    this.userService.deleteUser(user.id).subscribe({
      next: () => this.loadUsers(),
      error: (err: unknown) => {
        const e = err as { error?: { detail?: string } };
        alert(e.error?.detail || 'Error al eliminar');
      },
    });
  }

  // --- Helpers ---

  roleName(role: UserRole): string {
    const names: Record<string, string> = {
      admin: 'Admin',
      director: 'Director',
      coordinador: 'Coordinador',
      secretaria: 'Secretaria',
      catedratico: 'Catedrático',
      supervisor: 'Supervisor',
    };
    return names[role] ?? role;
  }

  roleBgColor(role: UserRole): string {
    const map: Record<string, string> = {
      admin: '#ede9fe',
      director: '#dbeafe',
      coordinador: '#ccfbf1',
      secretaria: '#ffedd5',
      catedratico: '#f3f4f6',
      supervisor: '#f3f4f6',
    };
    return map[role] ?? '#f3f4f6';
  }

  roleTextColor(role: UserRole): string {
    const map: Record<string, string> = {
      admin: '#7c3aed',
      director: '#2563eb',
      coordinador: '#0d9488',
      secretaria: '#ea580c',
      catedratico: '#4b5563',
      supervisor: '#4b5563',
    };
    return map[role] ?? '#4b5563';
  }
}
