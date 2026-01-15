import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { AttendanceService } from '../../../../core/services/attendance.service';
import { EmployeeService } from '../../../../core/services/employee.service';
import { AttendanceRecord } from '../../../../core/models/attendance.model';
import { Employee } from '../../../../core/models/employee.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="dashboard">
      <!-- Header -->
      <header class="header">
        <div class="header-left">
          <h1>Dashboard</h1>
          <p>Bienvenido, {{ authService.user()?.full_name || authService.user()?.email }}</p>
        </div>
        <div class="header-right">
          <a routerLink="/kiosk" class="btn btn-secondary">Ir al Kiosko</a>
          <button class="btn btn-outline" (click)="logout()">Cerrar Sesión</button>
        </div>
      </header>

      <!-- Stats cards -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon employees">👥</div>
          <div class="stat-info">
            <span class="stat-value">{{ totalEmployees() }}</span>
            <span class="stat-label">Empleados Activos</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon present">✓</div>
          <div class="stat-info">
            <span class="stat-value">{{ presentToday() }}</span>
            <span class="stat-label">Presentes Hoy</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon faces">📷</div>
          <div class="stat-info">
            <span class="stat-value">{{ withFaceRegistered() }}</span>
            <span class="stat-label">Con Rostro Registrado</span>
          </div>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="nav-cards">
        <a routerLink="/admin/employees" class="nav-card">
          <div class="nav-icon">👥</div>
          <h3>Empleados</h3>
          <p>Gestionar empleados y registrar rostros</p>
        </a>
        <a routerLink="/admin/attendance" class="nav-card">
          <div class="nav-icon">📋</div>
          <h3>Asistencia</h3>
          <p>Ver registros de asistencia</p>
        </a>
        <a routerLink="/admin/locations" class="nav-card">
          <div class="nav-icon">📍</div>
          <h3>Sedes</h3>
          <p>Gestionar ubicaciones y geolocalización</p>
        </a>
        <a routerLink="/admin/schedules" class="nav-card">
          <div class="nav-icon">📅</div>
          <h3>Horarios</h3>
          <p>Calendario y patrones de horarios</p>
        </a>
        <a routerLink="/admin/leave-balances" class="nav-card">
          <div class="nav-icon">📊</div>
          <h3>Saldos Laborales</h3>
          <p>Vacaciones, incapacidades y compensatorios</p>
        </a>
        <a routerLink="/admin/settings" class="nav-card">
          <div class="nav-icon">⚙️</div>
          <h3>Configuración</h3>
          <p>Ajustes de la institución</p>
        </a>
      </nav>

      <!-- Today's attendance -->
      <section class="today-section">
        <h2>Asistencia de Hoy</h2>
        @if (todayAttendance().length === 0) {
          <p class="no-records">No hay registros de asistencia hoy</p>
        } @else {
          <div class="attendance-table">
            <table>
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Entrada</th>
                  <th>Salida</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                @for (record of todayAttendance(); track record.id) {
                  <tr>
                    <td>{{ record.employee_name }}</td>
                    <td>{{ record.check_in | date: 'HH:mm' }}</td>
                    <td>{{ record.check_out ? (record.check_out | date: 'HH:mm') : '-' }}</td>
                    <td>
                      <span class="status" [class]="record.status">
                        {{ getStatusLabel(record.status) }}
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </div>
  `,
  styles: [`
    .dashboard {
      min-height: 100vh;
      background: #f3f4f6;
      padding: 2rem;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }

    .header h1 {
      font-size: 1.8rem;
      color: #1f2937;
      margin-bottom: 0.25rem;
    }

    .header p {
      color: #6b7280;
    }

    .header-right {
      display: flex;
      gap: 0.75rem;
    }

    .btn {
      padding: 0.625rem 1.25rem;
      border-radius: 0.5rem;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-secondary {
      background: #3b82f6;
      color: white;
      border: none;
    }

    .btn-secondary:hover {
      background: #2563eb;
    }

    .btn-outline {
      background: transparent;
      border: 2px solid #d1d5db;
      color: #374151;
    }

    .btn-outline:hover {
      border-color: #9ca3af;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: white;
      padding: 1.5rem;
      border-radius: 1rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .stat-icon {
      width: 50px;
      height: 50px;
      border-radius: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
    }

    .stat-icon.employees { background: #dbeafe; }
    .stat-icon.present { background: #dcfce7; }
    .stat-icon.faces { background: #fef3c7; }

    .stat-info {
      display: flex;
      flex-direction: column;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1f2937;
    }

    .stat-label {
      font-size: 0.875rem;
      color: #6b7280;
    }

    .nav-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .nav-card {
      background: white;
      padding: 1.5rem;
      border-radius: 1rem;
      text-decoration: none;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      transition: all 0.2s;
    }

    .nav-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .nav-icon {
      font-size: 2rem;
      margin-bottom: 0.75rem;
    }

    .nav-card h3 {
      color: #1f2937;
      margin-bottom: 0.5rem;
    }

    .nav-card p {
      color: #6b7280;
      font-size: 0.875rem;
    }

    .today-section {
      background: white;
      padding: 1.5rem;
      border-radius: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .today-section h2 {
      font-size: 1.25rem;
      color: #1f2937;
      margin-bottom: 1rem;
    }

    .no-records {
      color: #6b7280;
      text-align: center;
      padding: 2rem;
    }

    .attendance-table {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }

    th {
      font-weight: 600;
      color: #374151;
      background: #f9fafb;
    }

    .status {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .status.present { background: #dcfce7; color: #166534; }
    .status.late { background: #fef3c7; color: #92400e; }
    .status.absent { background: #fee2e2; color: #991b1b; }
  `],
})
export class DashboardComponent implements OnInit {
  readonly authService = inject(AuthService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly employeeService = inject(EmployeeService);

  readonly employees = signal<Employee[]>([]);
  readonly todayAttendance = signal<AttendanceRecord[]>([]);

  readonly totalEmployees = signal(0);
  readonly presentToday = signal(0);
  readonly withFaceRegistered = signal(0);

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.employeeService.getAll().subscribe((employees) => {
      this.employees.set(employees);
      this.totalEmployees.set(employees.length);
      this.withFaceRegistered.set(employees.filter((e) => e.has_face_registered).length);
    });

    this.attendanceService.getTodayAttendance().subscribe((records) => {
      this.todayAttendance.set(records);
      this.presentToday.set(records.length);
    });
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      present: 'Presente',
      late: 'Tarde',
      absent: 'Ausente',
      early_leave: 'Salida temprana',
    };
    return labels[status] || status;
  }

  logout(): void {
    this.authService.logout();
  }
}
