import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { LeaveBalanceService } from '../../../../core/services/leave-balance.service';
import { DepartmentService } from '../../../../core/services/department.service';
import { EmployeeService } from '../../../../core/services/employee.service';
import { Department } from '../../../../core/models/department.model';
import { Employee } from '../../../../core/models/employee.model';
import {
  LeavePolicy,
  EmployeeBalanceSummary,
  EmployeeBalanceDetail,
  LeaveTransaction,
  formatBalance,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_COLORS,
  LEAVE_UNIT_LABELS,
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
            <h2>Configuracion de Politicas de Saldo</h2>
            <div class="policies-list">
              @for (policy of policies(); track policy.id) {
                <div class="policy-card" [style.border-left-color]="policy.color">
                  <div class="policy-header">
                    <span class="policy-name">{{ policy.name }}</span>
                    <span class="policy-code">{{ policy.code }}</span>
                  </div>
                  <div class="policy-details">
                    <span>Unidad: {{ getUnitLabel(policy.unit) }}</span>
                    <span>Base: {{ policy.base_amount }} {{ getUnitLabel(policy.unit) }}</span>
                    @if (policy.increment_per_years > 0) {
                      <span>
                        +{{ policy.increment_per_years }} cada {{ policy.years_for_increment }} anios
                      </span>
                    }
                    @if (policy.max_amount) {
                      <span>Max: {{ policy.max_amount }}</span>
                    }
                  </div>
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
    .policies-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .policy-card {
      background: #f9fafb;
      padding: 1rem;
      border-radius: 0.5rem;
      border-left: 4px solid;
    }

    .policy-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;
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

    .policy-details {
      display: flex;
      gap: 1rem;
      font-size: 0.875rem;
      color: #6b7280;
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

    forkJoin({
      policies: this.leaveBalanceService.getPolicies(),
      departments: this.departmentService.getDepartments(),
    }).subscribe({
      next: ({ policies, departments }) => {
        this.policies.set(policies);
        this.departments.set(departments);
        this.loadBalances();
      },
      error: (err) => {
        console.error('Error loading initial data:', err);
        this.loading.set(false);
      },
    });
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
    this.showPoliciesModal.set(true);
  }

  closePoliciesModal(): void {
    this.showPoliciesModal.set(false);
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
