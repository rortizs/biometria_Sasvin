import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PermissionRequestService } from '../../../../core/services/permission-request.service';
import { EmployeeService } from '../../../../core/services/employee.service';
import { AuthService } from '../../../../core/services/auth.service';
import {
  PermissionRequest,
  PermissionRequestCreate,
  STATUS_LABELS,
  STATUS_COLORS,
} from '../../../../core/models/permission-request.model';
import { Employee } from '../../../../core/models/employee.model';
import { EXCEPTION_TYPE_LABELS, ExceptionType } from '../../../../core/models/schedule.model';

const ADMIN_ROLES = ['admin', 'director', 'coordinador', 'secretaria'];

@Component({
  selector: 'app-my-requests',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="header">
        <h1>Mis Solicitudes de Permiso</h1>
        <div class="header-actions">
          <button class="btn btn-primary" (click)="openModal()">+ Nueva Solicitud</button>
          <button class="btn btn-outline" (click)="logout()">Cerrar Sesión</button>
        </div>
      </header>

      @if (loading()) {
        <div class="loading">Cargando solicitudes...</div>
      }

      @if (!loading() && requests().length === 0) {
        <div class="empty-card">
          <div class="empty-icon">📋</div>
          <p>No tenés solicitudes de permiso aún.</p>
          <button class="btn btn-primary" (click)="openModal()">Crear primera solicitud</button>
        </div>
      }

      <div class="cards-grid">
        @for (req of requests(); track req.id) {
          <div class="request-card">
            <div class="card-top">
              <div class="card-meta">
                <span class="exception-type">{{ getExceptionLabel(req.exception_type) }}</span>
                <span
                  class="status-badge"
                  [style.background]="getStatusBg(req.status)"
                  [style.color]="getStatusColor(req.status)"
                >
                  {{ getStatusLabel(req.status) }}
                </span>
              </div>
              <div class="card-dates">
                {{ req.start_date | date: 'dd/MM/yyyy' }} — {{ req.end_date | date: 'dd/MM/yyyy' }}
              </div>
            </div>
            @if (req.description) {
              <div class="card-description">{{ req.description }}</div>
            }
            @if (req.rejection_reason) {
              <div class="rejection-reason">
                <strong>Motivo de rechazo:</strong> {{ req.rejection_reason }}
              </div>
            }
            <div class="card-footer">
              <span class="card-date">Enviado: {{ req.created_at | date: 'dd/MM/yyyy HH:mm' }}</span>
            </div>
          </div>
        }
      </div>

      @if (showModal()) {
        <div class="modal-overlay" (click)="closeModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>Nueva Solicitud de Permiso</h2>
              <button class="close-btn" (click)="closeModal()">✕</button>
            </div>
            <form (ngSubmit)="submitRequest()">

              <!-- Employee: readonly for non-admin, dropdown for admin -->
              <div class="form-group">
                <label>Empleado</label>
                @if (isAdminRole()) {
                  <select [(ngModel)]="form.employee_id" name="employee_id" required>
                    <option value="">Seleccioná un empleado</option>
                    @for (emp of employees(); track emp.id) {
                      <option [value]="emp.id">{{ emp.first_name }} {{ emp.last_name }}</option>
                    }
                  </select>
                } @else {
                  <input type="text" [value]="currentEmployeeName()" readonly class="readonly-input" />
                  <input type="hidden" [(ngModel)]="form.employee_id" name="employee_id" />
                }
              </div>

              <div class="form-group">
                <label>Tipo de Excepción</label>
                <select [(ngModel)]="form.exception_type" name="exception_type" required>
                  <option value="">Seleccioná un tipo</option>
                  @for (entry of exceptionTypes; track entry.value) {
                    <option [value]="entry.value">{{ entry.label }}</option>
                  }
                </select>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Fecha Inicio</label>
                  <input
                    type="date"
                    [(ngModel)]="form.start_date"
                    name="start_date"
                    [min]="minDate()"
                    required
                    (change)="onDateChange()"
                  />
                  @if (dateError()) {
                    <span class="field-error">{{ dateError() }}</span>
                  }
                </div>
                <div class="form-group">
                  <label>Fecha Fin</label>
                  <input
                    type="date"
                    [(ngModel)]="form.end_date"
                    name="end_date"
                    [min]="form.start_date || minDate()"
                    required
                    (change)="onDateChange()"
                  />
                </div>
              </div>

              <!-- Time fields — only when same day -->
              @if (sameDay()) {
                <div class="same-day-notice">
                  📅 Misma fecha — indicá el rango horario de ausencia
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>Hora Inicio</label>
                    <input
                      type="time"
                      [(ngModel)]="form.start_time"
                      name="start_time"
                      required
                      (change)="onTimeChange()"
                    />
                  </div>
                  <div class="form-group">
                    <label>Hora Fin</label>
                    <input
                      type="time"
                      [(ngModel)]="form.end_time"
                      name="end_time"
                      required
                      (change)="onTimeChange()"
                    />
                  </div>
                </div>
                @if (timeError()) {
                  <span class="field-error">{{ timeError() }}</span>
                }
              }

              <div class="form-group">
                <label>Descripción / Motivo</label>
                <textarea
                  [(ngModel)]="form.description"
                  name="description"
                  rows="3"
                  placeholder="Describí el motivo de tu solicitud..."
                ></textarea>
              </div>

              @if (submitError()) {
                <div class="error-message">{{ submitError() }}</div>
              }

              <div class="modal-actions">
                <button type="button" class="btn btn-outline" (click)="closeModal()">
                  Cancelar
                </button>
                <button type="submit" class="btn btn-primary" [disabled]="submitting()">
                  {{ submitting() ? 'Enviando...' : 'Enviar Solicitud' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page {
      min-height: 100dvh;
      background: #f3f4f6;
      padding: 2rem;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      flex-wrap: wrap;
      gap: 1rem;
    }

    h1 {
      font-size: 1.8rem;
      color: #1f2937;
      margin: 0;
    }

    .header-actions {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .loading {
      text-align: center;
      color: #6b7280;
      padding: 3rem;
    }

    .empty-card {
      background: white;
      border-radius: 1rem;
      padding: 3rem;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .empty-icon { font-size: 3rem; margin-bottom: 1rem; }
    .empty-card p { color: #6b7280; margin-bottom: 1.5rem; }

    .cards-grid { display: grid; gap: 1rem; }

    .request-card {
      background: white;
      border-radius: 1rem;
      padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .card-meta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .exception-type {
      font-weight: 600;
      color: #1f2937;
      font-size: 1rem;
    }

    .status-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .card-dates { color: #6b7280; font-size: 0.875rem; }

    .card-description {
      color: #4b5563;
      font-size: 0.875rem;
      margin-bottom: 0.75rem;
      line-height: 1.5;
    }

    .rejection-reason {
      background: #fef2f2;
      color: #991b1b;
      font-size: 0.8rem;
      padding: 0.5rem 0.75rem;
      border-radius: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .card-footer {
      border-top: 1px solid #f3f4f6;
      padding-top: 0.75rem;
    }

    .card-date { color: #9ca3af; font-size: 0.75rem; }

    .btn {
      padding: 0.625rem 1.25rem;
      border-radius: 0.5rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      font-size: 0.9rem;
    }

    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover:not(:disabled) { background: #2563eb; }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

    .btn-outline {
      background: transparent;
      border: 2px solid #d1d5db;
      color: #374151;
    }

    .btn-outline:hover { border-color: #9ca3af; }

    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
      padding: 1rem;
    }

    .modal {
      background: white;
      border-radius: 1rem;
      width: 100%;
      max-width: 520px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem 1.5rem 0;
      margin-bottom: 1rem;
    }

    .modal-header h2 { font-size: 1.25rem; color: #1f2937; }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.1rem;
      cursor: pointer;
      color: #9ca3af;
      padding: 0.25rem;
    }

    .close-btn:hover { color: #374151; }

    form { padding: 0 1.5rem 1.5rem; }

    .form-group { margin-bottom: 1rem; }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      color: #374151;
      margin-bottom: 0.375rem;
    }

    input, select, textarea {
      width: 100%;
      padding: 0.625rem 0.75rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 0.9rem;
      color: #1f2937;
      box-sizing: border-box;
      transition: border-color 0.2s;
      background: white;
    }

    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: #3b82f6;
    }

    .readonly-input {
      background: #f9fafb;
      color: #6b7280;
      cursor: not-allowed;
    }

    textarea { resize: vertical; }

    .same-day-notice {
      background: #eff6ff;
      color: #1d4ed8;
      padding: 0.625rem 0.875rem;
      border-radius: 0.5rem;
      font-size: 0.85rem;
      margin-bottom: 1rem;
    }

    .field-error {
      color: #ef4444;
      font-size: 0.75rem;
      margin-top: 0.25rem;
      display: block;
    }

    .error-message {
      background: #fef2f2;
      color: #dc2626;
      padding: 0.75rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }

    .modal-actions {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
      margin-top: 1.25rem;
    }

    @media (max-width: 768px) {
      .page { padding: 1rem; }
      h1 { font-size: 1.5rem; }
    }

    @media (max-width: 480px) {
      .page { padding: 0.75rem; }
      h1 { font-size: 1.25rem; }
      .form-row { grid-template-columns: 1fr; }
      .modal-actions { flex-direction: column-reverse; }
      .modal-actions .btn { width: 100%; text-align: center; }
      .header-actions { width: 100%; }
      .header-actions .btn { flex: 1; text-align: center; }
    }
  `],
})
export class MyRequestsComponent implements OnInit {
  private readonly requestService = inject(PermissionRequestService);
  private readonly employeeService = inject(EmployeeService);
  private readonly authService = inject(AuthService);

  readonly requests = signal<PermissionRequest[]>([]);
  readonly employees = signal<Employee[]>([]);
  readonly loading = signal(false);
  readonly showModal = signal(false);
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly dateError = signal<string | null>(null);
  readonly timeError = signal<string | null>(null);
  readonly sameDay = signal(false);

  readonly isAdminRole = computed(() => {
    const role = this.authService.user()?.role ?? '';
    return ADMIN_ROLES.includes(role);
  });

  readonly currentEmployeeName = computed(() => {
    const user = this.authService.user();
    if (!user?.employee_id) return user?.full_name ?? user?.email ?? '';
    const emp = this.employees().find(e => e.id === user.employee_id);
    return emp ? `${emp.first_name} ${emp.last_name}` : (user.full_name ?? user.email ?? '');
  });

  form: PermissionRequestCreate = {
    employee_id: '',
    exception_type: '',
    start_date: '',
    end_date: '',
    start_time: '',
    end_time: '',
    description: '',
  };

  readonly exceptionTypes = Object.entries(EXCEPTION_TYPE_LABELS).map(([value, label]) => ({
    value: value as ExceptionType,
    label,
  }));

  readonly minDate = computed(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });

  ngOnInit(): void {
    this.loadRequests();
    this.loadEmployees();
  }

  loadRequests(): void {
    this.loading.set(true);
    // Backend filters by JWT role — no params needed
    this.requestService.getAll().subscribe({
      next: (list) => {
        this.requests.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadEmployees(): void {
    this.employeeService.getAll({ active_only: true }).subscribe({
      next: (list) => this.employees.set(list),
      error: () => {},
    });
  }

  openModal(): void {
    this.resetForm();
    const user = this.authService.user();
    if (user && !this.isAdminRole()) {
      this.form.employee_id = user.employee_id ?? '';
    }
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.resetForm();
  }

  onDateChange(): void {
    const isSame = !!this.form.start_date &&
      !!this.form.end_date &&
      this.form.start_date === this.form.end_date;
    this.sameDay.set(isSame);

    if (!isSame) {
      this.form.start_time = '';
      this.form.end_time = '';
      this.timeError.set(null);
    }

    if (this.form.start_date) {
      const start = new Date(this.form.start_date);
      const minAllowed = new Date(this.minDate());
      this.dateError.set(
        start < minAllowed ? 'La fecha de inicio debe ser al menos 7 días desde hoy.' : null
      );
    }
  }

  onTimeChange(): void {
    if (this.form.start_time && this.form.end_time) {
      this.timeError.set(
        this.form.start_time >= this.form.end_time
          ? 'La hora fin debe ser posterior a la hora inicio.'
          : null
      );
    }
  }

  submitRequest(): void {
    if (this.dateError()) return;

    if (!this.form.employee_id || !this.form.exception_type || !this.form.start_date || !this.form.end_date) {
      this.submitError.set('Completá todos los campos requeridos.');
      return;
    }

    if (this.sameDay()) {
      if (!this.form.start_time || !this.form.end_time) {
        this.submitError.set('Para solicitudes del mismo día, indicá hora inicio y hora fin.');
        return;
      }
      if (this.timeError()) return;
    }

    this.submitting.set(true);
    this.submitError.set(null);

    const payload: PermissionRequestCreate = {
      employee_id: this.form.employee_id,
      exception_type: this.form.exception_type,
      start_date: this.form.start_date,
      end_date: this.form.end_date,
    };

    if (this.sameDay()) {
      payload.start_time = this.form.start_time;
      payload.end_time = this.form.end_time;
    }

    if (this.form.description) payload.description = this.form.description;

    this.requestService.create(payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.closeModal();
        this.loadRequests();
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(err.error?.detail || 'Error al enviar la solicitud.');
      },
    });
  }

  logout(): void {
    this.authService.logout();
  }

  getExceptionLabel(type: string): string {
    return EXCEPTION_TYPE_LABELS[type as ExceptionType] ?? type;
  }

  getStatusLabel(status: string): string {
    return STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status;
  }

  getStatusColor(status: string): string {
    return STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? '#6b7280';
  }

  getStatusBg(status: string): string {
    const map: Record<string, string> = {
      pending: '#fffbeb',
      coordinator_approved: '#eff6ff',
      approved: '#f0fdf4',
      rejected: '#fef2f2',
    };
    return map[status] ?? '#f3f4f6';
  }

  private resetForm(): void {
    this.form = {
      employee_id: '',
      exception_type: '',
      start_date: '',
      end_date: '',
      start_time: '',
      end_time: '',
      description: '',
    };
    this.submitError.set(null);
    this.dateError.set(null);
    this.timeError.set(null);
    this.sameDay.set(false);
  }
}
