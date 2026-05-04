import { Component, OnInit, ViewChild, ElementRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NotificationBellComponent } from '../../../../core/components/notification-bell/notification-bell.component';
import { forkJoin } from 'rxjs';
import { EmployeeService } from '../../../../core/services/employee.service';
import { PositionService } from '../../../../core/services/position.service';
import { DepartmentService } from '../../../../core/services/department.service';
import { LocationService } from '../../../../core/services/location.service';
import { CameraService } from '../../../../core/services/camera.service';
import { LivenessService } from '../../../../core/services/liveness.service';
import { Employee, EmployeeCreate } from '../../../../core/models/employee.model';
import { Position } from '../../../../core/models/position.model';
import { Department } from '../../../../core/models/department.model';
import { Location } from '../../../../core/models/location.model';

@Component({
  selector: 'app-employees',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NotificationBellComponent],
  template: `
    <div class="employees-page">
      <header class="header">
        <div>
          <a routerLink="/admin/dashboard" class="back-link">← Dashboard</a>
          <h1>Empleados</h1>
        </div>
        <div class="header-right">
          <app-notification-bell />
          <button class="btn btn-primary" (click)="openCreateModal()">
            + Nuevo Empleado
          </button>
        </div>
      </header>

      <!-- Desktop table -->
      <div class="table-container">
        <table class="desktop-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Email</th>
              <th>Departamento</th>
              <th>Puesto</th>
              <th>Sede</th>
              <th>Rostro</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            @for (employee of employees(); track employee.id) {
              <tr>
                <td>{{ employee.employee_code }}</td>
                <td>{{ employee.first_name }} {{ employee.last_name }}</td>
                <td>{{ employee.email }}</td>
                <td>{{ getDepartmentName(employee.department_id) }}</td>
                <td>{{ getPositionName(employee.position_id) }}</td>
                <td>{{ getLocationName(employee.location_id) }}</td>
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
                      class="btn btn-sm btn-edit"
                      (click)="editEmployee(employee)"
                      title="Editar"
                    >
                      ✏️
                    </button>
                    <button
                      class="btn btn-sm"
                      (click)="registerFace(employee)"
                      [disabled]="employee.has_face_registered"
                      title="Registrar rostro"
                    >
                      📷
                    </button>
                    <button
                      class="btn btn-sm btn-danger"
                      (click)="deleteEmployee(employee)"
                      title="Eliminar"
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>

        <!-- Mobile cards (visible only on <=480px) -->
        <div class="mobile-cards">
          @for (employee of employees(); track employee.id) {
            <div class="mobile-employee-card">
              <div class="mobile-card-header">
                <div class="mobile-card-title">
                  <span class="mobile-emp-code">{{ employee.employee_code }}</span>
                  <span class="mobile-emp-name">{{ employee.first_name }} {{ employee.last_name }}</span>
                </div>
                @if (employee.has_face_registered) {
                  <span class="badge success">Registrado</span>
                } @else {
                  <span class="badge warning">Pendiente</span>
                }
              </div>
              <div class="mobile-card-body">
                <div class="mobile-field">
                  <span class="mobile-label">Email</span>
                  <span class="mobile-value mobile-email">{{ employee.email }}</span>
                </div>
                <div class="mobile-field">
                  <span class="mobile-label">Departamento</span>
                  <span class="mobile-value">{{ getDepartmentName(employee.department_id) }}</span>
                </div>
                <div class="mobile-field">
                  <span class="mobile-label">Puesto</span>
                  <span class="mobile-value">{{ getPositionName(employee.position_id) }}</span>
                </div>
                <div class="mobile-field">
                  <span class="mobile-label">Sede</span>
                  <span class="mobile-value">{{ getLocationName(employee.location_id) }}</span>
                </div>
              </div>
              <div class="mobile-card-actions">
                <button
                  class="btn btn-sm btn-edit"
                  (click)="editEmployee(employee)"
                  title="Editar"
                >
                  ✏️ Editar
                </button>
                <button
                  class="btn btn-sm"
                  (click)="registerFace(employee)"
                  [disabled]="employee.has_face_registered"
                  title="Registrar rostro"
                >
                  📷 Rostro
                </button>
                <button
                  class="btn btn-sm btn-danger"
                  (click)="deleteEmployee(employee)"
                  title="Eliminar"
                >
                  🗑️
                </button>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Create/Edit modal -->
      @if (showModal()) {
        <div class="modal-overlay" (click)="closeModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <h2>{{ editMode() ? 'Editar Empleado' : 'Nuevo Empleado' }}</h2>
            <form (ngSubmit)="saveEmployee()">
              <div class="form-row">
                <div class="form-group">
                  <label>Código de Empleado *</label>
                  <input [(ngModel)]="newEmployee.employee_code" name="code" required [disabled]="editMode()" />
                </div>
                <div class="form-group">
                  <label>Email *</label>
                  <input type="email" [(ngModel)]="newEmployee.email" name="email" required />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Nombre *</label>
                  <input [(ngModel)]="newEmployee.first_name" name="firstName" required />
                </div>
                <div class="form-group">
                  <label>Apellido *</label>
                  <input [(ngModel)]="newEmployee.last_name" name="lastName" required />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Departamento</label>
                  <select [(ngModel)]="newEmployee.department_id" name="department">
                    <option [ngValue]="null">-- Seleccionar --</option>
                    @for (dept of departments(); track dept.id) {
                      <option [ngValue]="dept.id">{{ dept.name }}</option>
                    }
                  </select>
                </div>
                <div class="form-group">
                  <label>Puesto</label>
                  <select [(ngModel)]="newEmployee.position_id" name="position">
                    <option [ngValue]="null">-- Seleccionar --</option>
                    @for (pos of positions(); track pos.id) {
                      <option [ngValue]="pos.id">{{ pos.name }}</option>
                    }
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Sede</label>
                  <select [(ngModel)]="newEmployee.location_id" name="location">
                    <option [ngValue]="null">-- Seleccionar --</option>
                    @for (loc of locations(); track loc.id) {
                      <option [ngValue]="loc.id">{{ loc.name }}</option>
                    }
                  </select>
                </div>
                <div class="form-group">
                  <label>Teléfono</label>
                  <input [(ngModel)]="newEmployee.phone" name="phone" />
                </div>
              </div>
              <div class="modal-actions">
                <button type="button" class="btn btn-secondary" (click)="closeModal()">
                  Cancelar
                </button>
                <button type="submit" class="btn btn-primary">
                  {{ editMode() ? 'Guardar' : 'Crear' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Face registration modal -->
      @if (showFaceModal()) {
        <div class="bio-overlay">
          <div class="bio-panel" (click)="$event.stopPropagation()">

            <!-- Header -->
            <div class="bio-header">
              <div class="bio-logo">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2a5 5 0 1 0 5 5A5 5 0 0 0 12 2zm0 8a3 3 0 1 1 3-3 3 3 0 0 1-3 3zm9 11v-1a7 7 0 0 0-7-7h-4a7 7 0 0 0-7 7v1"/>
                </svg>
                REGISTRO BIOMÉTRICO
              </div>
              <div class="bio-employee">{{ selectedEmployee()?.first_name }} {{ selectedEmployee()?.last_name }}</div>
            </div>

            <!-- Step indicator bar -->
            <div class="bio-steps">
              @for (step of faceSteps; track $index) {
                <div class="bio-step"
                     [class.bio-step--active]="faceStep() === $index"
                     [class.bio-step--done]="faceStep() > $index">
                  <div class="bio-step__dot">
                    @if (faceStep() > $index) {
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                    } @else {
                      {{ $index + 1 }}
                    }
                  </div>
                  <span class="bio-step__label">{{ step.label }}</span>
                </div>
                @if ($index < faceSteps.length - 1) {
                  <div class="bio-step__line" [class.bio-step__line--done]="faceStep() > $index"></div>
                }
              }
            </div>

            <!-- Camera zone -->
            <div class="bio-camera">
              <video #faceVideo autoplay playsinline muted></video>

              <!-- Corner brackets -->
              <div class="bio-bracket bio-bracket--tl"></div>
              <div class="bio-bracket bio-bracket--tr"></div>
              <div class="bio-bracket bio-bracket--bl"></div>
              <div class="bio-bracket bio-bracket--br"></div>

              <!-- Face oval -->
              <div class="bio-oval" [class.bio-oval--ok]="stepCaptured()">
                <div class="bio-oval__inner"></div>
              </div>

              <!-- Instruction overlay (visible cuando NO está contando ni capturando) -->
              @if (!counting() && !stepCaptured()) {
                <div class="bio-instruction">
                  <div class="bio-direction">
                    @switch (faceSteps[faceStep()].arrow) {
                      @case ('😐') {
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                      }
                      @case ('👉') {
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                      }
                      @case ('👈') {
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                      }
                      @case ('👆') {
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                      }
                      @case ('👇') {
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
                      }
                    }
                  </div>
                  <p class="bio-instruction__text">{{ faceSteps[faceStep()].instruction }}</p>
                </div>
              }

              <!-- Countdown overlay -->
              @if (counting()) {
                <div class="bio-countdown">
                  <svg class="bio-countdown__ring" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="8"/>
                    <circle cx="60" cy="60" r="54" fill="none" stroke="#3b82f6" stroke-width="8"
                            stroke-linecap="round" stroke-dasharray="339.3"
                            [attr.stroke-dashoffset]="339.3 * (1 - countdownValue() / 10)"
                            style="transform: rotate(-90deg); transform-origin: center; transition: stroke-dashoffset 0.9s linear;"/>
                  </svg>
                  <span class="bio-countdown__number">{{ countdownValue() }}</span>
                  <p class="bio-countdown__label">{{ faceSteps[faceStep()].instruction }}</p>
                </div>
              }

              <!-- Capture success flash -->
              @if (stepCaptured()) {
                <div class="bio-flash">
                  <div class="bio-flash__icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <p class="bio-flash__text">Ángulo {{ faceSteps[faceStep()].label }} capturado</p>
                </div>
              }

              <!-- Scan line animation (idle state) -->
              @if (!counting() && !stepCaptured()) {
                <div class="bio-scanline"></div>
              }
            </div>

            <!-- Thumbnails strip -->
            <div class="bio-thumbs">
              @for (step of faceSteps; track $index) {
                <div class="bio-thumb" [class.bio-thumb--done]="capturedImages().length > $index"
                                      [class.bio-thumb--active]="faceStep() === $index && capturedImages().length <= $index">
                  @if (capturedImages().length > $index) {
                    <img [src]="capturedImages()[$index]" [alt]="step.label" />
                    <div class="bio-thumb__check">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                  } @else {
                    <div class="bio-thumb__empty">{{ $index + 1 }}</div>
                  }
                  <span class="bio-thumb__label">{{ step.label }}</span>
                </div>
              }
            </div>

            <!-- Status bar -->
            <div class="bio-status" [class.bio-status--error]="statusIsError()"
                                    [class.bio-status--success]="!statusIsError() && capturedImages().length === 5">
              <div class="bio-status__dot"></div>
              <span>{{ statusMsg() }}</span>
            </div>

            <!-- Actions -->
            <div class="bio-actions">
              <button class="bio-btn bio-btn--ghost" (click)="closeFaceModal()" [disabled]="saving()">
                Cancelar
              </button>
              @if (capturedImages().length < 5 && !counting() && !stepCaptured()) {
                <button class="bio-btn bio-btn--primary" (click)="startCountdown()">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                  {{ faceStep() === 0 ? 'Iniciar captura' : 'Siguiente ángulo' }}
                </button>
              }
              @if (capturedImages().length === 5 && !saving()) {
                <button class="bio-btn bio-btn--confirm" (click)="saveFaces()">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  Confirmar registro
                </button>
              }
              @if (saving()) {
                <button class="bio-btn bio-btn--confirm" disabled>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  Procesando...
                </button>
              }
            </div>

          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .employees-page {
      min-height: 100dvh;
      background: #f3f4f6;
      padding: 2rem;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 2rem;
      flex-wrap: wrap;
      gap: 1rem;
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

    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover { background: #2563eb; }
    .btn-secondary { background: #e5e7eb; color: #374151; }
    .btn-success { background: #22c55e; color: white; }
    .btn-danger { background: #ef4444; color: white; }
    .btn-edit { background: #f59e0b; color: white; }
    .btn-edit:hover { background: #d97706; }
    .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.875rem; }

    .table-container {
      background: white;
      border-radius: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      overflow-x: auto;
    }

    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 1rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; color: #374151; }

    .badge { padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; }
    .badge.success { background: #dcfce7; color: #166534; }
    .badge.warning { background: #fef3c7; color: #92400e; }

    .actions { display: flex; gap: 0.5rem; }

    /* Mobile cards — hidden on desktop */
    .mobile-cards {
      display: none;
    }

    .mobile-employee-card {
      border-bottom: 1px solid #e5e7eb;
      padding: 1rem;
    }

    .mobile-employee-card:last-child {
      border-bottom: none;
    }

    .mobile-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.75rem;
      gap: 0.5rem;
    }

    .mobile-card-title {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .mobile-emp-code {
      font-size: 0.75rem;
      color: #6b7280;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .mobile-emp-name {
      font-size: 1rem;
      font-weight: 600;
      color: #1f2937;
    }

    .mobile-card-body {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .mobile-field {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.875rem;
    }

    .mobile-label {
      color: #6b7280;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.025em;
      flex-shrink: 0;
    }

    .mobile-value {
      color: #374151;
      text-align: right;
    }

    .mobile-email {
      font-size: 0.8125rem;
      word-break: break-all;
    }

    .mobile-card-actions {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
    }

    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 50;
      padding: 1rem;
    }

    .modal {
      background: white;
      padding: 2rem;
      border-radius: 1rem;
      width: 100%;
      max-width: 720px;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal h2 { margin-bottom: 1.5rem; color: #1f2937; }

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

    .form-group input,
    .form-group select {
      padding: 0.625rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 1rem;
    }

    .form-group input:focus,
    .form-group select:focus {
      outline: none;
      border-color: #3b82f6;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }

    /* ════════════════════════════════════════════
       BIOMETRIC PANEL — Dark professional design
       ════════════════════════════════════════════ */

    .bio-overlay {
      position: fixed; inset: 0; z-index: 100;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(6px);
      display: flex; align-items: center; justify-content: center;
      padding: 1rem;
    }

    .bio-panel {
      background: #0f172a;
      border: 1px solid rgba(59, 130, 246, 0.25);
      border-radius: 1.25rem;
      width: 100%; max-width: 580px;
      padding: 1.75rem;
      box-shadow: 0 0 60px rgba(59, 130, 246, 0.12), 0 25px 50px rgba(0,0,0,0.5);
    }

    /* Header */
    .bio-header {
      display: flex; flex-direction: column; align-items: center;
      gap: 0.35rem; margin-bottom: 1.5rem;
    }
    .bio-logo {
      display: flex; align-items: center; gap: 0.5rem;
      font-size: 0.7rem; font-weight: 700; letter-spacing: 0.15em;
      color: #3b82f6; text-transform: uppercase;
    }
    .bio-employee {
      font-size: 1.1rem; font-weight: 600; color: #f1f5f9;
    }

    /* Steps */
    .bio-steps {
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 1.25rem; gap: 0;
    }
    .bio-step { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
    .bio-step__dot {
      width: 32px; height: 32px; border-radius: 50%;
      border: 2px solid #334155;
      display: flex; align-items: center; justify-content: center;
      font-size: 0.8rem; font-weight: 700; color: #475569;
      background: #1e293b; transition: all 0.3s;
    }
    .bio-step__label { font-size: 0.65rem; color: #475569; font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase; }
    .bio-step__line { flex: 1; height: 2px; background: #1e293b; min-width: 24px; max-width: 40px; margin-bottom: 1.2rem; transition: background 0.3s; }
    .bio-step__line--done { background: #22c55e; }
    .bio-step--active .bio-step__dot { border-color: #3b82f6; color: white; background: #3b82f6; box-shadow: 0 0 12px rgba(59,130,246,0.5); }
    .bio-step--active .bio-step__label { color: #3b82f6; }
    .bio-step--done .bio-step__dot { border-color: #22c55e; color: white; background: #22c55e; }
    .bio-step--done .bio-step__label { color: #22c55e; }

    /* Camera zone */
    .bio-camera {
      position: relative; background: #020617;
      border-radius: 0.875rem; overflow: hidden;
      aspect-ratio: 4/3; margin-bottom: 1.25rem;
      border: 1px solid rgba(59,130,246,0.15);
    }
    .bio-camera video {
      width: 100%; height: 100%; object-fit: cover;
      transform: scaleX(-1); display: block;
    }

    /* Corner brackets */
    .bio-bracket {
      position: absolute; width: 28px; height: 28px;
      border-color: #3b82f6; border-style: solid; pointer-events: none;
    }
    .bio-bracket--tl { top: 12px; left: 12px; border-width: 3px 0 0 3px; border-radius: 3px 0 0 0; }
    .bio-bracket--tr { top: 12px; right: 12px; border-width: 3px 3px 0 0; border-radius: 0 3px 0 0; }
    .bio-bracket--bl { bottom: 12px; left: 12px; border-width: 0 0 3px 3px; border-radius: 0 0 0 3px; }
    .bio-bracket--br { bottom: 12px; right: 12px; border-width: 0 3px 3px 0; border-radius: 0 0 3px 0; }

    /* Face oval */
    .bio-oval {
      position: absolute; inset: 0; margin: auto;
      width: 52%; aspect-ratio: 3/4;
      border-radius: 50%; pointer-events: none;
      transition: all 0.4s;
      box-shadow: 0 0 0 2px rgba(59,130,246,0.5), inset 0 0 0 2px rgba(59,130,246,0.5);
    }
    .bio-oval__inner {
      position: absolute; inset: -8px; border-radius: 50%;
      border: 1px dashed rgba(59,130,246,0.3);
    }
    .bio-oval--ok {
      box-shadow: 0 0 0 2px #22c55e, inset 0 0 0 2px #22c55e,
                  0 0 20px rgba(34,197,94,0.4);
    }
    .bio-oval--ok .bio-oval__inner { border-color: rgba(34,197,94,0.4); }

    /* Scan line */
    .bio-scanline {
      position: absolute; left: 0; right: 0; height: 2px;
      background: linear-gradient(90deg, transparent, #3b82f6, transparent);
      animation: scan 3s ease-in-out infinite;
      pointer-events: none;
    }
    @keyframes scan { 0%{top:20%} 50%{top:80%} 100%{top:20%} }

    /* Instruction overlay */
    .bio-instruction {
      position: absolute; bottom: 0; left: 0; right: 0;
      padding: 1.5rem 1rem 1rem;
      background: linear-gradient(to top, rgba(2,6,23,0.9) 0%, transparent 100%);
      display: flex; flex-direction: column; align-items: center; gap: 0.4rem;
    }
    .bio-direction {
      width: 52px; height: 52px; border-radius: 50%;
      background: rgba(59,130,246,0.2); border: 2px solid rgba(59,130,246,0.5);
      display: flex; align-items: center; justify-content: center;
      color: #60a5fa; animation: pulse-dir 1.5s ease-in-out infinite;
    }
    @keyframes pulse-dir { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
    .bio-instruction__text {
      font-size: 1rem; font-weight: 600; color: #f1f5f9;
      text-align: center; text-shadow: 0 1px 4px rgba(0,0,0,0.8);
      margin: 0; letter-spacing: 0.01em;
    }

    /* Countdown */
    .bio-countdown {
      position: absolute; inset: 0;
      background: rgba(2,6,23,0.7);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 0.75rem;
    }
    .bio-countdown__ring { width: 120px; height: 120px; }
    .bio-countdown__number {
      position: absolute;
      font-size: 2.75rem; font-weight: 800; color: white;
      letter-spacing: -0.02em;
    }
    .bio-countdown__label {
      font-size: 0.875rem; color: #94a3b8; font-weight: 500;
      text-align: center; max-width: 240px; margin: 0;
      position: absolute; bottom: 1.5rem; left: 0; right: 0;
    }

    /* Capture flash */
    .bio-flash {
      position: absolute; inset: 0;
      background: rgba(5,46,22,0.6);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 0.75rem;
    }
    .bio-flash__icon {
      width: 72px; height: 72px; border-radius: 50%;
      background: #22c55e;
      display: flex; align-items: center; justify-content: center;
      color: white;
      box-shadow: 0 0 0 16px rgba(34,197,94,0.2);
      animation: pop 0.3s cubic-bezier(0.175,0.885,0.32,1.275);
    }
    @keyframes pop { 0%{transform:scale(0.5)} 100%{transform:scale(1)} }
    .bio-flash__text {
      font-size: 1rem; font-weight: 700; color: #86efac;
      text-shadow: 0 1px 4px rgba(0,0,0,0.8); margin: 0;
    }

    /* Thumbnails */
    .bio-thumbs {
      display: flex; gap: 0.5rem; justify-content: center;
      margin-bottom: 1rem;
    }
    .bio-thumb {
      display: flex; flex-direction: column; align-items: center;
      gap: 0.3rem; position: relative;
    }
    .bio-thumb img {
      width: 76px; height: 76px; object-fit: cover;
      border-radius: 0.5rem; border: 2px solid #22c55e;
      filter: brightness(0.9);
    }
    .bio-thumb__empty {
      width: 76px; height: 76px; border-radius: 0.5rem;
      border: 1px dashed #334155; background: #1e293b;
      display: flex; align-items: center; justify-content: center;
      font-size: 1rem; font-weight: 700; color: #334155;
      transition: all 0.3s;
    }
    .bio-thumb--active .bio-thumb__empty {
      border-color: #3b82f6; color: #3b82f6;
      box-shadow: 0 0 8px rgba(59,130,246,0.25);
    }
    .bio-thumb__check {
      position: absolute; top: -5px; right: -5px;
      width: 18px; height: 18px; border-radius: 50%;
      background: #22c55e; display: flex;
      align-items: center; justify-content: center; color: white;
    }
    .bio-thumb__label {
      font-size: 0.6rem; font-weight: 600; letter-spacing: 0.05em;
      text-transform: uppercase; color: #475569;
    }
    .bio-thumb--done .bio-thumb__label { color: #22c55e; }
    .bio-thumb--active .bio-thumb__label { color: #3b82f6; }

    /* Status bar */
    .bio-status {
      display: flex; align-items: center; gap: 0.5rem;
      background: #1e293b; border-radius: 0.5rem; padding: 0.6rem 0.875rem;
      margin-bottom: 1rem; border: 1px solid #334155;
      font-size: 0.825rem; color: #94a3b8;
    }
    .bio-status__dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #3b82f6; flex-shrink: 0;
      box-shadow: 0 0 6px #3b82f6;
      animation: blink 2s ease-in-out infinite;
    }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    .bio-status--error { border-color: rgba(239,68,68,0.3); }
    .bio-status--error .bio-status__dot { background: #ef4444; box-shadow: 0 0 6px #ef4444; }
    .bio-status--error span { color: #fca5a5; }
    .bio-status--success { border-color: rgba(34,197,94,0.3); }
    .bio-status--success .bio-status__dot { background: #22c55e; box-shadow: 0 0 6px #22c55e; animation: none; }
    .bio-status--success span { color: #86efac; }

    /* Action buttons */
    .bio-actions {
      display: flex; justify-content: flex-end; gap: 0.75rem;
    }
    .bio-btn {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.625rem 1.25rem; border-radius: 0.5rem;
      font-size: 0.875rem; font-weight: 600; cursor: pointer;
      border: none; transition: all 0.2s; letter-spacing: 0.01em;
    }
    .bio-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .bio-btn--ghost { background: transparent; border: 1px solid #334155; color: #94a3b8; }
    .bio-btn--ghost:hover:not(:disabled) { border-color: #475569; color: #cbd5e1; }
    .bio-btn--primary { background: #1d4ed8; color: white; box-shadow: 0 0 12px rgba(29,78,216,0.35); }
    .bio-btn--primary:hover:not(:disabled) { background: #2563eb; box-shadow: 0 0 16px rgba(37,99,235,0.5); }
    .bio-btn--confirm { background: #15803d; color: white; box-shadow: 0 0 12px rgba(21,128,61,0.35); }
    .bio-btn--confirm:hover:not(:disabled) { background: #16a34a; box-shadow: 0 0 16px rgba(22,163,74,0.5); }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }

    /* Responsive */
    @media (max-width: 768px) {
      .employees-page {
        padding: 1rem;
      }

      .header {
        align-items: flex-start;
      }

      h1 {
        font-size: 1.5rem;
      }

      th, td {
        padding: 0.75rem 0.625rem;
        font-size: 0.875rem;
      }
    }

    @media (max-width: 600px) {
      .form-row {
        grid-template-columns: 1fr;
      }

      .modal {
        padding: 1.25rem;
      }

      .bio-panel {
        padding: 1.25rem;
      }

      .bio-thumb img,
      .bio-thumb__empty {
        width: 56px;
        height: 56px;
      }
    }

    @media (max-width: 480px) {
      .employees-page {
        padding: 0.75rem;
      }

      /* Hide table, show cards */
      .desktop-table {
        display: none;
      }

      .mobile-cards {
        display: block;
      }

      .modal {
        padding: 1rem;
      }

      .modal-actions {
        flex-direction: column-reverse;
      }

      .modal-actions .btn {
        width: 100%;
        text-align: center;
      }

      .bio-actions {
        flex-wrap: wrap;
      }

      .bio-btn {
        flex: 1;
        justify-content: center;
      }
    }
  `],
})
export class EmployeesComponent implements OnInit {
  private readonly employeeService = inject(EmployeeService);
  private readonly positionService = inject(PositionService);
  private readonly departmentService = inject(DepartmentService);
  private readonly locationService = inject(LocationService);
  private readonly cameraService = inject(CameraService);
  private readonly livenessService = inject(LivenessService);

