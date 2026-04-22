import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RoleService } from '../../../../core/services/role.service';
import { PermissionService } from '../../../../core/services/permission.service';
import { Role, RoleCreate, RoleUpdate, Permission } from '../../../../core/models/role.model';
import { NotificationBellComponent } from '../../../../core/components/notification-bell/notification-bell.component';

interface PermissionsByModule {
  [module: string]: Permission[];
}

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NotificationBellComponent],
  template: `
    <div class="page">
      <header class="header">
        <div>
          <a routerLink="/admin/dashboard" class="back-link">← Dashboard</a>
          <h1>Gestión de Roles</h1>
        </div>
        <div class="header-right">
          <app-notification-bell />
          <button class="btn btn-primary" (click)="openCreateModal()">+ Nuevo Rol</button>
        </div>
      </header>

      <!-- Tabla -->
      <div class="table-container">
        @if (loading()) {
          <div class="loading">Cargando roles...</div>
        } @else if (roles().length === 0) {
          <div class="empty">No hay roles registrados.</div>
        } @else {
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Descripción</th>
                <th>Permisos</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (role of roles(); track role.id) {
                <tr>
                  <td><strong>{{ role.name }}</strong></td>
                  <td>{{ role.description || '—' }}</td>
                  <td>
                    <span class="perm-count">{{ role.permissions.length }} permiso{{ role.permissions.length !== 1 ? 's' : '' }}</span>
                  </td>
                  <td>
                    <span class="badge" [style.background]="role.is_active ? '#d1fae5' : '#f3f4f6'"
                          [style.color]="role.is_active ? '#065f46' : '#6b7280'">
                      {{ role.is_active ? 'Activo' : 'Inactivo' }}
                    </span>
                  </td>
                  <td>
                    <div class="actions">
                      <button class="btn btn-sm btn-perms" (click)="openPermissionsModal(role)">
                        Permisos
                      </button>
                      <button class="btn btn-sm btn-edit" (click)="openEditModal(role)">Editar</button>
                      <button class="btn btn-sm btn-danger" (click)="deleteRole(role)">Eliminar</button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

      <!-- Modal crear/editar rol -->
      @if (showRoleModal()) {
        <div class="modal-overlay" (click)="closeRoleModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <h2>{{ editMode() ? 'Editar Rol' : 'Nuevo Rol' }}</h2>
            <form (ngSubmit)="saveRole()">
              <div class="form-group">
                <label>Nombre *</label>
                <input [(ngModel)]="roleForm.name" name="name" required
                  placeholder="Ej: Supervisor de Asistencia" />
              </div>
              <div class="form-group">
                <label>Descripción</label>
                <textarea [(ngModel)]="roleForm.description" name="description" rows="3"
                  placeholder="Descripción opcional del rol"></textarea>
              </div>
              @if (editMode()) {
                <div class="form-group">
                  <label class="checkbox-label">
                    <input type="checkbox" [(ngModel)]="roleForm.is_active" name="is_active" />
                    Rol activo
                  </label>
                </div>
              }
              @if (roleFormError()) {
                <div class="error-msg">{{ roleFormError() }}</div>
              }
              <div class="modal-actions">
                <button type="button" class="btn btn-secondary" (click)="closeRoleModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ saving() ? 'Guardando...' : (editMode() ? 'Guardar' : 'Crear') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Modal de permisos -->
      @if (showPermissionsModal()) {
        <div class="modal-overlay" (click)="closePermissionsModal()">
          <div class="modal modal-lg" (click)="$event.stopPropagation()">
            <h2>Permisos del rol: {{ selectedRole()?.name }}</h2>

            @if (loadingPermissions()) {
              <div class="loading">Cargando permisos...</div>
            } @else {
              <div class="modules-container">
                @for (module of moduleKeys(); track module) {
                  <div class="module-section">
                    <div class="module-header">
                      <label class="module-label">
                        <input type="checkbox"
                          [checked]="isModuleFullySelected(module)"
                          [indeterminate]="isModulePartiallySelected(module)"
                          (change)="toggleModule(module, $any($event.target).checked)" />
                        <strong>{{ moduleLabel(module) }}</strong>
                      </label>
                    </div>
                    <div class="perms-grid">
                      @for (perm of permissionsByModule()[module]; track perm.id) {
                        <label class="perm-item">
                          <input type="checkbox"
                            [checked]="selectedPermissionIds().has(perm.id)"
                            (change)="togglePermission(perm.id, $any($event.target).checked)" />
                          <span class="perm-code">{{ perm.action }}</span>
                          @if (perm.description) {
                            <span class="perm-desc">{{ perm.description }}</span>
                          }
                        </label>
                      }
                    </div>
                  </div>
                }
              </div>
            }

            @if (permError()) {
              <div class="error-msg">{{ permError() }}</div>
            }
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" (click)="closePermissionsModal()">Cancelar</button>
              <button class="btn btn-primary" (click)="savePermissions()" [disabled]="savingPerms()">
                {{ savingPerms() ? 'Guardando...' : 'Guardar permisos' }}
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

    .table-container { background: white; border-radius: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    thead { background: #f9fafb; }
    th { padding: 0.875rem 1.25rem; text-align: left; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; }
    td { padding: 1rem 1.25rem; border-top: 1px solid #f3f4f6; color: #374151; font-size: 0.9rem; }
    tr:hover td { background: #f9fafb; }
    .loading, .empty { padding: 3rem; text-align: center; color: #9ca3af; }

    .perm-count { font-size: 0.8rem; color: #6b7280; background: #f3f4f6; padding: 0.2rem 0.6rem; border-radius: 9999px; }
    .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }

    .btn { padding: 0.625rem 1.25rem; border-radius: 0.5rem; font-weight: 500; cursor: pointer; border: none; font-size: 0.9rem; transition: all 0.2s; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover { background: #2563eb; }
    .btn-secondary { background: #e5e7eb; color: #374151; }
    .btn-secondary:hover { background: #d1d5db; }
    .btn-perms { background: #ede9fe; color: #5b21b6; }
    .btn-perms:hover { background: #ddd6fe; }
    .btn-edit { background: #fef3c7; color: #92400e; }
    .btn-edit:hover { background: #fde68a; }
    .btn-danger { background: #fee2e2; color: #991b1b; }
    .btn-danger:hover { background: #fecaca; }
    .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.8rem; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }

    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
    .modal { background: white; padding: 2rem; border-radius: 1rem; width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; }
    .modal-lg { max-width: 680px; }
    .modal h2 { margin: 0 0 1.5rem; color: #1f2937; font-size: 1.25rem; }

    .form-group { margin-bottom: 1.25rem; }
    .form-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; color: #374151; font-size: 0.9rem; }
    .form-group input, .form-group textarea { width: 100%; padding: 0.625rem; border: 2px solid #e5e7eb; border-radius: 0.5rem; font-size: 0.9rem; box-sizing: border-box; font-family: inherit; }
    .form-group input:focus, .form-group textarea:focus { outline: none; border-color: #3b82f6; }
    .checkbox-label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: 500; }
    .checkbox-label input { width: auto; }
    .error-msg { background: #fee2e2; color: #991b1b; padding: 0.75rem; border-radius: 0.5rem; font-size: 0.875rem; margin-bottom: 1rem; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem; }

    .modules-container { display: flex; flex-direction: column; gap: 1.25rem; margin-bottom: 1rem; }
    .module-section { border: 1px solid #e5e7eb; border-radius: 0.75rem; overflow: hidden; }
    .module-header { background: #f9fafb; padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; }
    .module-label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
    .module-label strong { color: #374151; font-size: 0.9rem; text-transform: capitalize; }
    .perms-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.5rem; padding: 0.75rem 1rem; }
    .perm-item { display: flex; flex-direction: column; gap: 0.15rem; cursor: pointer; padding: 0.4rem 0.5rem; border-radius: 0.375rem; transition: background 0.15s; }
    .perm-item:hover { background: #f3f4f6; }
    .perm-item input { margin-right: 0.25rem; }
    .perm-code { font-size: 0.8rem; font-weight: 600; color: #374151; text-transform: capitalize; }
    .perm-desc { font-size: 0.7rem; color: #9ca3af; line-height: 1.3; }

    @media (max-width: 768px) {
      .page { padding: 1rem; }
      .header { flex-direction: column; align-items: flex-start; }
      .header-right { width: 100%; }
      th:nth-child(2), td:nth-child(2) { display: none; }
    }
  `],
})
export class RolesComponent implements OnInit {
  private readonly roleService = inject(RoleService);
  private readonly permissionService = inject(PermissionService);

