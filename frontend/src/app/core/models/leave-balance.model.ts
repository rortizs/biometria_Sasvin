/**
 * Leave Balance Models - Saldos Laborales
 *
 * Tipos de saldo:
 * - Vacaciones (dias): acumulacion anual segun antiguedad
 * - Incapacidad (dias): fondo fijo anual
 * - Horas Compensatorias (horas:minutos): por horas extra trabajadas
 */

// ============ Enums ============

export type LeaveUnit = 'days' | 'hours';

export type AccrualType = 'annual' | 'fixed' | 'overtime' | 'manual';

export type TransactionType = 'credit' | 'debit' | 'adjustment' | 'expiration';

// ============ Leave Policy ============

export interface LeavePolicy {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit: LeaveUnit;
  accrual_type: AccrualType;
  base_amount: number;
  increment_per_years: number;
  years_for_increment: number;
  max_amount: number | null;
  expires_after_days: number | null;
  allow_carryover: boolean;
  max_carryover: number | null;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeavePolicyCreate {
  code: string;
  name: string;
  description?: string;
  unit?: LeaveUnit;
  accrual_type?: AccrualType;
  base_amount?: number;
  increment_per_years?: number;
  years_for_increment?: number;
  max_amount?: number | null;
  expires_after_days?: number | null;
  allow_carryover?: boolean;
  max_carryover?: number | null;
  color?: string;
}

export interface LeavePolicyUpdate {
  code?: string;
  name?: string;
  description?: string;
  unit?: LeaveUnit;
  accrual_type?: AccrualType;
  base_amount?: number;
  increment_per_years?: number;
  years_for_increment?: number;
  max_amount?: number | null;
  expires_after_days?: number | null;
  allow_carryover?: boolean;
  max_carryover?: number | null;
  color?: string;
  is_active?: boolean;
}

// ============ Leave Balance ============

export interface LeaveBalance {
  id: string;
  employee_id: string;
  policy_id: string;
  period_year: number;
  period_start: string;
  period_end: string;
  initial_balance: number;
  current_balance: number;
  used_amount: number;
  pending_amount: number;
  carryover_amount: number;
  available_balance: number;
  created_at: string;
  updated_at: string;
  // Nested policy info
  policy_name: string | null;
  policy_code: string | null;
  policy_unit: LeaveUnit | null;
  policy_color: string | null;
}

export interface LeaveBalanceCreate {
  employee_id: string;
  policy_id: string;
  period_year: number;
  period_start: string;
  period_end: string;
  initial_balance?: number;
  carryover_amount?: number;
}

// ============ Leave Transaction ============

export interface LeaveTransaction {
  id: string;
  balance_id: string;
  transaction_type: TransactionType;
  amount: number;
  balance_before: number;
  balance_after: number;
  schedule_exception_id: string | null;
  usage_start_date: string | null;
  usage_end_date: string | null;
  description: string | null;
  created_at: string;
  created_by: string | null;
}

export interface LeaveTransactionCreate {
  balance_id: string;
  transaction_type: TransactionType;
  amount: number;
  description?: string;
  schedule_exception_id?: string;
  usage_start_date?: string;
  usage_end_date?: string;
}

// ============ Employee Summary & Detail ============

export interface EmployeeBalanceSummary {
  employee_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  department_name: string | null;
  balances: LeaveBalance[];
}

export interface EmployeeBalanceDetail {
  employee_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  department_name: string | null;
  hire_date: string | null;
  years_of_service: number;
  balance: LeaveBalance;
  transactions: LeaveTransaction[];
}

// ============ Bulk Operations ============

export interface BulkAccrualCreate {
  policy_id: string;
  period_year: number;
  employee_ids?: string[];
}

export interface BalanceCalculationRequest {
  employee_id: string;
  policy_id: string;
  period_year: number;
}

export interface BalanceCalculationResponse {
  employee_id: string;
  policy_id: string;
  period_year: number;
  years_of_service: number;
  calculated_amount: number;
  base_amount: number;
  increment_amount: number;
}

// ============ UI Helpers ============

export interface LeaveBalanceFilters {
  search: string;
  policyId: string;
  departmentId: string;
  employeeId: string;
  periodYear: number;
}

export const LEAVE_UNIT_LABELS: Record<LeaveUnit, string> = {
  days: 'Dias',
  hours: 'Horas',
};

export const ACCRUAL_TYPE_LABELS: Record<AccrualType, string> = {
  annual: 'Anual',
  fixed: 'Fijo',
  overtime: 'Horas Extra',
  manual: 'Manual',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  credit: 'Acreditacion',
  debit: 'Uso',
  adjustment: 'Ajuste',
  expiration: 'Vencimiento',
};

export const TRANSACTION_TYPE_COLORS: Record<TransactionType, string> = {
  credit: '#22c55e',     // green
  debit: '#ef4444',      // red
  adjustment: '#f59e0b', // amber
  expiration: '#6b7280', // gray
};

// Helper function to format balance display
export function formatBalance(amount: number, unit: LeaveUnit): string {
  if (unit === 'hours') {
    const hours = Math.floor(amount);
    const minutes = Math.round((amount - hours) * 60);
    return `${hours}h ${minutes}m`;
  }
  return `${amount} ${amount === 1 ? 'dia' : 'dias'}`;
}