  readonly employees = signal<Employee[]>([]);
  readonly positions = signal<Position[]>([]);
  readonly departments = signal<Department[]>([]);
  readonly locations = signal<Location[]>([]);
  readonly showModal = signal(false);
  readonly showFaceModal = signal(false);

  // Face registration — liveness flow
  readonly faceStep = signal(0);
  readonly capturedImages = signal<string[]>([]);
  readonly counting = signal(false);
  readonly countdownValue = signal(10);
  readonly stepCaptured = signal(false);
  readonly statusMsg = signal('Posicioná tu rostro dentro del óvalo y presioná Iniciar captura');
  readonly statusIsError = signal(false);
  readonly saving = signal(false);

  private countdownTimer: any = null;
  private flashTimer: any = null;

  readonly faceSteps = [
    { label: 'Frente',    arrow: '😐', instruction: 'Mirá directo a la cámara, sin mover la cabeza' },
    { label: 'Derecha',   arrow: '👉', instruction: 'Girá la cabeza lentamente hacia la derecha' },
    { label: 'Izquierda', arrow: '👈', instruction: 'Girá la cabeza lentamente hacia la izquierda' },
    { label: 'Arriba',    arrow: '👆', instruction: 'Levantá levemente la vista hacia arriba' },
    { label: 'Abajo',     arrow: '👇', instruction: 'Bajá levemente la vista hacia abajo' },
  ];
  readonly selectedEmployee = signal<Employee | null>(null);
  readonly modalMode = signal<'create' | 'edit'>('create');
  readonly editMode = signal<boolean>(false);
  readonly editingEmployeeId = signal<string | null>(null);

