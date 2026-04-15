import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DepartmentService } from '../../../../core/services/department.service';
import { Department } from '../../../../core/models/department.model';

@Component({
  selector: 'app-departments',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page">
      <header class="header">
        <div>
          <a routerLink="/admin/dashboard" class="back-link">← Dashboard</a>
          <h1>Departamentos / Facultades</h1>
        </div>
        <button class="btn btn-primary" (click)="openCreateModal()">+ Nuevo Departamento</button>
      </header>

      <!-- Table -->
      <div class="table-container">
        @if (loading()) {
          <div class="loading">Cargando...</div>
        } @else if (departments().length === 0) {
          <div class="empty">No hay departamentos registrados.</div>
        } @else {
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Descripción</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (dept of departments(); track dept.id) {
                <tr>
                  <td><strong>{{ dept.name }}</strong></td>
                  <td>{{ dept.description || '—' }}</td>
                  <td>
                    <span class="badge" [class.success]="dept.is_active" [class.danger]="!dept.is_active">
                      {{ dept.is_active ? 'Activo' : 'Inactivo' }}
                    </span>
                  </td>
                  <td>
                    <div class="actions">
                      <button class="btn btn-sm btn-edit" (click)="openEditModal(dept)">✏️ Editar</button>
                      <button class="btn btn-sm btn-danger" (click)="deleteDepartment(dept)">🗑️ Eliminar</button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

      <!-- Modal -->
      @if (showModal()) {
        <div class="modal-overlay" (click)="closeModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <h2>{{ editMode() ? 'Editar Departamento' : 'Nuevo Departamento' }}</h2>
            <form (ngSubmit)="saveDepartment()">
              <div class="form-group">
                <label>Nombre *</label>
                <input [(ngModel)]="formData.name" name="name" required placeholder="Ej: Ingeniería en Sistemas" />
              </div>
              <div class="form-group">
                <label>Descripción</label>
                <textarea [(ngModel)]="formData.description" name="description" rows="3"
                  placeholder="Descripción opcional del departamento"></textarea>
              </div>
              @if (editMode()) {
                <div class="form-group">
                  <label class="checkbox-label">
                    <input type="checkbox" [(ngModel)]="formData.is_active" name="is_active" />
                    Departamento activo
                  </label>
                </div>
              }
              @if (errorMsg()) {
                <div class="error-msg">{{ errorMsg() }}</div>
              }
              <div class="modal-actions">
                <button type="button" class="btn btn-secondary" (click)="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ saving() ? 'Guardando...' : (editMode() ? 'Guardar' : 'Crear') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { min-height: 100dvh; background: #f3f4f6; padding: 2rem; }
    .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2rem; }
    .back-link { color: #6b7280; text-decoration: none; font-size: 0.875rem; display: block; margin-bottom: 0.25rem; }
    h1 { font-size: 1.8rem; color: #1f2937; margin: 0; }
    .table-container { background: white; border-radius: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    thead { background: #f9fafb; }
    th { padding: 0.875rem 1.25rem; text-align: left; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; }
    td { padding: 1rem 1.25rem; border-top: 1px solid #f3f4f6; color: #374151; font-size: 0.9rem; }
    tr:hover td { background: #f9fafb; }
    .loading, .empty { padding: 3rem; text-align: center; color: #9ca3af; }
    .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge.success { background: #d1fae5; color: #065f46; }
    .badge.danger { background: #fee2e2; color: #991b1b; }
    .actions { display: flex; gap: 0.5rem; }
    .btn { padding: 0.625rem 1.25rem; border-radius: 0.5rem; font-weight: 500; cursor: pointer; border: none; font-size: 0.9rem; transition: all 0.2s; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover { background: #2563eb; }
    .btn-secondary { background: #e5e7eb; color: #374151; }
    .btn-secondary:hover { background: #d1d5db; }
    .btn-edit { background: #fef3c7; color: #92400e; }
    .btn-edit:hover { background: #fde68a; }
    .btn-danger { background: #fee2e2; color: #991b1b; }
    .btn-danger:hover { background: #fecaca; }
    .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.8rem; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal { background: white; padding: 2rem; border-radius: 1rem; width: 100%; max-width: 480px; }
    .modal h2 { margin: 0 0 1.5rem; color: #1f2937; }
    .form-group { margin-bottom: 1.25rem; }
    .form-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; color: #374151; font-size: 0.9rem; }
    .form-group input, .form-group textarea { width: 100%; padding: 0.625rem; border: 2px solid #e5e7eb; border-radius: 0.5rem; font-size: 0.9rem; box-sizing: border-box; font-family: inherit; }
    .form-group input:focus, .form-group textarea:focus { outline: none; border-color: #3b82f6; }
    .checkbox-label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: 500; }
    .checkbox-label input { width: auto; }
    .error-msg { background: #fee2e2; color: #991b1b; padding: 0.75rem; border-radius: 0.5rem; font-size: 0.875rem; margin-bottom: 1rem; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem; }
  `],
})
export class DepartmentsComponent implements OnInit {
  private readonly departmentService = inject(DepartmentService);

  readonly departments = signal<Department[]>([]);
  readonly showModal = signal(false);
  readonly editMode = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMsg = signal<string | null>(null);

  private editingId: string | null = null;

  formData: { name: string; description: string; is_active: boolean } = {
    name: '',
    description: '',
    is_active: true,
  };

  ngOnInit(): void {
    this.loadDepartments();
  }

  loadDepartments(): void {
    this.loading.set(true);
    this.departmentService.getDepartments(false).subscribe({
      next: (data) => { this.departments.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openCreateModal(): void {
    this.editMode.set(false);
    this.editingId = null;
    this.formData = { name: '', description: '', is_active: true };
    this.errorMsg.set(null);
    this.showModal.set(true);
  }

  openEditModal(dept: Department): void {
    this.editMode.set(true);
    this.editingId = dept.id;
    this.formData = { name: dept.name, description: dept.description || '', is_active: dept.is_active };
    this.errorMsg.set(null);
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editingId = null;
    this.errorMsg.set(null);
  }

  saveDepartment(): void {
    if (!this.formData.name.trim()) return;
    this.saving.set(true);
    this.errorMsg.set(null);

    const handleError = (err: any) => {
      const detail = err.error?.detail;
      this.errorMsg.set(Array.isArray(detail)
        ? detail.map((e: any) => e.msg).join(', ')
        : detail || 'Error al guardar');
      this.saving.set(false);
    };

    if (this.editMode() && this.editingId) {
      this.departmentService.updateDepartment(this.editingId, this.formData).subscribe({
        next: () => { this.saving.set(false); this.closeModal(); this.loadDepartments(); },
        error: handleError,
      });
    } else {
      this.departmentService.createDepartment({ name: this.formData.name, description: this.formData.description }).subscribe({
        next: () => { this.saving.set(false); this.closeModal(); this.loadDepartments(); },
        error: handleError,
      });
    }
  }

  deleteDepartment(dept: Department): void {
    if (!confirm(`¿Eliminar el departamento "${dept.name}"?\nEsto puede afectar empleados asignados a este departamento.`)) return;
    this.departmentService.deleteDepartment(dept.id).subscribe({
      next: () => this.loadDepartments(),
      error: (err) => alert(err.error?.detail || 'Error al eliminar'),
    });
  }
}
