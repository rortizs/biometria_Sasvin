import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EmployeeService } from '../../../../core/services/employee.service';
import { Employee, EmployeeCreate } from '../../../../core/models/employee.model';

@Component({
  selector: 'app-employees',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="employees-page">
      <header class="header">
        <div>
          <a routerLink="/admin/dashboard" class="back-link">← Dashboard</a>
          <h1>Empleados</h1>
        </div>
        <button class="btn btn-primary" (click)="showModal.set(true)">
          + Nuevo Empleado
        </button>
      </header>

      <!-- Employees table -->
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Departamento</th>
              <th>Puesto</th>
              <th>Rostro</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            @for (employee of employees(); track employee.id) {
              <tr>
                <td>{{ employee.employee_code }}</td>
                <td>{{ employee.first_name }} {{ employee.last_name }}</td>
                <td>{{ employee.department || '-' }}</td>
                <td>{{ employee.position || '-' }}</td>
                <td>
                  @if (employee.has_face_registered) {
                    <span class="badge success">Registrado</span>
                  } @else {
                    <span class="badge warning">Pendiente</span>
                  }
                </td>
                <td>
                  <div class="actions">
                    <button
                      class="btn btn-sm"
                      (click)="registerFace(employee)"
                      [disabled]="employee.has_face_registered"
                    >
                      📷 Registrar Rostro
                    </button>
                    <button
                      class="btn btn-sm btn-danger"
                      (click)="deleteEmployee(employee)"
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Create modal -->
      @if (showModal()) {
        <div class="modal-overlay" (click)="showModal.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <h2>Nuevo Empleado</h2>
            <form (ngSubmit)="createEmployee()">
              <div class="form-row">
                <div class="form-group">
                  <label>Código de Empleado</label>
                  <input [(ngModel)]="newEmployee.employee_code" name="code" required />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Nombre</label>
                  <input [(ngModel)]="newEmployee.first_name" name="firstName" required />
                </div>
                <div class="form-group">
                  <label>Apellido</label>
                  <input [(ngModel)]="newEmployee.last_name" name="lastName" required />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Departamento</label>
                  <input [(ngModel)]="newEmployee.department" name="department" />
                </div>
                <div class="form-group">
                  <label>Puesto</label>
                  <input [(ngModel)]="newEmployee.position" name="position" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Email</label>
                  <input type="email" [(ngModel)]="newEmployee.email" name="email" />
                </div>
                <div class="form-group">
                  <label>Teléfono</label>
                  <input [(ngModel)]="newEmployee.phone" name="phone" />
                </div>
              </div>
              <div class="modal-actions">
                <button type="button" class="btn btn-secondary" (click)="showModal.set(false)">
                  Cancelar
                </button>
                <button type="submit" class="btn btn-primary">Crear</button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Face registration modal -->
      @if (showFaceModal()) {
        <div class="modal-overlay" (click)="closeFaceModal()">
          <div class="modal face-modal" (click)="$event.stopPropagation()">
            <h2>Registrar Rostro: {{ selectedEmployee()?.first_name }}</h2>
            <div class="camera-container">
              <video #faceVideo autoplay playsinline muted></video>
              <div class="captured-images">
                @for (img of capturedImages(); track $index) {
                  <img [src]="img" alt="Captured" />
                }
              </div>
            </div>
            <p class="instructions">
              Capture {{ 3 - capturedImages().length }} foto(s) más desde diferentes ángulos
            </p>
            <div class="modal-actions">
              <button class="btn btn-secondary" (click)="closeFaceModal()">Cancelar</button>
              <button
                class="btn btn-primary"
                (click)="captureImage()"
                [disabled]="capturedImages().length >= 3"
              >
                Capturar ({{ capturedImages().length }}/3)
              </button>
              <button
                class="btn btn-success"
                (click)="saveFaces()"
                [disabled]="capturedImages().length < 1"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .employees-page {
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

    .btn {
      padding: 0.625rem 1.25rem;
      border-radius: 0.5rem;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }

    .btn-primary {
      background: #3b82f6;
      color: white;
    }

    .btn-primary:hover {
      background: #2563eb;
    }

    .btn-secondary {
      background: #e5e7eb;
      color: #374151;
    }

    .btn-success {
      background: #22c55e;
      color: white;
    }

    .btn-danger {
      background: #ef4444;
      color: white;
    }

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.875rem;
    }

    .table-container {
      background: white;
      border-radius: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      overflow: hidden;
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

    .badge {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .badge.success { background: #dcfce7; color: #166534; }
    .badge.warning { background: #fef3c7; color: #92400e; }

    .actions {
      display: flex;
      gap: 0.5rem;
    }

    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 50;
    }

    .modal {
      background: white;
      padding: 2rem;
      border-radius: 1rem;
      width: 100%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal h2 {
      margin-bottom: 1.5rem;
      color: #1f2937;
    }

    .form-row {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
    }

    .form-group label {
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: #374151;
    }

    .form-group input {
      padding: 0.625rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 1rem;
    }

    .form-group input:focus {
      outline: none;
      border-color: #3b82f6;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }

    .face-modal {
      max-width: 600px;
    }

    .camera-container {
      background: #000;
      border-radius: 0.5rem;
      overflow: hidden;
      margin-bottom: 1rem;
    }

    .camera-container video {
      width: 100%;
      height: 300px;
      object-fit: cover;
      transform: scaleX(-1);
    }

    .captured-images {
      display: flex;
      gap: 0.5rem;
      padding: 0.5rem;
      background: #1f2937;
    }

    .captured-images img {
      width: 80px;
      height: 80px;
      object-fit: cover;
      border-radius: 0.25rem;
    }

    .instructions {
      text-align: center;
      color: #6b7280;
      margin-bottom: 1rem;
    }
  `],
})
export class EmployeesComponent implements OnInit {
  private readonly employeeService = inject(EmployeeService);

  readonly employees = signal<Employee[]>([]);
  readonly showModal = signal(false);
  readonly showFaceModal = signal(false);
  readonly selectedEmployee = signal<Employee | null>(null);
  readonly capturedImages = signal<string[]>([]);

  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;

  newEmployee: EmployeeCreate = {
    employee_code: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    department: '',
    position: '',
  };

  ngOnInit(): void {
    this.loadEmployees();
  }

  loadEmployees(): void {
    this.employeeService.getAll({ active_only: false }).subscribe((employees) => {
      this.employees.set(employees);
    });
  }

  createEmployee(): void {
    this.employeeService.create(this.newEmployee).subscribe({
      next: () => {
        this.showModal.set(false);
        this.resetForm();
        this.loadEmployees();
      },
      error: (err) => {
        alert(err.error?.detail || 'Error al crear empleado');
      },
    });
  }

  deleteEmployee(employee: Employee): void {
    if (confirm(`¿Eliminar a ${employee.first_name} ${employee.last_name}?`)) {
      this.employeeService.delete(employee.id).subscribe(() => {
        this.loadEmployees();
      });
    }
  }

  async registerFace(employee: Employee): Promise<void> {
    this.selectedEmployee.set(employee);
    this.capturedImages.set([]);
    this.showFaceModal.set(true);

    await this.startCamera();
  }

  private async startCamera(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });

      setTimeout(() => {
        this.videoElement = document.querySelector('.face-modal video');
        if (this.videoElement) {
          this.videoElement.srcObject = this.stream;
        }
      }, 100);
    } catch (error) {
      alert('No se pudo acceder a la cámara');
      this.closeFaceModal();
    }
  }

  captureImage(): void {
    if (!this.videoElement) return;

    const canvas = document.createElement('canvas');
    canvas.width = this.videoElement.videoWidth;
    canvas.height = this.videoElement.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(this.videoElement, 0, 0);
    const image = canvas.toDataURL('image/jpeg', 0.8);

    this.capturedImages.update((images) => [...images, image]);
  }

  saveFaces(): void {
    const employee = this.selectedEmployee();
    if (!employee || this.capturedImages().length === 0) return;

    this.employeeService
      .registerFace(employee.id, this.capturedImages())
      .subscribe({
        next: () => {
          alert('Rostro registrado exitosamente');
          this.closeFaceModal();
          this.loadEmployees();
        },
        error: (err) => {
          alert(err.error?.detail || 'Error al registrar rostro');
        },
      });
  }

  closeFaceModal(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.showFaceModal.set(false);
    this.selectedEmployee.set(null);
    this.capturedImages.set([]);
  }

  private resetForm(): void {
    this.newEmployee = {
      employee_code: '',
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      department: '',
      position: '',
    };
  }
}
