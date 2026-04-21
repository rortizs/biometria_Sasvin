import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PermissionRequestService } from '../../../../core/services/permission-request.service';
import { EmployeeService } from '../../../../core/services/employee.service';
import { AuthService } from '../../../../core/services/auth.service';
import {
  PermissionRequest,
  PermissionRequestStatus,
  STATUS_LABELS,
  STATUS_COLORS,
} from '../../../../core/models/permission-request.model';
import { Employee } from '../../../../core/models/employee.model';
import { EXCEPTION_TYPE_LABELS, ExceptionType } from '../../../../core/models/schedule.model';
import { NotificationBellComponent } from '../../../../core/components/notification-bell/notification-bell.component';

type FilterTab = 'all' | PermissionRequestStatus;

@Component({
  selector: 'app-permission-requests',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NotificationBellComponent],
  template: `
    <div class="page">
      <header class="header">
        <div>
          <a routerLink="/admin/dashboard" class="back-link">← Dashboard</a>
          <h1>Solicitudes de Permiso</h1>
        </div>
        <div class="header-right">
          <app-notification-bell />
        </div>
      </header>

      <!-- Filter tabs -->
      <div class="tabs">
        @for (tab of tabs; track tab.value) {
          <button
            class="tab-btn"
            [class.active]="activeTab() === tab.value"
            (click)="setTab(tab.value)"
          >
            {{ tab.label }}
            @if (countByStatus(tab.value) > 0) {
              <span class="tab-count">{{ countByStatus(tab.value) }}</span>
            }
          </button>
        }
      </div>

      <!-- Loading -->
      @if (loading()) {
        <div class="loading">Cargando solicitudes...</div>
      }

      <!-- Empty state -->
      @if (!loading() && filteredRequests().length === 0) {
        <div class="empty-card">
          <div class="empty-icon">📋</div>
          <p>No hay solicitudes en esta categoría.</p>
        </div>
      }

      <!-- Cards -->
      <div class="cards-grid">
        @for (req of filteredRequests(); track req.id) {
          <div class="request-card">
            <div class="card-header">
              <div class="card-meta">
                <span class="employee-name">{{ getEmployeeName(req.employee_id) }}</span>
                <span
                  class="status-badge"
                  [style.background]="getStatusBg(req.status)"
                  [style.color]="STATUS_COLORS[req.status]"
                >
                  {{ STATUS_LABELS[req.status] }}
                </span>
              </div>
              <span class="exception-type">{{ getExceptionLabel(req.exception_type) }}</span>
            </div>

            <div class="card-dates">
              📅 {{ req.start_date | date: 'dd/MM/yyyy' }} — {{ req.end_date | date: 'dd/MM/yyyy' }}
            </div>

            @if (req.description) {
              <div class="card-description">{{ req.description }}</div>
            }

            @if (req.rejection_reason) {
              <div class="rejection-reason">
                <strong>Rechazo:</strong> {{ req.rejection_reason }}
              </div>
            }

            <div class="card-footer">
              <span class="card-date">{{ req.created_at | date: 'dd/MM/yyyy HH:mm' }}</span>
              <div class="card-actions">
                @if (canApprove(req)) {
                  <button class="btn btn-approve" (click)="openApproveModal(req)">Aprobar</button>
                }
                @if (canReject(req)) {
                  <button class="btn btn-reject" (click)="openRejectModal(req)">Rechazar</button>
                }
              </div>
            </div>
          </div>
        }
      </div>

      <!-- Approve Modal -->
      @if (approveTarget()) {
        <div class="modal-overlay" (click)="closeModals()">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>Aprobar Solicitud</h2>
              <button class="close-btn" (click)="closeModals()">✕</button>
            </div>
            <div class="modal-body">
              <p class="modal-desc">
                Vas a aprobar la solicitud de
                <strong>{{ getEmployeeName(approveTarget()!.employee_id) }}</strong>
                para <strong>{{ getExceptionLabel(approveTarget()!.exception_type) }}</strong>.
              </p>
              <div class="form-group">
                <label>Notas (opcional)</label>
                <textarea
                  [(ngModel)]="approveNotes"
                  rows="3"
                  placeholder="Notas adicionales..."
                ></textarea>
              </div>
              @if (actionError()) {
                <div class="error-message">{{ actionError() }}</div>
              }
            </div>
            <div class="modal-actions">
              <button class="btn btn-outline" (click)="closeModals()">Cancelar</button>
              <button class="btn btn-approve" [disabled]="actionLoading()" (click)="confirmApprove()">
                {{ actionLoading() ? 'Procesando...' : 'Confirmar Aprobación' }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Reject Modal -->
      @if (rejectTarget()) {
        <div class="modal-overlay" (click)="closeModals()">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>Rechazar Solicitud</h2>
              <button class="close-btn" (click)="closeModals()">✕</button>
            </div>
            <div class="modal-body">
              <p class="modal-desc">
                Vas a rechazar la solicitud de
                <strong>{{ getEmployeeName(rejectTarget()!.employee_id) }}</strong>.
              </p>
              <div class="form-group">
                <label>Motivo de Rechazo <span class="required">*</span></label>
                <textarea
                  [(ngModel)]="rejectReason"
                  rows="3"
                  placeholder="Especificá el motivo del rechazo..."
                  required
                ></textarea>
              </div>
              @if (actionError()) {
                <div class="error-message">{{ actionError() }}</div>
              }
            </div>
            <div class="modal-actions">
              <button class="btn btn-outline" (click)="closeModals()">Cancelar</button>
              <button class="btn btn-reject" [disabled]="actionLoading()" (click)="confirmReject()">
                {{ actionLoading() ? 'Procesando...' : 'Confirmar Rechazo' }}
              </button>
            </div>
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
      align-items: flex-start;
      margin-bottom: 2rem;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .back-link {
      display: inline-block;
      color: #6b7280;
      text-decoration: none;
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
    }

    .back-link:hover { color: #3b82f6; }

    h1 {
      font-size: 1.8rem;
      color: #1f2937;
      margin: 0;
    }

    .tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }

    .tab-btn {
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      border: 2px solid #e5e7eb;
      background: white;
      color: #374151;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 500;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }

    .tab-btn:hover { border-color: #3b82f6; color: #3b82f6; }

    .tab-btn.active {
      background: #3b82f6;
      border-color: #3b82f6;
      color: white;
    }

    .tab-count {
      background: rgba(255,255,255,0.3);
      padding: 0 6px;
      border-radius: 9999px;
      font-size: 0.7rem;
      font-weight: 700;
    }

    .tab-btn:not(.active) .tab-count {
      background: #e5e7eb;
      color: #374151;
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
    .empty-card p { color: #6b7280; }

    .cards-grid {
      display: grid;
      gap: 1rem;
    }

    .request-card {
      background: white;
      border-radius: 1rem;
      padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .card-meta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .employee-name {
      font-weight: 600;
      color: #1f2937;
    }

    .exception-type {
      font-size: 0.875rem;
      color: #6b7280;
    }

    .status-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .card-dates {
      color: #6b7280;
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
    }

    .card-description {
      color: #4b5563;
      font-size: 0.875rem;
      line-height: 1.5;
      margin-bottom: 0.75rem;
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
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
      border-top: 1px solid #f3f4f6;
      padding-top: 0.75rem;
    }

    .card-date {
      color: #9ca3af;
      font-size: 0.75rem;
    }

    .card-actions {
      display: flex;
      gap: 0.5rem;
    }

    .btn {
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      font-size: 0.875rem;
    }

    .btn-approve {
      background: #10b981;
      color: white;
    }

    .btn-approve:hover:not(:disabled) { background: #059669; }
    .btn-approve:disabled { opacity: 0.6; cursor: not-allowed; }

    .btn-reject {
      background: #ef4444;
      color: white;
    }

    .btn-reject:hover:not(:disabled) { background: #dc2626; }
    .btn-reject:disabled { opacity: 0.6; cursor: not-allowed; }

    .btn-outline {
      background: transparent;
      border: 2px solid #d1d5db;
      color: #374151;
    }

    .btn-outline:hover { border-color: #9ca3af; }

    /* Modal */
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
      max-width: 460px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem 1.5rem 0;
    }

    .modal-header h2 {
      font-size: 1.25rem;
      color: #1f2937;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.1rem;
      cursor: pointer;
      color: #9ca3af;
      padding: 0.25rem;
    }

    .close-btn:hover { color: #374151; }

    .modal-body {
      padding: 1.25rem 1.5rem;
    }

    .modal-desc {
      color: #4b5563;
      font-size: 0.9rem;
      margin-bottom: 1rem;
      line-height: 1.5;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      color: #374151;
      margin-bottom: 0.375rem;
    }

    .required { color: #ef4444; }

    textarea {
      width: 100%;
      padding: 0.625rem 0.75rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 0.9rem;
      color: #1f2937;
      box-sizing: border-box;
      transition: border-color 0.2s;
      resize: vertical;
    }

    textarea:focus {
      outline: none;
      border-color: #3b82f6;
    }

    .error-message {
      background: #fef2f2;
      color: #dc2626;
      padding: 0.75rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
    }

    .modal-actions {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
      padding: 0 1.5rem 1.5rem;
    }

    @media (max-width: 768px) {
      .page { padding: 1rem; }
      h1 { font-size: 1.5rem; }
    }

    @media (max-width: 480px) {
      .page { padding: 0.75rem; }
      h1 { font-size: 1.25rem; }
      .tabs { gap: 0.375rem; }
      .tab-btn { font-size: 0.8rem; padding: 0.4rem 0.75rem; }
      .modal-actions { flex-direction: column-reverse; }
      .modal-actions .btn { width: 100%; text-align: center; }
    }
  `],
})
export class AdminPermissionRequestsComponent implements OnInit {
  readonly STATUS_LABELS = STATUS_LABELS;
  readonly STATUS_COLORS = STATUS_COLORS;