  readonly roles = signal<Role[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);

  // Role modal
  readonly showRoleModal = signal(false);
  readonly editMode = signal(false);
  readonly roleFormError = signal<string | null>(null);
  private editingRoleId: string | null = null;

  roleForm: { name: string; description: string; is_active: boolean } = {
    name: '',
    description: '',
    is_active: true,
  };

  // Permissions modal
  readonly showPermissionsModal = signal(false);
  readonly selectedRole = signal<Role | null>(null);
  readonly loadingPermissions = signal(false);
  readonly savingPerms = signal(false);
  readonly permError = signal<string | null>(null);
  readonly allPermissions = signal<Permission[]>([]);
  readonly selectedPermissionIds = signal<Set<string>>(new Set());

  readonly permissionsByModule = computed<PermissionsByModule>(() => {
    const map: PermissionsByModule = {};
    for (const p of this.allPermissions()) {
      if (!map[p.module]) map[p.module] = [];
      map[p.module].push(p);
    }
    return map;
  });

  readonly moduleKeys = computed(() => Object.keys(this.permissionsByModule()).sort());

  ngOnInit(): void {
    this.loadRoles();
  }

  loadRoles(): void {
    this.loading.set(true);
    this.roleService.getRoles(false).subscribe({
      next: (data) => { this.roles.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  // --- Role modal ---

  openCreateModal(): void {
    this.editMode.set(false);
    this.editingRoleId = null;
    this.roleForm = { name: '', description: '', is_active: true };
    this.roleFormError.set(null);
    this.showRoleModal.set(true);
  }

  openEditModal(role: Role): void {
    this.editMode.set(true);
    this.editingRoleId = role.id;
    this.roleForm = { name: role.name, description: role.description || '', is_active: role.is_active };
    this.roleFormError.set(null);
    this.showRoleModal.set(true);
  }

  closeRoleModal(): void {
    this.showRoleModal.set(false);
    this.editingRoleId = null;
    this.roleFormError.set(null);
  }

  saveRole(): void {
    if (!this.roleForm.name.trim()) return;
    this.saving.set(true);
    this.roleFormError.set(null);

    const handleError = (err: unknown) => {
      const e = err as { error?: { detail?: string | { msg: string }[] } };
      const detail = e.error?.detail;
      this.roleFormError.set(Array.isArray(detail)
        ? detail.map((d) => d.msg).join(', ')
        : (detail as string) || 'Error al guardar');
      this.saving.set(false);
    };

    if (this.editMode() && this.editingRoleId) {
      const data: RoleUpdate = {
        name: this.roleForm.name,
        description: this.roleForm.description || null,
        is_active: this.roleForm.is_active,
      };
      this.roleService.updateRole(this.editingRoleId, data).subscribe({
        next: () => { this.saving.set(false); this.closeRoleModal(); this.loadRoles(); },
        error: handleError,
      });
    } else {
      const data: RoleCreate = {
        name: this.roleForm.name,
        description: this.roleForm.description || null,
      };
      this.roleService.createRole(data).subscribe({
        next: () => { this.saving.set(false); this.closeRoleModal(); this.loadRoles(); },
        error: handleError,
      });
    }
  }

  deleteRole(role: Role): void {
    if (!confirm(`¿Eliminar el rol "${role.name}"?\nEsta acción no se puede deshacer.`)) return;
    this.roleService.deleteRole(role.id).subscribe({
      next: () => this.loadRoles(),
      error: (err: unknown) => {
        const e = err as { error?: { detail?: string } };
        alert(e.error?.detail || 'Error al eliminar');
      },
    });
  }

  // --- Permissions modal ---

  openPermissionsModal(role: Role): void {
    this.selectedRole.set(role);
    this.permError.set(null);
    this.showPermissionsModal.set(true);
    this.loadingPermissions.set(true);

    // Pre-load selected IDs from role
    this.selectedPermissionIds.set(new Set(role.permissions.map((p) => p.id)));

    this.permissionService.getPermissions().subscribe({
      next: (perms) => {
        this.allPermissions.set(perms);
        this.loadingPermissions.set(false);
      },
      error: () => {
        this.loadingPermissions.set(false);
        this.permError.set('Error al cargar los permisos disponibles');
      },
    });
  }

  closePermissionsModal(): void {
    this.showPermissionsModal.set(false);
    this.selectedRole.set(null);
    this.allPermissions.set([]);
    this.permError.set(null);
  }

  togglePermission(id: string, checked: boolean): void {
    this.selectedPermissionIds.update((set) => {
      const next = new Set(set);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  isModuleFullySelected(module: string): boolean {
    const perms = this.permissionsByModule()[module] ?? [];
    return perms.length > 0 && perms.every((p) => this.selectedPermissionIds().has(p.id));
  }

  isModulePartiallySelected(module: string): boolean {
    const perms = this.permissionsByModule()[module] ?? [];
    const count = perms.filter((p) => this.selectedPermissionIds().has(p.id)).length;
    return count > 0 && count < perms.length;
  }

  toggleModule(module: string, checked: boolean): void {
    const perms = this.permissionsByModule()[module] ?? [];
    this.selectedPermissionIds.update((set) => {
      const next = new Set(set);
      for (const p of perms) {
        if (checked) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
  }

  savePermissions(): void {
    const role = this.selectedRole();
    if (!role) return;
    this.savingPerms.set(true);
    this.permError.set(null);

    const ids = Array.from(this.selectedPermissionIds());
    this.roleService.setRolePermissions(role.id, ids).subscribe({
      next: (updated) => {
        this.savingPerms.set(false);
        // Update role in list with fresh permissions
        this.roles.update((list) => list.map((r) => (r.id === updated.id ? updated : r)));
        this.closePermissionsModal();
      },
      error: (err: unknown) => {
        const e = err as { error?: { detail?: string } };
        this.permError.set(e.error?.detail || 'Error al guardar permisos');
        this.savingPerms.set(false);
      },
    });
  }

  moduleLabel(module: string): string {
    const labels: Record<string, string> = {
      employees: 'Empleados',
      attendance: 'Asistencia',
      schedules: 'Horarios',
      permission_requests: 'Solicitudes de permiso',
      settings: 'Configuración',
      departments: 'Departamentos',
      positions: 'Puestos',
      roles: 'Roles',
      users: 'Usuarios',
      locations: 'Sedes',
    };
    return labels[module] ?? module;
  }
}
