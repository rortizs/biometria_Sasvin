import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AttendanceService } from '../../../../core/services/attendance.service';
import { EmployeeService } from '../../../../core/services/employee.service';
import { DepartmentService } from '../../../../core/services/department.service';
import { AttendanceRecord, AttendanceStatus } from '../../../../core/models/attendance.model';
import { Employee } from '../../../../core/models/employee.model';
import { Department } from '../../../../core/models/department.model';

interface AttendanceFilters {
  dateFrom: string;
  dateTo: string;
  employeeId: string;
  departmentId: string;
  status: string;
}

interface AttendanceSummary {
  total: number;
  present: number;
  late: number;
  absent: number;
  presentPercent: number;
  latePercent: number;
  absentPercent: number;
}

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DatePipe, DecimalPipe],
  template: `
    <div class="attendance-page">
      <header class="header">
        <div class="header-left">
          <a routerLink="/admin/dashboard" class="back-link">
            <span class="back-icon">&#8592;</span> Dashboard
          </a>
          <h1>Control de Asistencia</h1>
          <p class="subtitle">Monitoreo y reportes de asistencia del personal</p>
        </div>
        <button class="export-btn" (click)="exportToCSV()" [disabled]="loading() || filteredAttendance().length === 0">
          <span class="export-icon">&#8681;</span>
          Exportar CSV
        </button>
      </header>

      <!-- Summary Cards -->
      <section class="summary-cards">
        <div class="card total">
          <div class="card-icon">
            <span>&#128101;</span>
          </div>
          <div class="card-content">
            <span class="card-value">{{ summary().total }}</span>
            <span class="card-label">Total Empleados</span>
          </div>
        </div>
        <div class="card present">
          <div class="card-icon">
            <span>&#10004;</span>
          </div>
          <div class="card-content">
            <span class="card-value">{{ summary().present }}</span>
            <span class="card-label">Presentes</span>
            <span class="card-percent">{{ summary().presentPercent | number: '1.0-1' }}%</span>
          </div>
        </div>
        <div class="card late">
          <div class="card-icon">
            <span>&#9203;</span>
          </div>
          <div class="card-content">
            <span class="card-value">{{ summary().late }}</span>
            <span class="card-label">Tardanzas</span>
            <span class="card-percent">{{ summary().latePercent | number: '1.0-1' }}%</span>
          </div>
        </div>
        <div class="card absent">
          <div class="card-icon">
            <span>&#10006;</span>
          </div>
          <div class="card-content">
            <span class="card-value">{{ summary().absent }}</span>
            <span class="card-label">Ausentes</span>
            <span class="card-percent">{{ summary().absentPercent | number: '1.0-1' }}%</span>
          </div>
        </div>
      </section>

      <!-- Filters -->
      <section class="filters-section">
        <div class="filters-grid">
          <div class="filter-group">
            <label for="dateFrom">Desde</label>
            <input
              id="dateFrom"
              type="date"
              [(ngModel)]="filters.dateFrom"
              (change)="loadAttendance()"
            />
          </div>
          <div class="filter-group">
            <label for="dateTo">Hasta</label>
            <input
              id="dateTo"
              type="date"
              [(ngModel)]="filters.dateTo"
              (change)="loadAttendance()"
            />
          </div>
          <div class="filter-group">
            <label for="department">Departamento</label>
            <select
              id="department"
              [(ngModel)]="filters.departmentId"
              (change)="onDepartmentChange()"
            >
              <option value="">Todos los departamentos</option>
              @for (dept of departments(); track dept.id) {
                <option [value]="dept.id">{{ dept.name }}</option>
              }
            </select>
          </div>
          <div class="filter-group">
            <label for="employee">Empleado</label>
            <select
              id="employee"
              [(ngModel)]="filters.employeeId"
              (change)="loadAttendance()"
            >
              <option value="">Todos los empleados</option>
              @for (emp of filteredEmployees(); track emp.id) {
                <option [value]="emp.id">{{ emp.first_name }} {{ emp.last_name }}</option>
              }
            </select>
          </div>
          <div class="filter-group">
            <label for="status">Estado</label>
            <select
              id="status"
              [(ngModel)]="filters.status"
              (change)="loadAttendance()"
            >
              <option value="">Todos los estados</option>
              <option value="present">Presente</option>
              <option value="late">Tarde</option>
              <option value="absent">Ausente</option>
              <option value="early_leave">Salida temprana</option>
            </select>
          </div>
          <div class="filter-group filter-actions">
            <button class="clear-btn" (click)="clearFilters()">
              Limpiar filtros
            </button>
          </div>
        </div>
      </section>

      <!-- Loading indicator -->
      @if (loading()) {
        <div class="loading-overlay">
          <div class="spinner"></div>
          <p>Cargando registros...</p>
        </div>
      }

      <!-- Table -->
      <section class="table-section">
        <div class="table-header">
          <h2>Registros de Asistencia</h2>
          <span class="record-count">{{ filteredAttendance().length }} registros</span>
        </div>
        <div class="table-container">
          @if (filteredAttendance().length === 0 && !loading()) {
            <div class="no-records">
              <span class="no-records-icon">&#128196;</span>
              <p>No hay registros para los filtros seleccionados</p>
              <button class="clear-btn" (click)="clearFilters()">Limpiar filtros</button>
            </div>
          } @else {
            <table>
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Fecha</th>
                  <th>Entrada</th>
                  <th>Salida</th>
                  <th>Horas Trabajadas</th>
                  <th>Estado</th>
                  <th>Confianza</th>
                  <th>Ubicacion</th>
                </tr>
              </thead>
              <tbody>
                @for (record of filteredAttendance(); track record.id) {
                  <tr>
                    <td class="employee-cell">
                      <span class="employee-name">{{ record.employee_name }}</span>
                    </td>
                    <td>{{ record.record_date | date: 'dd/MM/yyyy' }}</td>
                    <td>
                      @if (record.check_in) {
                        <span class="time-badge check-in">{{ record.check_in | date: 'HH:mm' }}</span>
                      } @else {
                        <span class="time-badge no-time">-</span>
                      }
                    </td>
                    <td>
                      @if (record.check_out) {
                        <span class="time-badge check-out">{{ record.check_out | date: 'HH:mm' }}</span>
                      } @else {
                        <span class="time-badge no-time">-</span>
                      }
                    </td>
                    <td>
                      <span class="hours-worked">{{ calculateHoursWorked(record) }}</span>
                    </td>
                    <td>
                      <span class="status-badge" [class]="record.status">
                        {{ getStatusLabel(record.status) }}
                      </span>
                    </td>
                    <td>
                      @if (record.confidence) {
                        <div class="confidence-bar">
                          <div class="confidence-fill" [style.width.%]="record.confidence * 100"></div>
                          <span class="confidence-text">{{ (record.confidence * 100) | number: '1.0-0' }}%</span>
                        </div>
                      } @else {
                        <span class="no-data">-</span>
                      }
                    </td>
                    <td>
                      @if (record.geo_validated !== undefined) {
                        <span class="geo-badge" [class.validated]="record.geo_validated" [class.not-validated]="!record.geo_validated">
                          @if (record.geo_validated) {
                            <span class="geo-icon">&#128205;</span> Validada
                          } @else {
                            <span class="geo-icon">&#10067;</span> No validada
                          }
                        </span>
                      } @else {
                        <span class="no-data">-</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      </section>
    </div>
  `,
  styles: [`
    .attendance-page {
      min-height: 100vh;
      background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
      padding: 1.5rem 2rem;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.5rem;
    }

    .header-left {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      color: #6b7280;
      text-decoration: none;
      font-size: 0.875rem;
      transition: color 0.2s;
    }

    .back-link:hover {
      color: #374151;
    }

    .back-icon {
      font-size: 1rem;
    }

    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      color: #1f2937;
      margin: 0.25rem 0;
    }

    .subtitle {
      color: #6b7280;
      font-size: 0.875rem;
      margin: 0;
    }

    .export-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.25rem;
      background: #059669;
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .export-btn:hover:not(:disabled) {
      background: #047857;
      transform: translateY(-1px);
    }

    .export-btn:disabled {
      background: #9ca3af;
      cursor: not-allowed;
    }

    .export-icon {
      font-size: 1rem;
    }

    /* Summary Cards */
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .card {
      background: white;
      border-radius: 1rem;
      padding: 1.25rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .card-icon {
      width: 3rem;
      height: 3rem;
      border-radius: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
    }

    .card.total .card-icon {
      background: #e0e7ff;
      color: #4f46e5;
    }

    .card.present .card-icon {
      background: #dcfce7;
      color: #16a34a;
    }

    .card.late .card-icon {
      background: #fef3c7;
      color: #d97706;
    }

    .card.absent .card-icon {
      background: #fee2e2;
      color: #dc2626;
    }

    .card-content {
      display: flex;
      flex-direction: column;
    }

    .card-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: #1f2937;
      line-height: 1;
    }

    .card-label {
      font-size: 0.8rem;
      color: #6b7280;
      margin-top: 0.25rem;
    }

    .card-percent {
      font-size: 0.75rem;
      color: #9ca3af;
      font-weight: 500;
    }

    /* Filters */
    .filters-section {
      background: white;
      border-radius: 1rem;
      padding: 1.25rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .filters-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 1rem;
      align-items: end;
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .filter-group label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #374151;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }

    .filter-group input,
    .filter-group select {
      padding: 0.625rem 0.75rem;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      color: #1f2937;
      background: #f9fafb;
      transition: all 0.2s;
    }

    .filter-group input:focus,
    .filter-group select:focus {
      outline: none;
      border-color: #6366f1;
      background: white;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }

    .filter-actions {
      justify-content: flex-end;
    }

    .clear-btn {
      padding: 0.625rem 1rem;
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .clear-btn:hover {
      background: #e5e7eb;
    }

    /* Loading */
    .loading-overlay {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem;
      background: white;
      border-radius: 1rem;
      margin-bottom: 1.5rem;
    }

    .spinner {
      width: 3rem;
      height: 3rem;
      border: 3px solid #e5e7eb;
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .loading-overlay p {
      margin-top: 1rem;
      color: #6b7280;
    }

    /* Table Section */
    .table-section {
      background: white;
      border-radius: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    .table-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #e5e7eb;
    }

    .table-header h2 {
      font-size: 1.125rem;
      font-weight: 600;
      color: #1f2937;
      margin: 0;
    }

    .record-count {
      font-size: 0.875rem;
      color: #6b7280;
      background: #f3f4f6;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
    }

    .table-container {
      overflow-x: auto;
    }

    .no-records {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4rem 2rem;
      color: #6b7280;
    }

    .no-records-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }

    .no-records p {
      margin-bottom: 1rem;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      padding: 0.875rem 1rem;
      text-align: left;
      border-bottom: 1px solid #f3f4f6;
    }

    th {
      background: #f9fafb;
      font-weight: 600;
      font-size: 0.75rem;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    tbody tr {
      transition: background-color 0.15s;
    }

    tbody tr:hover {
      background-color: #f9fafb;
    }

    .employee-cell {
      min-width: 150px;
    }

    .employee-name {
      font-weight: 500;
      color: #1f2937;
    }

    .time-badge {
      display: inline-block;
      padding: 0.25rem 0.625rem;
      border-radius: 0.375rem;
      font-size: 0.8125rem;
      font-weight: 500;
    }

    .time-badge.check-in {
      background: #dcfce7;
      color: #166534;
    }

    .time-badge.check-out {
      background: #dbeafe;
      color: #1e40af;
    }

    .time-badge.no-time {
      background: #f3f4f6;
      color: #9ca3af;
    }

    .hours-worked {
      font-weight: 500;
      color: #374151;
    }

    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }

    .status-badge.present {
      background: #dcfce7;
      color: #166534;
    }

    .status-badge.late {
      background: #fef3c7;
      color: #92400e;
    }

    .status-badge.absent {
      background: #fee2e2;
      color: #991b1b;
    }

    .status-badge.early_leave {
      background: #dbeafe;
      color: #1e40af;
    }

    .confidence-bar {
      position: relative;
      width: 80px;
      height: 20px;
      background: #e5e7eb;
      border-radius: 0.25rem;
      overflow: hidden;
    }

    .confidence-fill {
      height: 100%;
      background: linear-gradient(90deg, #10b981 0%, #059669 100%);
      transition: width 0.3s ease;
    }

    .confidence-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 0.6875rem;
      font-weight: 600;
      color: #1f2937;
    }

    .geo-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.625rem;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .geo-badge.validated {
      background: #dcfce7;
      color: #166534;
    }

    .geo-badge.not-validated {
      background: #fef3c7;
      color: #92400e;
    }

    .geo-icon {
      font-size: 0.875rem;
    }

    .no-data {
      color: #9ca3af;
    }

    /* Responsive */
    @media (max-width: 1200px) {
      .summary-cards {
        grid-template-columns: repeat(2, 1fr);
      }

      .filters-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    @media (max-width: 768px) {
      .attendance-page {
        padding: 1rem;
      }

      .header {
        flex-direction: column;
        gap: 1rem;
      }

      .export-btn {
        width: 100%;
        justify-content: center;
      }

      .summary-cards {
        grid-template-columns: repeat(2, 1fr);
      }

      .card {
        padding: 1rem;
      }

      .card-value {
        font-size: 1.5rem;
      }

      .filters-grid {
        grid-template-columns: 1fr;
      }

      .table-container {
        font-size: 0.875rem;
      }

      th, td {
        padding: 0.625rem 0.5rem;
      }
    }

    @media (max-width: 480px) {
      .summary-cards {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class AttendanceComponent implements OnInit {
  private readonly attendanceService = inject(AttendanceService);
  private readonly employeeService = inject(EmployeeService);
  private readonly departmentService = inject(DepartmentService);

  // Signals for state management
  readonly attendance = signal<AttendanceRecord[]>([]);
  readonly employees = signal<Employee[]>([]);
  readonly departments = signal<Department[]>([]);
  readonly loading = signal(false);

  // Filters with default values
  filters: AttendanceFilters = {
    dateFrom: this.getDefaultDateFrom(),
    dateTo: new Date().toISOString().split('T')[0],
    employeeId: '',
    departmentId: '',
    status: '',
  };

  // Computed: filtered employees based on department selection
  readonly filteredEmployees = computed(() => {
    const deptId = this.filters.departmentId;
    if (!deptId) {
      return this.employees();
    }
    return this.employees().filter(emp => emp.department_id === deptId);
  });

  // Computed: filtered attendance (client-side filtering for department)
  readonly filteredAttendance = computed(() => {
    const records = this.attendance();
    const deptId = this.filters.departmentId;

    if (!deptId) {
      return records;
    }

    // Get employee IDs for selected department
    const deptEmployeeIds = new Set(
      this.employees()
        .filter(emp => emp.department_id === deptId)
        .map(emp => emp.id)
    );

    return records.filter(record => deptEmployeeIds.has(record.employee_id));
  });

  // Computed: summary statistics
  readonly summary = computed<AttendanceSummary>(() => {
    const records = this.filteredAttendance();
    const total = records.length;
    const present = records.filter(r => r.status === 'present').length;
    const late = records.filter(r => r.status === 'late').length;
    const absent = records.filter(r => r.status === 'absent').length;

    return {
      total,
      present,
      late,
      absent,
      presentPercent: total > 0 ? (present / total) * 100 : 0,
      latePercent: total > 0 ? (late / total) * 100 : 0,
      absentPercent: total > 0 ? (absent / total) * 100 : 0,
    };
  });

  ngOnInit(): void {
    this.loadInitialData();
  }

  private loadInitialData(): void {
    this.loading.set(true);

    forkJoin({
      employees: this.employeeService.getAll({ active_only: true }),
      departments: this.departmentService.getDepartments(true),
    }).subscribe({
      next: ({ employees, departments }) => {
        this.employees.set(employees);
        this.departments.set(departments);
        this.loadAttendance();
      },
      error: (err) => {
        console.error('Error loading initial data:', err);
        this.loading.set(false);
      },
    });
  }

  loadAttendance(): void {
    this.loading.set(true);

    const params: Record<string, string | number> = {
      limit: 1000,
    };

    if (this.filters.dateFrom) {
      params['date_from'] = this.filters.dateFrom;
    }
    if (this.filters.dateTo) {
      params['date_to'] = this.filters.dateTo;
    }
    if (this.filters.employeeId) {
      params['employee_id'] = this.filters.employeeId;
    }
    if (this.filters.status) {
      params['status'] = this.filters.status;
    }

    this.attendanceService.getAttendance(params).subscribe({
      next: (records) => {
        this.attendance.set(records);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading attendance:', err);
        this.loading.set(false);
      },
    });
  }

  onDepartmentChange(): void {
    // Reset employee filter when department changes
    this.filters.employeeId = '';
    this.loadAttendance();
  }

  clearFilters(): void {
    this.filters = {
      dateFrom: this.getDefaultDateFrom(),
      dateTo: new Date().toISOString().split('T')[0],
      employeeId: '',
      departmentId: '',
      status: '',
    };
    this.loadAttendance();
  }

  getStatusLabel(status: AttendanceStatus): string {
    const labels: Record<string, string> = {
      present: 'Presente',
      late: 'Tarde',
      absent: 'Ausente',
      early_leave: 'Salida temprana',
    };
    return labels[status] || status;
  }

  calculateHoursWorked(record: AttendanceRecord): string {
    if (!record.check_in || !record.check_out) {
      return '-';
    }

    const checkIn = new Date(record.check_in);
    const checkOut = new Date(record.check_out);
    const diffMs = checkOut.getTime() - checkIn.getTime();

    if (diffMs < 0) {
      return '-';
    }

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
  }

  exportToCSV(): void {
    const records = this.filteredAttendance();
    if (records.length === 0) return;

    // CSV header
    const headers = [
      'Empleado',
      'Fecha',
      'Entrada',
      'Salida',
      'Horas Trabajadas',
      'Estado',
      'Confianza (%)',
      'Ubicacion Validada',
    ];

    // CSV rows
    const rows = records.map(record => [
      record.employee_name,
      this.formatDate(record.record_date),
      record.check_in ? this.formatTime(record.check_in) : '-',
      record.check_out ? this.formatTime(record.check_out) : '-',
      this.calculateHoursWorked(record),
      this.getStatusLabel(record.status),
      record.confidence ? Math.round(record.confidence * 100).toString() : '-',
      record.geo_validated !== undefined ? (record.geo_validated ? 'Si' : 'No') : '-',
    ]);

    // Build CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    // Create and trigger download
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const fileName = `asistencia_${this.filters.dateFrom}_${this.filters.dateTo}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  private formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private getDefaultDateFrom(): string {
    // Default to 7 days ago
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  }
}