  private readonly requestService = inject(PermissionRequestService);
  private readonly employeeService = inject(EmployeeService);
  readonly authService = inject(AuthService);

  readonly requests = signal<PermissionRequest[]>([]);
  readonly employees = signal<Employee[]>([]);
  readonly loading = signal(false);
  readonly activeTab = signal<FilterTab>('all');

  readonly approveTarget = signal<PermissionRequest | null>(null);
  readonly rejectTarget = signal<PermissionRequest | null>(null);
  readonly actionLoading = signal(false);
  readonly actionError = signal<string | null>(null);

  approveNotes = '';
  rejectReason = '';

  readonly tabs: { value: FilterTab; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'coordinator_approved', label: 'Aprobados Coordinador' },
    { value: 'approved', label: 'Aprobados' },
    { value: 'rejected', label: 'Rechazados' },
  ];

  readonly filteredRequests = computed(() => {
    const tab = this.activeTab();
    if (tab === 'all') return this.requests();
    return this.requests().filter((r) => r.status === tab);
  });

  readonly employeeMap = computed(() => {
    const map = new Map<string, string>();
    this.employees().forEach((e) => map.set(e.id, `${e.first_name} ${e.last_name}`));
    return map;
  });

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.loading.set(true);
    this.requestService.getAll().subscribe({
      next: (list) => {
        this.requests.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.employeeService.getAll({ active_only: true }).subscribe({
      next: (list) => this.employees.set(list),
      error: () => {},
    });
  }

  setTab(tab: FilterTab): void {
    this.activeTab.set(tab);
  }

  countByStatus(tab: FilterTab): number {
    if (tab === 'all') return this.requests().length;
    return this.requests().filter((r) => r.status === tab).length;
  }

  canApprove(req: PermissionRequest): boolean {
    const role = this.authService.user()?.role;
    if (!role) return false;
    // pending -> coordinator or admin can approve
    if (req.status === 'pending' && (role === 'admin' || role === 'coordinador')) return true;
    // coordinator_approved -> director or admin can do final approval
    if (req.status === 'coordinator_approved' && (role === 'admin' || role === 'director')) return true;
    return false;
  }

  canReject(req: PermissionRequest): boolean {
    return this.canApprove(req);
  }

  openApproveModal(req: PermissionRequest): void {
    this.approveNotes = '';
    this.actionError.set(null);
    this.approveTarget.set(req);
  }

  openRejectModal(req: PermissionRequest): void {
    this.rejectReason = '';
    this.actionError.set(null);
    this.rejectTarget.set(req);
  }

  closeModals(): void {
    this.approveTarget.set(null);
    this.rejectTarget.set(null);
    this.actionError.set(null);
  }

  confirmApprove(): void {
    const target = this.approveTarget();
    if (!target) return;

    this.actionLoading.set(true);
    this.actionError.set(null);

    this.requestService.approve(target.id, this.approveNotes || undefined).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.closeModals();
        this.loadAll();
      },
      error: (err) => {
        this.actionLoading.set(false);
        this.actionError.set(err.error?.detail || 'Error al aprobar la solicitud.');
      },
    });
  }

  confirmReject(): void {
    const target = this.rejectTarget();
    if (!target) return;

    if (!this.rejectReason.trim()) {
      this.actionError.set('El motivo de rechazo es requerido.');
      return;
    }

    this.actionLoading.set(true);
    this.actionError.set(null);

    this.requestService.reject(target.id, this.rejectReason).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.closeModals();
        this.loadAll();
      },
      error: (err) => {
        this.actionLoading.set(false);
        this.actionError.set(err.error?.detail || 'Error al rechazar la solicitud.');
      },
    });
  }

  getEmployeeName(id: string): string {
    return this.employeeMap().get(id) ?? 'Empleado';
  }

  getExceptionLabel(type: string): string {
    return EXCEPTION_TYPE_LABELS[type as ExceptionType] ?? type;
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
}