  @ViewChild('faceVideo') faceVideoRef!: ElementRef<HTMLVideoElement>;

  newEmployee: EmployeeCreate = {
    employee_code: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    department_id: null,
    position_id: null,
    location_id: null,
  };

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    forkJoin({
      employees: this.employeeService.getAll({ active_only: false }),
      positions: this.positionService.getPositions(),
      departments: this.departmentService.getDepartments(),
      locations: this.locationService.getLocations(),
    }).subscribe(({ employees, positions, departments, locations }) => {
      this.employees.set(employees);
      this.positions.set(positions);
      this.departments.set(departments);
      this.locations.set(locations);
    });
  }

  getDepartmentName(id: string | null): string {
    if (!id) return '-';
    const dept = this.departments().find(d => d.id === id);
    return dept?.name || '-';
  }

  getPositionName(id: string | null): string {
    if (!id) return '-';
    const pos = this.positions().find(p => p.id === id);
    return pos?.name || '-';
  }

  getLocationName(id: string | null): string {
    if (!id) return '-';
    const loc = this.locations().find(l => l.id === id);
    return loc?.name || '-';
  }

  openCreateModal(): void {
    this.editMode.set(false);
    this.editingEmployeeId.set(null);
    this.resetForm();
    this.showModal.set(true);
  }

  editEmployee(employee: Employee): void {
    this.editMode.set(true);
    this.editingEmployeeId.set(employee.id);
    this.newEmployee = {
      employee_code: employee.employee_code,
      first_name: employee.first_name,
      last_name: employee.last_name,
      email: employee.email,
      phone: employee.phone || '',
      department_id: employee.department_id,
      position_id: employee.position_id,
      location_id: employee.location_id,
    };
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editMode.set(false);
    this.editingEmployeeId.set(null);
    this.resetForm();
  }

  saveEmployee(): void {
    if (this.editMode()) {
      this.updateEmployee();
    } else {
      this.createEmployee();
    }
  }

  private createEmployee(): void {
    this.employeeService.create(this.newEmployee).subscribe({
      next: () => {
        this.closeModal();
        this.loadData();
      },
      error: (err) => {
        alert(err.error?.detail || 'Error al crear empleado');
      },
    });
  }

  private updateEmployee(): void {
    const id = this.editingEmployeeId();
    if (!id) return;

    const updateData = {
      first_name: this.newEmployee.first_name,
      last_name: this.newEmployee.last_name,
      email: this.newEmployee.email,
      phone: this.newEmployee.phone || undefined,
      department_id: this.newEmployee.department_id,
      position_id: this.newEmployee.position_id,
      location_id: this.newEmployee.location_id,
    };

    this.employeeService.update(id, updateData).subscribe({
      next: () => {
        this.closeModal();
        this.loadData();
      },
      error: (err) => {
        alert(err.error?.detail || 'Error al actualizar empleado');
      },
    });
  }

  deleteEmployee(employee: Employee): void {
    if (confirm(`¿Eliminar a ${employee.first_name} ${employee.last_name}?`)) {
      this.employeeService.delete(employee.id).subscribe(() => {
        this.loadData();
      });
    }
  }

  async registerFace(employee: Employee): Promise<void> {
    this.selectedEmployee.set(employee);
    this.capturedImages.set([]);
    this.faceStep.set(0);
    this.counting.set(false);
    this.stepCaptured.set(false);
    this.saving.set(false);
    this.statusIsError.set(false);
    this.statusMsg.set('Posicioná tu rostro dentro del óvalo y presioná "Iniciar captura" — se tomarán 5 fotos guiadas');
    this.showFaceModal.set(true);
    setTimeout(async () => {
      if (this.faceVideoRef?.nativeElement) {
        try {
          await this.cameraService.start(this.faceVideoRef.nativeElement);
        } catch {
          alert('No se pudo acceder a la cámara');
          this.closeFaceModal();
        }
      }
    }, 150);
  }

  startCountdown(): void {
    if (this.counting()) return;
    const step = this.faceStep();
    this.counting.set(true);
    this.countdownValue.set(10);
    this.statusMsg.set(this.faceSteps[step].instruction);
    this.statusIsError.set(false);

    this.countdownTimer = setInterval(() => {
      const val = this.countdownValue() - 1;
      if (val <= 0) {
        clearInterval(this.countdownTimer);
        this.captureCurrentStep();
      } else {
        this.countdownValue.set(val);
      }
    }, 1000);
  }

  private captureCurrentStep(): void {
    const frame = this.cameraService.captureFrame();
    this.counting.set(false);

    if (!frame) {
      this.statusMsg.set('No se detectó imagen. Intentá de nuevo.');
      this.statusIsError.set(true);
      return;
    }

    this.capturedImages.update(imgs => [...imgs, frame]);
    this.stepCaptured.set(true);
    this.statusMsg.set(`✓ Ángulo ${this.faceSteps[this.faceStep()].label} capturado`);
    this.statusIsError.set(false);

    // Flash verde por 1.2s, luego avanzar al siguiente paso
    this.flashTimer = setTimeout(async () => {
      this.stepCaptured.set(false);
      const nextStep = this.faceStep() + 1;
      if (nextStep < this.faceSteps.length) {
        this.faceStep.set(nextStep);
        this.statusMsg.set(this.faceSteps[nextStep].instruction + ' y presioná Capturar');
        this.statusIsError.set(false);
      } else {
        this.statusMsg.set('¡Perfecto! Verificando variación entre fotos...');
        await this.verifyLiveness();
      }
    }, 1200);
  }

  private async verifyLiveness(): Promise<void> {
    const images = this.capturedImages();
    if (images.length < 2) return;

    const result = await this.livenessService.analyzeLiveness(images);

    if (!result.isLive) {
      this.statusMsg.set('⚠️ Se detectaron imágenes estáticas. Asegurate de que sea tu rostro real y mové la cabeza en cada paso e intentá de nuevo.');
      this.statusIsError.set(true);
      this.capturedImages.set([]);
      this.faceStep.set(0);
    } else {
      this.statusMsg.set('✓ Verificación exitosa. Podés guardar el registro.');
      this.statusIsError.set(false);
    }
  }

  saveFaces(): void {
    const employee = this.selectedEmployee();
    if (!employee || this.capturedImages().length < 5) return;
    this.saving.set(true);

    this.employeeService.registerFace(employee.id, this.capturedImages()).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeFaceModal();
        this.loadData();
      },
      error: (err) => {
        this.saving.set(false);
        this.statusMsg.set(err.error?.detail || 'Error al registrar rostro');
        this.statusIsError.set(true);
      },
    });
  }

  closeFaceModal(): void {
    clearInterval(this.countdownTimer);
    clearTimeout(this.flashTimer);
    this.cameraService.stop();
    this.showFaceModal.set(false);
    this.selectedEmployee.set(null);
    this.capturedImages.set([]);
    this.faceStep.set(0);
    this.counting.set(false);
    this.stepCaptured.set(false);
    this.saving.set(false);
  }

  private resetForm(): void {
    this.newEmployee = {
      employee_code: '',
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      department_id: null,
      position_id: null,
      location_id: null,
    };
  }
}
