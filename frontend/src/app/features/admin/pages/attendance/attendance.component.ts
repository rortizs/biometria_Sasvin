import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AttendanceService } from '../../../../core/services/attendance.service';
import { AttendanceRecord } from '../../../../core/models/attendance.model';

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DatePipe],
  template: `
    <div class="attendance-page">
      <header class="header">
        <div>
          <a routerLink="/admin/dashboard" class="back-link">← Dashboard</a>
          <h1>Asistencia</h1>
        </div>
        <div class="filters">
          <input
            type="date"
            [(ngModel)]="selectedDate"
            (change)="loadAttendance()"
          />
        </div>
      </header>

      <div class="table-container">
        @if (attendance().length === 0) {
          <p class="no-records">No hay registros para esta fecha</p>
        } @else {
          <table>
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Fecha</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Estado</th>
                <th>Confianza</th>
              </tr>
            </thead>
            <tbody>
              @for (record of attendance(); track record.id) {
                <tr>
                  <td>{{ record.employee_name }}</td>
                  <td>{{ record.record_date | date: 'dd/MM/yyyy' }}</td>
                  <td>{{ record.check_in | date: 'HH:mm' }}</td>
                  <td>{{ record.check_out ? (record.check_out | date: 'HH:mm') : '-' }}</td>
                  <td>
                    <span class="status" [class]="record.status">
                      {{ getStatusLabel(record.status) }}
                    </span>
                  </td>
                  <td>{{ record.confidence ? ((record.confidence * 100) | number: '1.0-0') + '%' : '-' }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
  styles: [`
    .attendance-page {
      min-height: 100vh;
      background: #f3f4f6;
      padding: 2rem;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 2rem;
    }

    .back-link {
      color: #6b7280;
      text-decoration: none;
      font-size: 0.875rem;
    }

    h1 {
      font-size: 1.8rem;
      color: #1f2937;
    }

    .filters input {
      padding: 0.625rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 1rem;
    }

    .table-container {
      background: white;
      border-radius: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    .no-records {
      text-align: center;
      padding: 3rem;
      color: #6b7280;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      padding: 1rem;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }

    th {
      background: #f9fafb;
      font-weight: 600;
      color: #374151;
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
    .status.early_leave { background: #dbeafe; color: #1e40af; }
  `],
})
export class AttendanceComponent implements OnInit {
  private readonly attendanceService = inject(AttendanceService);

  readonly attendance = signal<AttendanceRecord[]>([]);
  selectedDate = new Date().toISOString().split('T')[0];

  ngOnInit(): void {
    this.loadAttendance();
  }

  loadAttendance(): void {
    this.attendanceService
      .getAttendance({ record_date: this.selectedDate })
      .subscribe((records) => {
        this.attendance.set(records);
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
}
