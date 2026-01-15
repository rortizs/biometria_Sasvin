import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ScheduleService } from '../../../../core/services/schedule.service';
import { EmployeeService } from '../../../../core/services/employee.service';
import { DepartmentService } from '../../../../core/services/department.service';
import {
  SchedulePattern,
  SchedulePatternCreate,
  CalendarEmployee,
  CalendarDay,
  CalendarFilters,
  BulkScheduleAssignment,
  ScheduleExceptionCreate,
  ExceptionType,
  EXCEPTION_TYPE_LABELS,
} from '../../../../core/models/schedule.model';
import { Employee } from '../../../../core/models/employee.model';
import { Department } from '../../../../core/models/department.model';

interface WeekDay {
  date: string;
  dayName: string;
  dayNumber: number;
  monthShort: string;
  isToday: boolean;
}

@Component({
  selector: 'app-schedules',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="schedules-page">
      <!-- Header -->
      <header class="header">
        <div class="header-left">
          <a routerLink="/admin/dashboard" class="back-link">
            <span class="back-icon">&#8592;</span> Dashboard
          </a>
          <h1>Calendario de Horarios</h1>
          <p class="subtitle">Gestion de horarios y asignaciones del personal</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-outline" (click)="exportCalendar()">
            <span class="btn-icon">&#8681;</span> Exportar
          </button>
          <button class="btn btn-outline" (click)="showPatternModal.set(true)">
            <span class="btn-icon">&#9998;</span> Patrones
          </button>
          <button class="btn btn-primary" (click)="refresh()">
            <span class="btn-icon">&#8635;</span> Refrescar
          </button>
        </div>
      </header>

      <!-- Filters -->
      <section class="filters-section">
        <div class="filters-grid">
          <div class="filter-group search-group">
            <label for="search">Buscar</label>
            <input
              id="search"
              type="text"
              placeholder="Nombre o codigo..."
              [(ngModel)]="filters.search"
              (input)="applyFilters()"
            />
          </div>
          <div class="filter-group">
            <label for="department">Departamento</label>
            <select id="department" [(ngModel)]="filters.departmentId" (change)="applyFilters()">
              <option value="">Todos</option>
              @for (dept of departments(); track dept.id) {
                <option [value]="dept.id">{{ dept.name }}</option>
              }
            </select>
          </div>
          <div class="filter-group">
            <label for="employee">Empleado</label>
            <select id="employee" [(ngModel)]="filters.employeeId" (change)="applyFilters()">
              <option value="">Todos</option>
              @for (emp of filteredEmployeesList(); track emp.id) {
                <option [value]="emp.id">{{ emp.first_name }} {{ emp.last_name }}</option>
              }
            </select>
          </div>
          <div class="filter-group">
            <label for="pattern">Horario</label>
            <select id="pattern" [(ngModel)]="filters.patternId" (change)="applyFilters()">
              <option value="">Todos</option>
              @for (pattern of patterns(); track pattern.id) {
                <option [value]="pattern.id">{{ pattern.name }}</option>
              }
            </select>
          </div>
          <div class="filter-group">
            <label for="startDate">Fecha Inicio</label>
            <input
              id="startDate"
              type="date"
              [(ngModel)]="filters.startDate"
              (change)="loadCalendar()"
            />
          </div>
          <div class="filter-group">
            <label for="endDate">Fecha Fin</label>
            <input
              id="endDate"
              type="date"
              [(ngModel)]="filters.endDate"
              (change)="loadCalendar()"
            />
          </div>
        </div>
      </section>

      <!-- Week Navigation -->
      <section class="week-navigation">
        <button class="nav-btn" (click)="previousWeek()">
          <span>&#8592;</span> Semana Anterior
        </button>
        <span class="week-label">{{ weekLabel() }}</span>
        <button class="nav-btn" (click)="nextWeek()">
          Semana Siguiente <span>&#8594;</span>
        </button>
      </section>

      <!-- Loading -->
      @if (loading()) {
        <div class="loading-overlay">
          <div class="spinner"></div>
          <p>Cargando calendario...</p>
        </div>
      }

      <!-- Calendar Grid -->
      <section class="calendar-section">
        <div class="calendar-container">
          <table class="calendar-table">
            <thead>
              <tr>
                <th class="col-checkbox">
                  <input
                    type="checkbox"
                    [checked]="allSelected()"
                    (change)="toggleSelectAll($event)"
                  />
                </th>
                <th class="col-id">ID</th>
                <th class="col-name">Nombre</th>
                <th class="col-lastname">Apellido</th>
                <th class="col-department">Nivel Org.</th>
                <th class="col-pattern">Patron</th>
                @for (day of weekDays(); track day.date) {
                  <th class="col-day" [class.today]="day.isToday">
                    <div class="day-header">
                      <span class="day-name">{{ day.dayName }}</span>
                      <span class="day-date">{{ day.monthShort }} {{ day.dayNumber }}</span>
                    </div>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @if (filteredCalendar().length === 0 && !loading()) {
                <tr>
                  <td [attr.colspan]="6 + weekDays().length" class="no-data">
                    No hay empleados para mostrar
                  </td>
                </tr>
              }
              @for (employee of filteredCalendar(); track employee.employee_id) {
                <tr [class.selected]="isSelected(employee.employee_id)">
                  <td class="col-checkbox">
                    <input
                      type="checkbox"
                      [checked]="isSelected(employee.employee_id)"
                      (change)="toggleSelect(employee.employee_id)"
                    />
                  </td>
                  <td class="col-id">{{ employee.employee_code }}</td>
                  <td class="col-name">{{ employee.first_name }}</td>
                  <td class="col-lastname">{{ employee.last_name }}</td>
                  <td class="col-department">{{ employee.department_name || '-' }}</td>
                  <td class="col-pattern">{{ employee.default_schedule_name || '-' }}</td>
                  @for (day of employee.days; track day.date; let dayIdx = $index) {
                    <td
                      class="col-day-cell"
                      [style.background-color]="getCellBackground(day)"
                      [class.day-off]="day.is_day_off"
                      [class.exception]="day.exception_type"
                      [class.selected-cell]="isCellSelected(employee.employee_id, day.date)"
                      (click)="selectCell(employee.employee_id, day.date, $event)"
                    >
                      @if (day.exception_type) {
                        <span class="exception-label">{{ getExceptionLabel(day.exception_type) }}</span>
                      } @else if (day.is_day_off) {
                        <span class="day-off-label">Libre</span>
                      } @else if (day.check_in && day.check_out) {
                        <span class="schedule-time">
                          {{ formatTime(day.check_in) }} | {{ formatTime(day.check_out) }}
                        </span>
                      } @else {
                        <span class="no-schedule">-</span>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <!-- Bulk Actions -->
      @if (selectedEmployees().length > 0) {
        <section class="bulk-actions">
          <span class="selected-count">{{ selectedEmployees().length }} empleado(s) seleccionado(s)</span>
          <div class="bulk-buttons">
            <button class="btn btn-secondary" (click)="showAssignModal.set(true)">
              Asignar Horario
            </button>
            <button class="btn btn-warning" (click)="showExceptionModal.set(true)">
              Crear Excepcion
            </button>
            <button class="btn btn-outline" (click)="clearSelection()">
              Limpiar Seleccion
            </button>
          </div>
        </section>
      }

      <!-- Pattern Modal -->
      @if (showPatternModal()) {
        <div class="modal-overlay" (click)="closePatternModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>Patrones de Horario</h2>
              <button class="close-btn" (click)="closePatternModal()">&#10005;</button>
            </div>
            <div class="modal-body">
              <!-- Pattern List -->
              <div class="pattern-list">
                @for (pattern of patterns(); track pattern.id) {
                  <div class="pattern-item" [style.border-left-color]="pattern.color">
                    <div class="pattern-info">
                      <span class="pattern-name">{{ pattern.name }}</span>
                      <span class="pattern-time">
                        {{ formatTime(pattern.check_in_time) }} - {{ formatTime(pattern.check_out_time) }}
                      </span>
                    </div>
                    <div class="pattern-actions">
                      <button class="icon-btn" (click)="editPattern(pattern)">&#9998;</button>
                      <button class="icon-btn danger" (click)="deletePattern(pattern.id)">&#128465;</button>
                    </div>
                  </div>
                }
              </div>

              <!-- New/Edit Pattern Form -->
              <div class="pattern-form">
                <h3>{{ editingPattern() ? 'Editar' : 'Nuevo' }} Patron</h3>
                <div class="form-grid">
                  <div class="form-group">
                    <label for="patternName">Nombre</label>
                    <input id="patternName" type="text" [(ngModel)]="patternForm.name" />
                  </div>
                  <div class="form-group">
                    <label for="patternColor">Color</label>
                    <input id="patternColor" type="color" [(ngModel)]="patternForm.color" />
                  </div>
                  <div class="form-group">
                    <label for="patternCheckIn">Entrada</label>
                    <input id="patternCheckIn" type="time" [(ngModel)]="patternForm.check_in_time" />
                  </div>
                  <div class="form-group">
                    <label for="patternCheckOut">Salida</label>
                    <input id="patternCheckOut" type="time" [(ngModel)]="patternForm.check_out_time" />
                  </div>
                  <div class="form-group">
                    <label for="patternGrace">Tolerancia (min)</label>
                    <input id="patternGrace" type="number" [(ngModel)]="patternForm.grace_minutes" />
                  </div>
                  <div class="form-group full-width">
                    <label for="patternDesc">Descripcion</label>
                    <input id="patternDesc" type="text" [(ngModel)]="patternForm.description" />
                  </div>
                </div>
                <div class="form-actions">
                  @if (editingPattern()) {
                    <button class="btn btn-outline" (click)="cancelEditPattern()">Cancelar</button>
                  }
                  <button class="btn btn-primary" (click)="savePattern()">
                    {{ editingPattern() ? 'Actualizar' : 'Crear' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Assign Schedule Modal -->
      @if (showAssignModal()) {
        <div class="modal-overlay" (click)="closeAssignModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>Asignar Horario</h2>
              <button class="close-btn" (click)="closeAssignModal()">&#10005;</button>
            </div>
            <div class="modal-body">
              <p class="modal-info">
                Asignando horario a <strong>{{ selectedEmployees().length }}</strong> empleado(s)
              </p>
              <div class="form-grid">
                <div class="form-group">
                  <label for="assignPattern">Patron de Horario</label>
                  <select id="assignPattern" [(ngModel)]="assignForm.patternId">
                    <option value="">Seleccione...</option>
                    @for (pattern of patterns(); track pattern.id) {
                      <option [value]="pattern.id">
                        {{ pattern.name }} ({{ formatTime(pattern.check_in_time) }} - {{ formatTime(pattern.check_out_time) }})
                      </option>
                    }
                  </select>
                </div>
                <div class="form-group">
                  <label for="assignDayOff">
                    <input
                      id="assignDayOff"
                      type="checkbox"
                      [(ngModel)]="assignForm.isDayOff"
                    />
                    Marcar como dia libre
                  </label>
                </div>
                <div class="form-group">
                  <label for="assignStartDate">Fecha Inicio</label>
                  <input id="assignStartDate" type="date" [(ngModel)]="assignForm.startDate" />
                </div>
                <div class="form-group">
                  <label for="assignEndDate">Fecha Fin</label>
                  <input id="assignEndDate" type="date" [(ngModel)]="assignForm.endDate" />
                </div>
                <div class="form-group full-width">
                  <label>Dias de la semana</label>
                  <div class="weekday-selector">
                    @for (day of weekdayOptions; track day.value) {
                      <label class="weekday-option">
                        <input
                          type="checkbox"
                          [checked]="assignForm.daysOfWeek.includes(day.value)"
                          (change)="toggleWeekday(day.value)"
                        />
                        {{ day.label }}
                      </label>
                    }
                  </div>
                </div>
              </div>
              <div class="form-actions">
                <button class="btn btn-outline" (click)="closeAssignModal()">Cancelar</button>
                <button class="btn btn-primary" (click)="saveAssignment()">Asignar</button>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Exception Modal -->
      @if (showExceptionModal()) {
        <div class="modal-overlay" (click)="closeExceptionModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>Crear Excepcion</h2>
              <button class="close-btn" (click)="closeExceptionModal()">&#10005;</button>
            </div>
            <div class="modal-body">
              <p class="modal-info">
                Creando excepcion para <strong>{{ selectedEmployees().length }}</strong> empleado(s)
              </p>
              <div class="form-grid">
                <div class="form-group">
                  <label for="exceptionType">Tipo de Excepcion</label>
                  <select id="exceptionType" [(ngModel)]="exceptionForm.type">
                    <option value="vacation">Vacaciones</option>
                    <option value="sick_leave">Incapacidad</option>
                    <option value="holiday">Feriado</option>
                    <option value="permission">Permiso</option>
                    <option value="day_off">Dia Libre</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="exceptionStartDate">Fecha Inicio</label>
                  <input id="exceptionStartDate" type="date" [(ngModel)]="exceptionForm.startDate" />
                </div>
                <div class="form-group">
                  <label for="exceptionEndDate">Fecha Fin</label>
                  <input id="exceptionEndDate" type="date" [(ngModel)]="exceptionForm.endDate" />
                </div>
                <div class="form-group full-width">
                  <label for="exceptionDesc">Descripcion</label>
                  <input id="exceptionDesc" type="text" [(ngModel)]="exceptionForm.description" />
                </div>
              </div>
              <div class="form-actions">
                <button class="btn btn-outline" (click)="closeExceptionModal()">Cancelar</button>
                <button class="btn btn-primary" (click)="saveException()">Crear</button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .schedules-page {
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

    .header-actions {
      display: flex;
      gap: 0.75rem;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.625rem 1rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }

    .btn-icon {
      font-size: 1rem;
    }

    .btn-primary {
      background: #3b82f6;
      color: white;
    }

    .btn-primary:hover {
      background: #2563eb;
    }

    .btn-secondary {
      background: #059669;
      color: white;
    }

    .btn-secondary:hover {
      background: #047857;
    }

    .btn-warning {
      background: #f59e0b;
      color: white;
    }

    .btn-warning:hover {
      background: #d97706;
    }

    .btn-outline {
      background: white;
      color: #374151;
      border: 1px solid #d1d5db;
    }

    .btn-outline:hover {
      background: #f3f4f6;
    }

    /* Filters */
    .filters-section {
      background: white;
      border-radius: 1rem;
      padding: 1.25rem;
      margin-bottom: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .filters-grid {
      display: grid;
      grid-template-columns: 1.5fr repeat(5, 1fr);
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
      padding: 0.5rem 0.75rem;
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

    /* Week Navigation */
    .week-navigation {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: white;
      padding: 0.75rem 1.25rem;
      border-radius: 0.75rem;
      margin-bottom: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .nav-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: #f3f4f6;
      border: none;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      color: #374151;
      cursor: pointer;
      transition: all 0.2s;
    }

    .nav-btn:hover {
      background: #e5e7eb;
    }

    .week-label {
      font-weight: 600;
      color: #1f2937;
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
      margin-bottom: 1rem;
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

    /* Calendar Grid */
    .calendar-section {
      background: white;
      border-radius: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    .calendar-container {
      overflow-x: auto;
    }

    .calendar-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 1200px;
    }

    .calendar-table th,
    .calendar-table td {
      padding: 0.625rem 0.5rem;
      text-align: left;
      border-bottom: 1px solid #f3f4f6;
      font-size: 0.8125rem;
    }

    .calendar-table thead th {
      background: #f9fafb;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.025em;
      font-size: 0.6875rem;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .col-checkbox {
      width: 40px;
      text-align: center;
    }

    .col-id {
      width: 80px;
    }

    .col-name,
    .col-lastname {
      width: 120px;
    }

    .col-department {
      width: 140px;
    }

    .col-pattern {
      width: 120px;
    }

    .col-day {
      min-width: 100px;
      text-align: center;
    }

    .col-day.today {
      background: #eff6ff;
    }

    .day-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.125rem;
    }

    .day-name {
      font-weight: 600;
      text-transform: capitalize;
    }

    .day-date {
      font-size: 0.625rem;
      color: #9ca3af;
    }

    .col-day-cell {
      text-align: center;
      cursor: pointer;
      transition: all 0.15s;
      border-left: 1px solid #f3f4f6;
    }

    .col-day-cell:hover {
      filter: brightness(0.95);
    }

    .col-day-cell.selected-cell {
      outline: 2px solid #3b82f6;
      outline-offset: -2px;
    }

    .schedule-time {
      font-size: 0.75rem;
      font-weight: 500;
      color: #1f2937;
      white-space: nowrap;
    }

    .day-off-label {
      font-size: 0.75rem;
      color: #6b7280;
      font-style: italic;
    }

    .exception-label {
      font-size: 0.6875rem;
      font-weight: 600;
      color: white;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }

    .no-schedule {
      color: #d1d5db;
    }

    .no-data {
      text-align: center;
      padding: 2rem;
      color: #6b7280;
    }

    tbody tr {
      transition: background-color 0.15s;
    }

    tbody tr:hover {
      background-color: #fafafa;
    }

    tbody tr.selected {
      background-color: #eff6ff;
    }

    /* Bulk Actions */
    .bulk-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #1e3a5f;
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 0.75rem;
      margin-top: 1rem;
      box-shadow: 0 4px 12px rgba(30, 58, 95, 0.3);
    }

    .selected-count {
      font-weight: 500;
    }

    .bulk-buttons {
      display: flex;
      gap: 0.75rem;
    }

    .bulk-actions .btn-outline {
      background: transparent;
      border-color: rgba(255, 255, 255, 0.3);
      color: white;
    }

    .bulk-actions .btn-outline:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    /* Modals */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 1rem;
    }

    .modal {
      background: white;
      border-radius: 1rem;
      width: 100%;
      max-width: 600px;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid #e5e7eb;
    }

    .modal-header h2 {
      font-size: 1.25rem;
      font-weight: 600;
      color: #1f2937;
      margin: 0;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.25rem;
      color: #6b7280;
      cursor: pointer;
      padding: 0.25rem;
      line-height: 1;
    }

    .close-btn:hover {
      color: #1f2937;
    }

    .modal-body {
      padding: 1.5rem;
      overflow-y: auto;
    }

    .modal-info {
      margin-bottom: 1.5rem;
      color: #6b7280;
    }

    /* Pattern List */
    .pattern-list {
      margin-bottom: 1.5rem;
      max-height: 200px;
      overflow-y: auto;
    }

    .pattern-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      border-left: 4px solid;
      background: #f9fafb;
      margin-bottom: 0.5rem;
      border-radius: 0 0.5rem 0.5rem 0;
    }

    .pattern-info {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .pattern-name {
      font-weight: 500;
      color: #1f2937;
    }

    .pattern-time {
      font-size: 0.8125rem;
      color: #6b7280;
    }

    .pattern-actions {
      display: flex;
      gap: 0.5rem;
    }

    .icon-btn {
      background: none;
      border: none;
      font-size: 1rem;
      color: #6b7280;
      cursor: pointer;
      padding: 0.25rem;
    }

    .icon-btn:hover {
      color: #1f2937;
    }

    .icon-btn.danger:hover {
      color: #dc2626;
    }

    /* Form */
    .pattern-form h3 {
      font-size: 1rem;
      font-weight: 600;
      color: #374151;
      margin-bottom: 1rem;
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .form-group.full-width {
      grid-column: span 2;
    }

    .form-group label {
      font-size: 0.8125rem;
      font-weight: 500;
      color: #374151;
    }

    .form-group input,
    .form-group select {
      padding: 0.625rem 0.75rem;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      color: #1f2937;
    }

    .form-group input:focus,
    .form-group select:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }

    .form-group input[type="color"] {
      padding: 0.25rem;
      height: 40px;
      cursor: pointer;
    }

    .form-group input[type="checkbox"] {
      width: auto;
      margin-right: 0.5rem;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid #e5e7eb;
    }

    /* Weekday Selector */
    .weekday-selector {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .weekday-option {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.8125rem;
      cursor: pointer;
    }

    /* Responsive */
    @media (max-width: 1200px) {
      .filters-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    @media (max-width: 768px) {
      .schedules-page {
        padding: 1rem;
      }

      .header {
        flex-direction: column;
        gap: 1rem;
      }

      .header-actions {
        width: 100%;
        flex-wrap: wrap;
      }

      .header-actions .btn {
        flex: 1;
        justify-content: center;
      }

      .filters-grid {
        grid-template-columns: 1fr;
      }

      .week-navigation {
        flex-direction: column;
        gap: 0.75rem;
      }

      .bulk-actions {
        flex-direction: column;
        gap: 1rem;
      }

      .bulk-buttons {
        flex-wrap: wrap;
        justify-content: center;
      }

      .form-grid {
        grid-template-columns: 1fr;
      }

      .form-group.full-width {
        grid-column: span 1;
      }
    }
  `],
})
export class SchedulesComponent implements OnInit {
  private readonly scheduleService = inject(ScheduleService);
  private readonly employeeService = inject(EmployeeService);
  private readonly departmentService = inject(DepartmentService);

  // State signals
  readonly calendar = signal<CalendarEmployee[]>([]);
  readonly patterns = signal<SchedulePattern[]>([]);
  readonly employees = signal<Employee[]>([]);
  readonly departments = signal<Department[]>([]);
  readonly loading = signal(false);
  readonly selectedEmployees = signal<string[]>([]);
  readonly selectedCells = signal<Map<string, Set<string>>>(new Map());

  // Modal states
  readonly showPatternModal = signal(false);
  readonly showAssignModal = signal(false);
  readonly showExceptionModal = signal(false);
  readonly editingPattern = signal<SchedulePattern | null>(null);

  // Filters
  filters: CalendarFilters = {
    search: '',
    departmentId: '',
    employeeId: '',
    patternId: '',
    startDate: this.getWeekStart(new Date()),
    endDate: this.getWeekEnd(new Date()),
  };

  // Forms
  patternForm = this.getEmptyPatternForm();
  assignForm = this.getEmptyAssignForm();
  exceptionForm = this.getEmptyExceptionForm();

  // Weekday options for bulk assignment
  readonly weekdayOptions = [
    { value: 0, label: 'Lun' },
    { value: 1, label: 'Mar' },
    { value: 2, label: 'Mie' },
    { value: 3, label: 'Jue' },
    { value: 4, label: 'Vie' },
    { value: 5, label: 'Sab' },
    { value: 6, label: 'Dom' },
  ];

  // Computed values
  readonly weekDays = computed<WeekDay[]>(() => {
    const days: WeekDay[] = [];
    const start = new Date(this.filters.startDate);
    const end = new Date(this.filters.endDate);
    const today = new Date().toISOString().split('T')[0];

    const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      days.push({
        date: dateStr,
        dayName: dayNames[d.getDay()],
        dayNumber: d.getDate(),
        monthShort: monthNames[d.getMonth()],
        isToday: dateStr === today,
      });
    }
    return days;
  });

  readonly weekLabel = computed(() => {
    const start = new Date(this.filters.startDate);
    const end = new Date(this.filters.endDate);
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    return `${start.toLocaleDateString('es', options)} - ${end.toLocaleDateString('es', options)}, ${end.getFullYear()}`;
  });

  readonly filteredEmployeesList = computed(() => {
    const deptId = this.filters.departmentId;
    if (!deptId) return this.employees();
    return this.employees().filter((e) => e.department_id === deptId);
  });

  readonly filteredCalendar = computed(() => {
    let result = this.calendar();

    // Filter by search
    if (this.filters.search) {
      const search = this.filters.search.toLowerCase();
      result = result.filter(
        (e) =>
          e.first_name.toLowerCase().includes(search) ||
          e.last_name.toLowerCase().includes(search) ||
          e.employee_code.toLowerCase().includes(search)
      );
    }

    // Filter by department
    if (this.filters.departmentId) {
      const deptEmployeeIds = new Set(
        this.employees()
          .filter((e) => e.department_id === this.filters.departmentId)
          .map((e) => e.id)
      );
      result = result.filter((e) => deptEmployeeIds.has(e.employee_id));
    }

    // Filter by employee
    if (this.filters.employeeId) {
      result = result.filter((e) => e.employee_id === this.filters.employeeId);
    }

    // Filter by pattern
    if (this.filters.patternId) {
      const pattern = this.patterns().find((p) => p.id === this.filters.patternId);
      if (pattern) {
        result = result.filter((e) => e.default_schedule_name === pattern.name);
      }
    }

    return result;
  });

  readonly allSelected = computed(() => {
    const filtered = this.filteredCalendar();
    if (filtered.length === 0) return false;
    return filtered.every((e) => this.selectedEmployees().includes(e.employee_id));
  });

  ngOnInit(): void {
    this.loadInitialData();
  }

  private loadInitialData(): void {
    this.loading.set(true);

    forkJoin({
      employees: this.employeeService.getAll({ active_only: true }),
      departments: this.departmentService.getDepartments(true),
      patterns: this.scheduleService.getPatterns(true),
    }).subscribe({
      next: ({ employees, departments, patterns }) => {
        this.employees.set(employees);
        this.departments.set(departments);
        this.patterns.set(patterns);
        this.loadCalendar();
      },
      error: (err) => {
        console.error('Error loading initial data:', err);
        this.loading.set(false);
      },
    });
  }

  loadCalendar(): void {
    this.loading.set(true);

    this.scheduleService.getCalendar(this.filters.startDate, this.filters.endDate).subscribe({
      next: (response) => {
        this.calendar.set(response.employees);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading calendar:', err);
        this.loading.set(false);
      },
    });
  }

  refresh(): void {
    this.loadInitialData();
  }

  applyFilters(): void {
    // Filters are applied through computed signals, just trigger change detection
  }

  // Week Navigation
  previousWeek(): void {
    const start = new Date(this.filters.startDate);
    start.setDate(start.getDate() - 7);
    this.filters.startDate = this.getWeekStart(start);
    this.filters.endDate = this.getWeekEnd(start);
    this.loadCalendar();
  }

  nextWeek(): void {
    const start = new Date(this.filters.startDate);
    start.setDate(start.getDate() + 7);
    this.filters.startDate = this.getWeekStart(start);
    this.filters.endDate = this.getWeekEnd(start);
    this.loadCalendar();
  }

  // Selection
  toggleSelectAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      const ids = this.filteredCalendar().map((e) => e.employee_id);
      this.selectedEmployees.set(ids);
    } else {
      this.selectedEmployees.set([]);
    }
  }

  toggleSelect(employeeId: string): void {
    const current = this.selectedEmployees();
    if (current.includes(employeeId)) {
      this.selectedEmployees.set(current.filter((id) => id !== employeeId));
    } else {
      this.selectedEmployees.set([...current, employeeId]);
    }
  }

  isSelected(employeeId: string): boolean {
    return this.selectedEmployees().includes(employeeId);
  }

  selectCell(employeeId: string, date: string, event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey) {
      // Multi-select cells
      const cells = new Map(this.selectedCells());
      if (!cells.has(employeeId)) {
        cells.set(employeeId, new Set());
      }
      const dates = cells.get(employeeId)!;
      if (dates.has(date)) {
        dates.delete(date);
      } else {
        dates.add(date);
      }
      this.selectedCells.set(cells);
    } else {
      // Single select - also select employee
      if (!this.isSelected(employeeId)) {
        this.selectedEmployees.update((ids) => [...ids, employeeId]);
      }
    }
  }

  isCellSelected(employeeId: string, date: string): boolean {
    return this.selectedCells().get(employeeId)?.has(date) ?? false;
  }

  clearSelection(): void {
    this.selectedEmployees.set([]);
    this.selectedCells.set(new Map());
  }

  // Cell Styling
  getCellBackground(day: CalendarDay): string {
    if (day.exception_type) {
      return this.getExceptionColor(day.exception_type);
    }
    if (day.is_day_off) {
      return '#E5E7EB';
    }
    return day.color || '#F3F4F6';
  }

  getExceptionColor(type: ExceptionType): string {
    const colors: Record<ExceptionType, string> = {
      day_off: '#9CA3AF',
      vacation: '#1E3A5F',
      sick_leave: '#7C3AED',
      holiday: '#DC2626',
      permission: '#F59E0B',
      other: '#6B7280',
    };
    return colors[type] || '#6B7280';
  }

  getExceptionLabel(type: ExceptionType): string {
    return EXCEPTION_TYPE_LABELS[type] || type;
  }

  formatTime(time: string | null): string {
    if (!time) return '-';
    // Handle both "08:00:00" and "08:00" formats
    const parts = time.split(':');
    return `${parts[0]}:${parts[1]}`;
  }

  // Pattern Modal
  closePatternModal(): void {
    this.showPatternModal.set(false);
    this.editingPattern.set(null);
    this.patternForm = this.getEmptyPatternForm();
  }

  editPattern(pattern: SchedulePattern): void {
    this.editingPattern.set(pattern);
    this.patternForm = {
      name: pattern.name,
      description: pattern.description || '',
      check_in_time: this.formatTime(pattern.check_in_time),
      check_out_time: this.formatTime(pattern.check_out_time),
      grace_minutes: pattern.grace_minutes,
      color: pattern.color,
    };
  }

  cancelEditPattern(): void {
    this.editingPattern.set(null);
    this.patternForm = this.getEmptyPatternForm();
  }

  savePattern(): void {
    const editing = this.editingPattern();
    const data: SchedulePatternCreate = {
      name: this.patternForm.name,
      description: this.patternForm.description || undefined,
      check_in_time: this.patternForm.check_in_time + ':00',
      check_out_time: this.patternForm.check_out_time + ':00',
      grace_minutes: this.patternForm.grace_minutes,
      color: this.patternForm.color,
    };

    if (editing) {
      this.scheduleService.updatePattern(editing.id, data).subscribe({
        next: () => {
          this.loadPatterns();
          this.cancelEditPattern();
        },
        error: (err) => console.error('Error updating pattern:', err),
      });
    } else {
      this.scheduleService.createPattern(data).subscribe({
        next: () => {
          this.loadPatterns();
          this.patternForm = this.getEmptyPatternForm();
        },
        error: (err) => console.error('Error creating pattern:', err),
      });
    }
  }

  deletePattern(id: string): void {
    if (confirm('Esta seguro de eliminar este patron?')) {
      this.scheduleService.deletePattern(id).subscribe({
        next: () => this.loadPatterns(),
        error: (err) => console.error('Error deleting pattern:', err),
      });
    }
  }

  private loadPatterns(): void {
    this.scheduleService.getPatterns(true).subscribe({
      next: (patterns) => this.patterns.set(patterns),
      error: (err) => console.error('Error loading patterns:', err),
    });
  }

  // Assign Modal
  closeAssignModal(): void {
    this.showAssignModal.set(false);
    this.assignForm = this.getEmptyAssignForm();
  }

  toggleWeekday(day: number): void {
    const idx = this.assignForm.daysOfWeek.indexOf(day);
    if (idx >= 0) {
      this.assignForm.daysOfWeek.splice(idx, 1);
    } else {
      this.assignForm.daysOfWeek.push(day);
    }
  }

  saveAssignment(): void {
    const bulk: BulkScheduleAssignment = {
      employee_ids: this.selectedEmployees(),
      schedule_pattern_id: this.assignForm.patternId || undefined,
      start_date: this.assignForm.startDate,
      end_date: this.assignForm.endDate,
      days_of_week: this.assignForm.daysOfWeek.length > 0 ? this.assignForm.daysOfWeek : undefined,
      is_day_off: this.assignForm.isDayOff,
    };

    this.scheduleService.createBulkAssignments(bulk).subscribe({
      next: (result) => {
        console.log('Assignments created:', result);
        this.closeAssignModal();
        this.clearSelection();
        this.loadCalendar();
      },
      error: (err) => console.error('Error creating assignments:', err),
    });
  }

  // Exception Modal
  closeExceptionModal(): void {
    this.showExceptionModal.set(false);
    this.exceptionForm = this.getEmptyExceptionForm();
  }

  saveException(): void {
    // Create exception for each selected employee
    const promises = this.selectedEmployees().map((employeeId) => {
      const exception: ScheduleExceptionCreate = {
        employee_id: employeeId,
        exception_type: this.exceptionForm.type as ExceptionType,
        start_date: this.exceptionForm.startDate,
        end_date: this.exceptionForm.endDate,
        description: this.exceptionForm.description || undefined,
      };
      return this.scheduleService.createException(exception).toPromise();
    });

    Promise.all(promises)
      .then(() => {
        this.closeExceptionModal();
        this.clearSelection();
        this.loadCalendar();
      })
      .catch((err) => console.error('Error creating exceptions:', err));
  }

  // Export
  exportCalendar(): void {
    const data = this.filteredCalendar();
    if (data.length === 0) return;

    const days = this.weekDays();
    const headers = ['ID', 'Nombre', 'Apellido', 'Departamento', 'Patron', ...days.map((d) => `${d.dayName} ${d.monthShort} ${d.dayNumber}`)];

    const rows = data.map((emp) => [
      emp.employee_code,
      emp.first_name,
      emp.last_name,
      emp.department_name || '-',
      emp.default_schedule_name || '-',
      ...emp.days.map((day) => {
        if (day.exception_type) return this.getExceptionLabel(day.exception_type);
        if (day.is_day_off) return 'Libre';
        if (day.check_in && day.check_out) return `${this.formatTime(day.check_in)} - ${this.formatTime(day.check_out)}`;
        return '-';
      }),
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `calendario_${this.filters.startDate}_${this.filters.endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Helpers
  private getWeekStart(date: Date): string {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split('T')[0];
  }

  private getWeekEnd(date: Date): string {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? 0 : 7);
    d.setDate(diff);
    return d.toISOString().split('T')[0];
  }

  private getEmptyPatternForm() {
    return {
      name: '',
      description: '',
      check_in_time: '08:00',
      check_out_time: '17:00',
      grace_minutes: 15,
      color: '#4CAF50',
    };
  }

  private getEmptyAssignForm() {
    return {
      patternId: '',
      isDayOff: false,
      startDate: this.filters.startDate,
      endDate: this.filters.endDate,
      daysOfWeek: [0, 1, 2, 3, 4] as number[],
    };
  }

  private getEmptyExceptionForm() {
    return {
      type: 'vacation' as string,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      description: '',
    };
  }
}
