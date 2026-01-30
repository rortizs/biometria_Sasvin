import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { LeaveBalanceService } from '../../../../core/services/leave-balance.service';
import { DepartmentService } from '../../../../core/services/department.service';
import { EmployeeService } from '../../../../core/services/employee.service';
import { Department } from '../../../../core/models/department.model';
import { Employee } from '../../../../core/models/employee.model';
import {
  LeavePolicy,
  LeavePolicyCreate,
  LeavePolicyUpdate,
  EmployeeBalanceSummary,
  EmployeeBalanceDetail,
  LeaveTransaction,
  formatBalance,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_COLORS,
  LEAVE_UNIT_LABELS,
  ACCRUAL_TYPE_LABELS,
  AccrualType,
  LeaveUnit,
} from '../../../../core/models/leave-balance.model';

@Component({
  selector: 'app-leave-balances',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="leave-balances-page">
      <header class="header">
        <div>
          <a routerLink="/admin/dashboard" class="back-link">← Dashboard</a>
          <h1>Saldos Laborales</h1>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" (click)="openBulkAccrualModal()">
            Acreditacion Masiva
          </button>
          <button class="btn btn-primary" (click)="openPoliciesModal()">
            Configurar Politicas
          </button>
        </div>
      </header>

      <!-- Filters -->
      <div class="filters-container">
        <div class="filter-group">
          <label>Buscar</label>
          <input
            type="text"
            [(ngModel)]="filters.search"
            placeholder="Nombre o codigo..."
            (input)="onSearchChange()"
          />
        </div>
        <div class="filter-group">
          <label>Tipo de Saldo</label>
          <select [(ngModel)]="filters.policyId" (change)="loadBalances()">
            <option value="">Todos</option>
            @for (policy of policies(); track policy.id) {
              <option [value]="policy.id">{{ policy.name }}</option>
            }
          </select>
        </div>
        <div class="filter-group">
          <label>Departamento</label>
          <select [(ngModel)]="filters.departmentId" (change)="loadBalances()">
            <option value="">Todos</option>
            @for (dept of departments(); track dept.id) {
              <option [value]="dept.id">{{ dept.name }}</option>
            }
          </select>
        </div>
        <div class="filter-group">
          <label>Periodo</label>
          <select [(ngModel)]="filters.periodYear" (change)="loadBalances()">
            @for (year of availableYears(); track year) {
              <option [value]="year">{{ year }}</option>
            }
          </select>
        </div>
      </div>

      <!-- Warning if no policies loaded -->
      @if (policies().length === 0 && !loading()) {
        <div class="alert alert-warning">
          No se cargaron las politicas de saldo. Verifique que las migraciones se ejecutaron
          correctamente o contacte al administrador del sistema.
        </div>
      }

      <!-- Main Table -->
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th class="expand-col"></th>
              <th>Codigo</th>
              <th>Nombre</th>
              <th>Departamento</th>
              @for (policy of policies(); track policy.id) {
                <th class="balance-col" [style.border-left]="'3px solid ' + policy.color">
                  {{ policy.name }}
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (employee of balanceSummaries(); track employee.employee_id) {
              <tr
                class="employee-row"
                [class.expanded]="isExpanded(employee.employee_id)"
                (click)="toggleExpand(employee)"
              >
                <td class="expand-col">
                  <span class="expand-icon">
                    {{ isExpanded(employee.employee_id) ? '▼' : '▶' }}
                  </span>
                </td>
                <td>{{ employee.employee_code }}</td>
                <td>{{ employee.first_name }} {{ employee.last_name }}</td>
                <td>{{ employee.department_name || '-' }}</td>
                @for (policy of policies(); track policy.id) {
                  <td class="balance-col">
                    @if (getBalanceForPolicy(employee, policy.id); as balance) {
                      <div class="balance-display" [style.color]="policy.color">
                        <span class="balance-available">
                          {{ formatBalanceValue(balance.available_balance, balance.policy_unit) }}
                        </span>
                        <span class="balance-used">
                          ({{ formatBalanceValue(balance.used_amount, balance.policy_unit) }} usados)
                        </span>
                      </div>
                    } @else {
                      <span class="no-balance">-</span>
                    }
                  </td>
                }
              </tr>
              <!-- Expanded Detail Row -->
              @if (isExpanded(employee.employee_id) && expandedDetail()) {
                <tr class="detail-row">
                  <td [attr.colspan]="4 + policies().length">
                    <div class="detail-container">
                      <div class="detail-header">
                        <h3>
                          Historial: {{ expandedDetail()!.balance.policy_name }}
                          - {{ expandedDetail()!.first_name }} {{ expandedDetail()!.last_name }}
                        </h3>
                        <div class="detail-info">
                          <span>Antiguedad: {{ expandedDetail()!.years_of_service }} anios</span>
                          @if (expandedDetail()!.hire_date) {
                            <span>Ingreso: {{ expandedDetail()!.hire_date | date:'dd/MM/yyyy' }}</span>
                          }
                        </div>
                      </div>

                      <div class="balance-summary">
                        <div class="summary-card">
                          <span class="label">Inicial</span>
                          <span class="value">
                            {{ formatBalanceValue(
                              expandedDetail()!.balance.initial_balance,
                              expandedDetail()!.balance.policy_unit
                            ) }}
                          </span>
                        </div>
                        <div class="summary-card">
                          <span class="label">Arrastre</span>
                          <span class="value">
                            {{ formatBalanceValue(
                              expandedDetail()!.balance.carryover_amount,
                              expandedDetail()!.balance.policy_unit
                            ) }}
                          </span>
                        </div>
                        <div class="summary-card">
                          <span class="label">Usado</span>
                          <span class="value used">
                            {{ formatBalanceValue(
                              expandedDetail()!.balance.used_amount,
                              expandedDetail()!.balance.policy_unit
                            ) }}
                          </span>
                        </div>
                        <div class="summary-card highlight">
                          <span class="label">Disponible</span>
                          <span class="value">
                            {{ formatBalanceValue(
                              expandedDetail()!.balance.available_balance,
                              expandedDetail()!.balance.policy_unit
                            ) }}
                          </span>
                        </div>
                      </div>

                      <!-- Transactions Table -->
                      <div class="transactions-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Fecha</th>
                              <th>Tipo</th>
                              <th>Cantidad</th>
                              <th>Fecha Inicio</th>
                              <th>Fecha Fin</th>
                              <th>Descripcion</th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (trans of expandedDetail()!.transactions; track trans.id) {
                              <tr>
                                <td>{{ trans.created_at | date:'dd/MM/yyyy HH:mm' }}</td>
                                <td>
                                  <span
                                    class="trans-type"
                                    [style.background]="getTransactionColor(trans.transaction_type)"
                                  >
                                    {{ getTransactionLabel(trans.transaction_type) }}
                                  </span>
                                </td>
                                <td
                                  [class.positive]="trans.transaction_type === 'credit'"
                                  [class.negative]="trans.transaction_type === 'debit'"
                                >
                                  {{ trans.transaction_type === 'debit' ? '-' : '+' }}
                                  {{ formatBalanceValue(trans.amount, expandedDetail()!.balance.policy_unit) }}
                                </td>
                                <td>{{ trans.usage_start_date | date:'dd/MM/yyyy' }}</td>
                                <td>{{ trans.usage_end_date | date:'dd/MM/yyyy' }}</td>
                                <td>{{ trans.description || '-' }}</td>
                              </tr>
                            } @empty {
                              <tr>
                                <td colspan="6" class="empty-row">Sin movimientos</td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>

                      <div class="detail-actions">
                        <button class="btn btn-sm btn-primary" (click)="openAddTransactionModal()">
                          + Agregar Movimiento
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              }
            } @empty {
              <tr>
                <td [attr.colspan]="4 + policies().length" class="empty-table">
                  No se encontraron empleados con saldos
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (loading()) {
        <div class="loading-overlay">
          <div class="spinner"></div>
        </div>
      }

      <!-- Bulk Accrual Modal -->
      @if (showBulkAccrualModal()) {
        <div class="modal-overlay" (click)="closeBulkAccrualModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <h2>Acreditacion Masiva de Saldos</h2>
            <form (ngSubmit)="executeBulkAccrual()">
              <div class="form-group">
                <label>Tipo de Saldo *</label>
                <select [(ngModel)]="bulkAccrual.policy_id" name="policyId" required>
                  <option value="">-- Seleccionar --</option>
                  @for (policy of policies(); track policy.id) {
                    <option [value]="policy.id">{{ policy.name }}</option>
                  }
                </select>
              </div>
              <div class="form-group">
                <label>Periodo (Anio) *</label>
                <input
                  type="number"
                  [(ngModel)]="bulkAccrual.period_year"
                  name="periodYear"
                  required
                  min="2020"
                  max="2100"
                />
              </div>
              <p class="info-text">
                Se acreditaran los saldos a todos los empleados activos
                segun la configuracion de la politica seleccionada.
              </p>
              <div class="modal-actions">
                <button type="button" class="btn btn-secondary" (click)="closeBulkAccrualModal()">
                  Cancelar
                </button>
                <button type="submit" class="btn btn-primary">
                  Ejecutar Acreditacion
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Policies Modal -->
      @if (showPoliciesModal()) {
        <div class="modal-overlay" (click)="closePoliciesModal()">
          <div class="modal modal-wide" (click)="$event.stopPropagation()">
            <div class="modal-header-row">
              <h2>Configuracion de Politicas de Saldo</h2>
              <button class="btn btn-primary btn-sm" (click)="openPolicyForm()">
                + Nueva Politica
              </button>
            </div>
            <div class="policies-list">
              @for (policy of allPolicies(); track policy.id) {
                <div
                  class="policy-card"
                  [style.border-left-color]="policy.color"
                  [class.inactive]="!policy.is_active"
                >
                  <div class="policy-header">
                    <div class="policy-title">
                      <span class="policy-name">{{ policy.name }}</span>
                      <span class="policy-code">{{ policy.code }}</span>
                      @if (!policy.is_active) {
                        <span class="policy-badge inactive">Inactiva</span>
                      }
                    </div>
                    <div class="policy-actions">
                      <button
                        class="btn-icon"
                        title="Editar"
                        (click)="openPolicyForm(policy)"
                      >
                        <span class="icon">&#9998;</span>
                      </button>
                      <button
                        class="btn-icon"
                        [title]="policy.is_active ? 'Desactivar' : 'Activar'"
                        (click)="togglePolicyActive(policy)"
                      >
                        <span class="icon">{{ policy.is_active ? '&#128274;' : '&#128275;' }}</span>
                      </button>
                      <button
                        class="btn-icon btn-icon-danger"
                        title="Eliminar"
                        (click)="confirmDeletePolicy(policy)"
                      >
                        <span class="icon">&#128465;</span>
                      </button>
                    </div>
                  </div>
                  <div class="policy-details">
                    <span>Unidad: {{ getUnitLabel(policy.unit) }}</span>
                    <span>Tipo: {{ getAccrualTypeLabel(policy.accrual_type) }}</span>
                    <span>Base: {{ policy.base_amount }} {{ getUnitLabel(policy.unit) }}</span>
                    @if (policy.increment_per_years > 0) {
                      <span>
                        +{{ policy.increment_per_years }} cada {{ policy.years_for_increment }} anios
                      </span>
                    }
                    @if (policy.max_amount) {
                      <span>Max: {{ policy.max_amount }}</span>
                    }
                    @if (policy.allow_carryover) {
                      <span>Arrastre: Si{{ policy.max_carryover ? ' (max ' + policy.max_carryover + ')' : '' }}</span>
                    }
                  </div>
                </div>
              } @empty {
                <div class="empty-policies">
                  No hay politicas configuradas. Crea una nueva politica para comenzar.
                </div>
              }
            </div>
            <div class="modal-actions">
              <button class="btn btn-secondary" (click)="closePoliciesModal()">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Policy Form Modal (Create/Edit) -->
      @if (showPolicyFormModal()) {
        <div class="modal-overlay" (click)="closePolicyForm()">
          <div class="modal modal-wide" (click)="$event.stopPropagation()">
            <h2>{{ editingPolicy() ? 'Editar Politica' : 'Nueva Politica' }}</h2>
            <form (ngSubmit)="savePolicy()">
              <div class="form-row">
                <div class="form-group">
                  <label>Codigo *</label>
                  <input
                    type="text"
                    [(ngModel)]="policyForm.code"
                    name="code"
                    required
                    placeholder="VACATION"
                    [class.disabled]="editingPolicy()"
                  />
                  <small class="form-hint">Identificador unico (ej: VACATION, SICK_LEAVE)</small>
                </div>
                <div class="form-group">
                  <label>Nombre *</label>
                  <input
                    type="text"
                    [(ngModel)]="policyForm.name"
                    name="name"
                    required
                    placeholder="Vacaciones"
                  />
                </div>
              </div>

              <div class="form-group">
                <label>Descripcion</label>
                <textarea
                  [(ngModel)]="policyForm.description"
                  name="description"
                  rows="2"
                  placeholder="Descripcion de la politica..."
                ></textarea>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Unidad *</label>
                  <select [(ngModel)]="policyForm.unit" name="unit" required>
                    <option value="days">Dias</option>
                    <option value="hours">Horas</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Tipo de Acumulacion *</label>
                  <select [(ngModel)]="policyForm.accrual_type" name="accrualType" required>
                    <option value="annual">Anual (por antiguedad)</option>
                    <option value="fixed">Fijo (cantidad fija)</option>
                    <option value="overtime">Horas Extra</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Cantidad Base *</label>
                  <input
                    type="number"
                    [(ngModel)]="policyForm.base_amount"
                    name="baseAmount"
                    required
                    min="0"
                    step="0.5"
                  />
                </div>
                <div class="form-group">
                  <label>Cantidad Maxima</label>
                  <input
                    type="number"
                    [(ngModel)]="policyForm.max_amount"
                    name="maxAmount"
                    min="0"
                    step="0.5"
                    placeholder="Sin limite"
                  />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Incremento por Antiguedad</label>
                  <input
                    type="number"
                    [(ngModel)]="policyForm.increment_per_years"
                    name="incrementPerYears"
                    min="0"
                    step="0.5"
                  />
                </div>
                <div class="form-group">
                  <label>Anios para Incremento</label>
                  <input
                    type="number"
                    [(ngModel)]="policyForm.years_for_increment"
                    name="yearsForIncrement"
                    min="1"
                  />
                  <small class="form-hint">Cada cuantos anios se aplica el incremento</small>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Color</label>
                  <div class="color-picker-row">
                    <input
                      type="color"
                      [(ngModel)]="policyForm.color"
                      name="color"
                      class="color-input"
                    />
                    <span class="color-preview" [style.background]="policyForm.color">
                      {{ policyForm.color }}
                    </span>
                  </div>
                </div>
                <div class="form-group">
                  <label class="checkbox-label">
                    <input
                      type="checkbox"
                      [(ngModel)]="policyForm.allow_carryover"
                      name="allowCarryover"
                    />
                    Permitir Arrastre
                  </label>
                  @if (policyForm.allow_carryover) {
                    <input
                      type="number"
                      [(ngModel)]="policyForm.max_carryover"
                      name="maxCarryover"
                      min="0"
                      step="0.5"
                      placeholder="Maximo a arrastrar"
                      class="mt-half"
                    />
                  }
                </div>
              </div>

              <div class="modal-actions">
                <button type="button" class="btn btn-secondary" (click)="closePolicyForm()">
                  Cancelar
                </button>
                <button type="submit" class="btn btn-primary" [disabled]="savingPolicy()">
                  {{ savingPolicy() ? 'Guardando...' : (editingPolicy() ? 'Actualizar' : 'Crear') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Delete Confirmation Modal -->
      @if (showDeleteConfirmModal()) {
        <div class="modal-overlay" (click)="closeDeleteConfirm()">
          <div class="modal modal-small" (click)="$event.stopPropagation()">
            <h2>Confirmar Eliminacion</h2>
            <p class="confirm-text">
              Estas seguro que deseas eliminar la politica
              <strong>{{ policyToDelete()?.name }}</strong>?
            </p>
            <p class="warning-text">
              Esta accion no se puede deshacer. Si hay saldos asociados a esta politica,
              no podra ser eliminada.
            </p>
            <div class="modal-actions">
              <button class="btn btn-secondary" (click)="closeDeleteConfirm()">
                Cancelar
              </button>
              <button
                class="btn btn-danger"
                (click)="deletePolicy()"
                [disabled]="savingPolicy()"
              >
                {{ savingPolicy() ? 'Eliminando...' : 'Eliminar' }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Add Transaction Modal -->
      @if (showTransactionModal()) {
        <div class="modal-overlay" (click)="closeTransactionModal()">
          <div class="modal" (click)="$event.stopPropagation()">
            <h2>Agregar Movimiento</h2>
            <form (ngSubmit)="saveTransaction()">
              <div class="form-group">
                <label>Tipo *</label>
                <select [(ngModel)]="newTransaction.transaction_type" name="type" required>
                  <option value="credit">Acreditacion (+)</option>
                  <option value="debit">Uso (-)</option>
                  <option value="adjustment">Ajuste</option>
                </select>
              </div>
              <div class="form-group">
                <label>Cantidad *</label>
                <input
                  type="number"
                  [(ngModel)]="newTransaction.amount"
                  name="amount"
                  required
                  min="0.01"
                  step="0.01"
                />
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Fecha Inicio</label>
                  <input
                    type="date"
                    [(ngModel)]="newTransaction.usage_start_date"
                    name="startDate"
                  />
                </div>
                <div class="form-group">
                  <label>Fecha Fin</label>
                  <input
                    type="date"
                    [(ngModel)]="newTransaction.usage_end_date"
                    name="endDate"
                  />
                </div>
              </div>
              <div class="form-group">
                <label>Descripcion</label>
                <textarea
                  [(ngModel)]="newTransaction.description"
                  name="description"
                  rows="2"
                ></textarea>
              </div>
              <div class="modal-actions">
                <button type="button" class="btn btn-secondary" (click)="closeTransactionModal()">
                  Cancelar
                </button>
                <button type="submit" class="btn btn-primary">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .leave-balances-page {
      min-height: 100vh;
      background: #f3f4f6;
      padding: 2rem;
    }

    .alert {
      padding: 1rem;
      border-radius: 0.5rem;
      margin-bottom: 1rem;
    }

    .alert-warning {
      background: #fef3c7;
      border: 1px solid #f59e0b;
      color: #92400e;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 1.5rem;
    }

    .back-link {
      color: #6b7280;
      text-decoration: none;
      font-size: 0.875rem;
    }

    h1 {
      font-size: 1.8rem;
      color: #1f2937;
      margin: 0.25rem 0 0;
    }

    .header-actions {
      display: flex;
      gap: 0.75rem;
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
    .btn-secondary:hover { background: #d1d5db; }
    .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.875rem; }

    /* Filters */
    .filters-container {
      display: flex;
      gap: 1rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      min-width: 150px;
    }

    .filter-group label {
      font-size: 0.75rem;
      color: #6b7280;
      margin-bottom: 0.25rem;
      font-weight: 500;
    }

    .filter-group input,
    .filter-group select {
      padding: 0.5rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      font-size: 0.875rem;
    }

    /* Table */
    .table-container {
      background: white;
      border-radius: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      padding: 0.875rem 1rem;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }

    th {
      background: #f9fafb;
      font-weight: 600;
      color: #374151;
      font-size: 0.875rem;
    }

    .expand-col {
      width: 40px;
      text-align: center;
    }

    .expand-icon {
      color: #9ca3af;
      font-size: 0.75rem;
      cursor: pointer;
    }

    .balance-col {
      text-align: center;
      min-width: 140px;
    }

    .employee-row {
      cursor: pointer;
      transition: background 0.2s;
    }

    .employee-row:hover {
      background: #f9fafb;
    }

    .employee-row.expanded {
      background: #eff6ff;
    }

    .balance-display {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .balance-available {
      font-weight: 600;
      font-size: 1rem;
    }

    .balance-used {
      font-size: 0.75rem;
      color: #9ca3af;
    }

    .no-balance {
      color: #d1d5db;
    }

    /* Detail Row */
    .detail-row td {
      padding: 0;
      background: #f9fafb;
    }

    .detail-container {
      padding: 1.5rem;
      background: white;
      margin: 0.5rem;
      border-radius: 0.5rem;
      border: 1px solid #e5e7eb;
    }

    .detail-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .detail-header h3 {
      margin: 0;
      color: #1f2937;
    }

    .detail-info {
      display: flex;
      gap: 1.5rem;
      color: #6b7280;
      font-size: 0.875rem;
    }

    .balance-summary {
      display: flex;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .summary-card {
      background: #f3f4f6;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      display: flex;
      flex-direction: column;
      min-width: 100px;
    }

    .summary-card .label {
      font-size: 0.75rem;
      color: #6b7280;
    }

    .summary-card .value {
      font-size: 1.25rem;
      font-weight: 600;
      color: #1f2937;
    }

    .summary-card .value.used {
      color: #ef4444;
    }

    .summary-card.highlight {
      background: #dbeafe;
    }

    .summary-card.highlight .value {
      color: #1d4ed8;
    }

    /* Transactions Table */
    .transactions-table {
      margin-bottom: 1rem;
    }

    .transactions-table table {
      font-size: 0.875rem;
    }

    .transactions-table th {
      background: #f3f4f6;
      font-size: 0.75rem;
    }

    .trans-type {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      color: white;
    }

    .positive { color: #22c55e; font-weight: 600; }
    .negative { color: #ef4444; font-weight: 600; }

    .detail-actions {
      display: flex;
      justify-content: flex-end;
    }

    .empty-table, .empty-row {
      text-align: center;
      color: #9ca3af;
      padding: 2rem !important;
    }

    /* Loading */
    .loading-overlay {
      position: fixed;
      inset: 0;
      background: rgba(255, 255, 255, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e5e7eb;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Modals */
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

    .modal-wide {
      max-width: 700px;
    }

    .modal h2 {
      margin: 0 0 1.5rem;
      color: #1f2937;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: #374151;
    }

    .form-group input,
    .form-group select,
    .form-group textarea {
      width: 100%;
      padding: 0.625rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 1rem;
      box-sizing: border-box;
    }

    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #3b82f6;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .info-text {
      background: #f3f4f6;
      padding: 0.75rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      color: #6b7280;
      margin-bottom: 1rem;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }

    /* Policies List */
    .modal-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .modal-header-row h2 {
      margin: 0;
    }

    .policies-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      max-height: 400px;
      overflow-y: auto;
    }

    .policy-card {
      background: #f9fafb;
      padding: 1rem;
      border-radius: 0.5rem;
      border-left: 4px solid;
      transition: all 0.2s;
    }

    .policy-card.inactive {
      opacity: 0.6;
      background: #f3f4f6;
    }

    .policy-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.5rem;
    }

    .policy-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .policy-name {
      font-weight: 600;
      color: #1f2937;
    }

    .policy-code {
      font-size: 0.75rem;
      color: #9ca3af;
      font-family: monospace;
    }

    .policy-badge {
      font-size: 0.625rem;
      padding: 0.125rem 0.5rem;
      border-radius: 1rem;
      font-weight: 500;
    }

    .policy-badge.inactive {
      background: #fef3c7;
      color: #92400e;
    }

    .policy-actions {
      display: flex;
      gap: 0.25rem;
    }

    .btn-icon {
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 0.375rem;
      border-radius: 0.25rem;
      transition: all 0.2s;
      font-size: 1rem;
    }

    .btn-icon:hover {
      background: #e5e7eb;
    }

    .btn-icon-danger:hover {
      background: #fee2e2;
      color: #dc2626;
    }

    .btn-icon .icon {
      display: block;
      line-height: 1;
    }

    .policy-details {
      display: flex;
      gap: 1rem;
      font-size: 0.875rem;
      color: #6b7280;
      flex-wrap: wrap;
    }

    .empty-policies {
      text-align: center;
      padding: 2rem;
      color: #9ca3af;
    }

    /* Form enhancements */
    .form-hint {
      display: block;
      font-size: 0.75rem;
      color: #9ca3af;
      margin-top: 0.25rem;
    }

    .color-picker-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .color-input {
      width: 50px !important;
      height: 40px;
      padding: 0.25rem !important;
      cursor: pointer;
    }

    .color-preview {
      padding: 0.25rem 0.75rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-family: monospace;
      color: white;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      font-weight: 500;
      color: #374151;
    }

    .checkbox-label input[type="checkbox"] {
      width: auto;
    }

    .mt-half {
      margin-top: 0.5rem;
    }

    .disabled {
      background: #f3f4f6;
      cursor: not-allowed;
    }

    /* Modal sizes */
    .modal-small {
      max-width: 400px;
    }

    .confirm-text {
      color: #374151;
      margin-bottom: 0.5rem;
    }

    .warning-text {
      background: #fef3c7;
      padding: 0.75rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      color: #92400e;
    }

    .btn-danger {
      background: #dc2626;
      color: white;
    }

    .btn-danger:hover {
      background: #b91c1c;
    }

    .btn-danger:disabled {
      background: #f87171;
      cursor: not-allowed;
    }
  `],
})
export class LeaveBalancesComponent implements OnInit {
  private readonly leaveBalanceService = inject(LeaveBalanceService);
  private readonly departmentService = inject(DepartmentService);
  private readonly employeeService = inject(EmployeeService);

  // Data
  readonly policies = signal<LeavePolicy[]>([]);
  readonly departments = signal<Department[]>([]);
  readonly balanceSummaries = signal<EmployeeBalanceSummary[]>([]);
  readonly expandedDetail = signal<EmployeeBalanceDetail | null>(null);

  // UI State
  readonly loading = signal(false);
  readonly expandedEmployeeId = signal<string | null>(null);
  readonly showBulkAccrualModal = signal(false);
  readonly showPoliciesModal = signal(false);
  readonly showTransactionModal = signal(false);

  // Policy CRUD State
  readonly allPolicies = signal<LeavePolicy[]>([]);
  readonly showPolicyFormModal = signal(false);
  readonly showDeleteConfirmModal = signal(false);
  readonly editingPolicy = signal<LeavePolicy | null>(null);
  readonly policyToDelete = signal<LeavePolicy | null>(null);
  readonly savingPolicy = signal(false);

  // Filters
  filters = {
    search: '',
    policyId: '',
    departmentId: '',
    periodYear: new Date().getFullYear(),
  };

  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Bulk accrual form
  bulkAccrual = {
    policy_id: '',
    period_year: new Date().getFullYear(),
  };

  // Transaction form
  newTransaction = {
    balance_id: '',
    transaction_type: 'debit' as const,
    amount: 0,
    description: '',
    usage_start_date: '',
    usage_end_date: '',
  };

  // Policy form
  policyForm = this.getEmptyPolicyForm();

  // Computed
  readonly availableYears = computed(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear - 1, currentYear, currentYear + 1];
  });

  ngOnInit(): void {
    this.loadInitialData();
  }

  loadInitialData(): void {
    this.loading.set(true);

    // Cargar politicas y departamentos de forma independiente
    // para que si uno falla, el otro siga funcionando
    this.leaveBalanceService.getPolicies().subscribe({
      next: (policies) => {
        this.policies.set(policies);
        console.log('Politicas cargadas:', policies.length);
      },
      error: (err) => {
        console.error('Error cargando politicas:', err);
        // Mostrar alerta al usuario
        if (err.status === 401) {
          alert('Sesion expirada. Por favor inicie sesion nuevamente.');
        } else {
          alert('Error al cargar politicas. Verifique la conexion.');
        }
      },
    });

    this.departmentService.getDepartments().subscribe({
      next: (departments) => {
        this.departments.set(departments);
      },
      error: (err) => {
        console.error('Error cargando departamentos:', err);
      },
    });

    // Cargar saldos de forma separada
    this.loadBalances();
  }

  loadBalances(): void {
    this.loading.set(true);
    this.expandedEmployeeId.set(null);
    this.expandedDetail.set(null);

    this.leaveBalanceService
      .getBalances({
        search: this.filters.search || undefined,
        policy_id: this.filters.policyId || undefined,
        department_id: this.filters.departmentId || undefined,
        period_year: this.filters.periodYear,
      })
      .subscribe({
        next: (data) => {
          this.balanceSummaries.set(data);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Error loading balances:', err);
          this.loading.set(false);
        },
      });
  }

  onSearchChange(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(() => {
      this.loadBalances();
    }, 300);
  }

  // Expand/Collapse
  isExpanded(employeeId: string): boolean {
    return this.expandedEmployeeId() === employeeId;
  }

  toggleExpand(employee: EmployeeBalanceSummary): void {
    if (this.isExpanded(employee.employee_id)) {
      this.expandedEmployeeId.set(null);
      this.expandedDetail.set(null);
    } else {
      // Find first balance with a policy
      const firstBalance = employee.balances[0];
      if (firstBalance) {
        this.loadEmployeeDetail(employee.employee_id, firstBalance.policy_id);
      }
      this.expandedEmployeeId.set(employee.employee_id);
    }
  }

  loadEmployeeDetail(employeeId: string, policyId: string): void {
    this.leaveBalanceService
      .getEmployeeBalanceDetail(employeeId, policyId, this.filters.periodYear)
      .subscribe({
        next: (detail) => {
          this.expandedDetail.set(detail);
        },
        error: (err) => {
          console.error('Error loading detail:', err);
        },
      });
  }

  // Helpers
  getBalanceForPolicy(
    employee: EmployeeBalanceSummary,
    policyId: string
  ): EmployeeBalanceSummary['balances'][0] | undefined {
    return employee.balances.find((b) => b.policy_id === policyId);
  }

  formatBalanceValue(amount: number, unit: string | null): string {
    return formatBalance(amount, (unit as 'days' | 'hours') || 'days');
  }

  getTransactionLabel(type: string): string {
    return TRANSACTION_TYPE_LABELS[type as keyof typeof TRANSACTION_TYPE_LABELS] || type;
  }

  getTransactionColor(type: string): string {
    return TRANSACTION_TYPE_COLORS[type as keyof typeof TRANSACTION_TYPE_COLORS] || '#6b7280';
  }

  getUnitLabel(unit: string): string {
    return LEAVE_UNIT_LABELS[unit as keyof typeof LEAVE_UNIT_LABELS] || unit;
  }

  // Bulk Accrual Modal
  openBulkAccrualModal(): void {
    this.bulkAccrual = {
      policy_id: '',
      period_year: new Date().getFullYear(),
    };
    this.showBulkAccrualModal.set(true);
  }

  closeBulkAccrualModal(): void {
    this.showBulkAccrualModal.set(false);
  }

  executeBulkAccrual(): void {
    if (!this.bulkAccrual.policy_id) return;

    this.loading.set(true);
    this.leaveBalanceService
      .bulkAccrual({
        policy_id: this.bulkAccrual.policy_id,
        period_year: this.bulkAccrual.period_year,
      })
      .subscribe({
        next: (result) => {
          alert(`Acreditacion completada: ${result.count} empleados procesados`);
          this.closeBulkAccrualModal();
          this.loadBalances();
        },
        error: (err) => {
          console.error('Error in bulk accrual:', err);
          alert(err.error?.detail || 'Error al ejecutar acreditacion masiva');
          this.loading.set(false);
        },
      });
  }

  // Policies Modal
  openPoliciesModal(): void {
    this.loadAllPolicies();
    this.showPoliciesModal.set(true);
  }

  closePoliciesModal(): void {
    this.showPoliciesModal.set(false);
  }

  loadAllPolicies(): void {
    this.leaveBalanceService.getPolicies(false).subscribe({
      next: (policies) => {
        this.allPolicies.set(policies);
      },
      error: (err) => {
        console.error('Error cargando todas las politicas:', err);
      },
    });
  }

  // Policy Form (Create/Edit)
  getEmptyPolicyForm() {
    return {
      code: '',
      name: '',
      description: '',
      unit: 'days' as LeaveUnit,
      accrual_type: 'annual' as AccrualType,
      base_amount: 0,
      increment_per_years: 0,
      years_for_increment: 1,
      max_amount: null as number | null,
      allow_carryover: false,
      max_carryover: null as number | null,
      color: '#3b82f6',
    };
  }

  openPolicyForm(policy?: LeavePolicy): void {
    if (policy) {
      this.editingPolicy.set(policy);
      this.policyForm = {
        code: policy.code,
        name: policy.name,
        description: policy.description || '',
        unit: policy.unit,
        accrual_type: policy.accrual_type,
        base_amount: policy.base_amount,
        increment_per_years: policy.increment_per_years,
        years_for_increment: policy.years_for_increment,
        max_amount: policy.max_amount,
        allow_carryover: policy.allow_carryover,
        max_carryover: policy.max_carryover,
        color: policy.color,
      };
    } else {
      this.editingPolicy.set(null);
      this.policyForm = this.getEmptyPolicyForm();
    }
    this.showPolicyFormModal.set(true);
  }

  closePolicyForm(): void {
    this.showPolicyFormModal.set(false);
    this.editingPolicy.set(null);
  }

  savePolicy(): void {
    if (!this.policyForm.code || !this.policyForm.name) {
      alert('Codigo y nombre son requeridos');
      return;
    }

    this.savingPolicy.set(true);
    const editing = this.editingPolicy();

    if (editing) {
      const updateData: LeavePolicyUpdate = {
        name: this.policyForm.name,
        description: this.policyForm.description || undefined,
        unit: this.policyForm.unit,
        accrual_type: this.policyForm.accrual_type,
        base_amount: this.policyForm.base_amount,
        increment_per_years: this.policyForm.increment_per_years,
        years_for_increment: this.policyForm.years_for_increment,
        max_amount: this.policyForm.max_amount,
        allow_carryover: this.policyForm.allow_carryover,
        max_carryover: this.policyForm.max_carryover,
        color: this.policyForm.color,
      };

      this.leaveBalanceService.updatePolicy(editing.id, updateData).subscribe({
        next: () => {
          this.savingPolicy.set(false);
          this.closePolicyForm();
          this.loadAllPolicies();
          this.loadInitialData();
        },
        error: (err) => {
          this.savingPolicy.set(false);
          console.error('Error actualizando politica:', err);
          alert(err.error?.detail || 'Error al actualizar la politica');
        },
      });
    } else {
      const createData: LeavePolicyCreate = {
        code: this.policyForm.code,
        name: this.policyForm.name,
        description: this.policyForm.description || undefined,
        unit: this.policyForm.unit,
        accrual_type: this.policyForm.accrual_type,
        base_amount: this.policyForm.base_amount,
        increment_per_years: this.policyForm.increment_per_years,
        years_for_increment: this.policyForm.years_for_increment,
        max_amount: this.policyForm.max_amount,
        allow_carryover: this.policyForm.allow_carryover,
        max_carryover: this.policyForm.max_carryover,
        color: this.policyForm.color,
      };

      this.leaveBalanceService.createPolicy(createData).subscribe({
        next: () => {
          this.savingPolicy.set(false);
          this.closePolicyForm();
          this.loadAllPolicies();
          this.loadInitialData();
        },
        error: (err) => {
          this.savingPolicy.set(false);
          console.error('Error creando politica:', err);
          alert(err.error?.detail || 'Error al crear la politica');
        },
      });
    }
  }

  // Toggle Policy Active Status
  togglePolicyActive(policy: LeavePolicy): void {
    const newStatus = !policy.is_active;
    const action = newStatus ? 'activar' : 'desactivar';

    this.leaveBalanceService
      .updatePolicy(policy.id, { is_active: newStatus })
      .subscribe({
        next: () => {
          this.loadAllPolicies();
          this.loadInitialData();
        },
        error: (err) => {
          console.error(`Error al ${action} politica:`, err);
          alert(err.error?.detail || `Error al ${action} la politica`);
        },
      });
  }

  // Delete Policy
  confirmDeletePolicy(policy: LeavePolicy): void {
    this.policyToDelete.set(policy);
    this.showDeleteConfirmModal.set(true);
  }

  closeDeleteConfirm(): void {
    this.showDeleteConfirmModal.set(false);
    this.policyToDelete.set(null);
  }

  deletePolicy(): void {
    const policy = this.policyToDelete();
    if (!policy) return;

    this.savingPolicy.set(true);
    this.leaveBalanceService.deletePolicy(policy.id).subscribe({
      next: () => {
        this.savingPolicy.set(false);
        this.closeDeleteConfirm();
        this.loadAllPolicies();
        this.loadInitialData();
      },
      error: (err) => {
        this.savingPolicy.set(false);
        console.error('Error eliminando politica:', err);
        alert(
          err.error?.detail ||
            'Error al eliminar la politica. Puede que tenga saldos asociados.'
        );
      },
    });
  }

  // Helper for accrual type labels
  getAccrualTypeLabel(type: string): string {
    return ACCRUAL_TYPE_LABELS[type as keyof typeof ACCRUAL_TYPE_LABELS] || type;
  }

  // Transaction Modal
  openAddTransactionModal(): void {
    const detail = this.expandedDetail();
    if (!detail) return;

    this.newTransaction = {
      balance_id: detail.balance.id,
      transaction_type: 'debit',
      amount: 0,
      description: '',
      usage_start_date: '',
      usage_end_date: '',
    };
    this.showTransactionModal.set(true);
  }

  closeTransactionModal(): void {
    this.showTransactionModal.set(false);
  }

  saveTransaction(): void {
    if (!this.newTransaction.balance_id || this.newTransaction.amount <= 0) return;

    this.leaveBalanceService
      .createTransaction({
        balance_id: this.newTransaction.balance_id,
        transaction_type: this.newTransaction.transaction_type,
        amount: this.newTransaction.amount,
        description: this.newTransaction.description || undefined,
        usage_start_date: this.newTransaction.usage_start_date || undefined,
        usage_end_date: this.newTransaction.usage_end_date || undefined,
      })
      .subscribe({
        next: () => {
          this.closeTransactionModal();
          // Reload detail
          const detail = this.expandedDetail();
          if (detail) {
            this.loadEmployeeDetail(detail.employee_id, detail.balance.policy_id);
          }
          this.loadBalances();
        },
        error: (err) => {
          console.error('Error saving transaction:', err);
          alert(err.error?.detail || 'Error al guardar movimiento');
        },
      });
  }
}
