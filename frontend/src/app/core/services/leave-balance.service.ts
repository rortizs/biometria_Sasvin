import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import {
  LeavePolicy,
  LeavePolicyCreate,
  LeavePolicyUpdate,
  LeaveBalance,
  LeaveBalanceCreate,
  LeaveTransaction,
  LeaveTransactionCreate,
  EmployeeBalanceSummary,
  EmployeeBalanceDetail,
  BulkAccrualCreate,
  BalanceCalculationRequest,
  BalanceCalculationResponse,
} from '../models/leave-balance.model';

export interface LeaveBalanceListParams {
  search?: string;
  policy_id?: string;
  department_id?: string;
  employee_id?: string;
  period_year?: number;
  skip?: number;
  limit?: number;
}

@Injectable({
  providedIn: 'root',
})
export class LeaveBalanceService {
  private readonly api = inject(ApiService);
  private readonly basePath = '/leave-balances';

  // ============ Policies ============

  getPolicies(activeOnly = true): Observable<LeavePolicy[]> {
    return this.api.get<LeavePolicy[]>(`${this.basePath}/policies`, {
      active_only: activeOnly,
    });
  }

  getPolicy(id: string): Observable<LeavePolicy> {
    return this.api.get<LeavePolicy>(`${this.basePath}/policies/${id}`);
  }

  createPolicy(policy: LeavePolicyCreate): Observable<LeavePolicy> {
    return this.api.post<LeavePolicy>(`${this.basePath}/policies`, policy);
  }

  updatePolicy(id: string, policy: LeavePolicyUpdate): Observable<LeavePolicy> {
    return this.api.patch<LeavePolicy>(`${this.basePath}/policies/${id}`, policy);
  }

  deletePolicy(id: string): Observable<void> {
    return this.api.delete<void>(`${this.basePath}/policies/${id}`);
  }

  // ============ Balances ============

  getBalances(params: LeaveBalanceListParams = {}): Observable<EmployeeBalanceSummary[]> {
    const queryParams: Record<string, string | number | boolean> = {};

    if (params.search) queryParams['search'] = params.search;
    if (params.policy_id) queryParams['policy_id'] = params.policy_id;
    if (params.department_id) queryParams['department_id'] = params.department_id;
    if (params.employee_id) queryParams['employee_id'] = params.employee_id;
    if (params.period_year) queryParams['period_year'] = params.period_year;
    if (params.skip !== undefined) queryParams['skip'] = params.skip;
    if (params.limit !== undefined) queryParams['limit'] = params.limit;

    return this.api.get<EmployeeBalanceSummary[]>(this.basePath, queryParams);
  }

  getEmployeeBalanceDetail(
    employeeId: string,
    policyId: string,
    periodYear?: number
  ): Observable<EmployeeBalanceDetail> {
    const params: Record<string, string | number> = { policy_id: policyId };
    if (periodYear) params['period_year'] = periodYear;

    return this.api.get<EmployeeBalanceDetail>(
      `${this.basePath}/employee/${employeeId}/detail`,
      params
    );
  }

  createBalance(balance: LeaveBalanceCreate): Observable<LeaveBalance> {
    return this.api.post<LeaveBalance>(this.basePath, balance);
  }

  // ============ Bulk Operations ============

  bulkAccrual(data: BulkAccrualCreate): Observable<{ message: string; count: number }> {
    return this.api.post<{ message: string; count: number }>(
      `${this.basePath}/bulk-accrual`,
      data
    );
  }

  calculateBalance(request: BalanceCalculationRequest): Observable<BalanceCalculationResponse> {
    return this.api.post<BalanceCalculationResponse>(
      `${this.basePath}/calculate`,
      request
    );
  }

  // ============ Transactions ============

  getTransactions(balanceId: string): Observable<LeaveTransaction[]> {
    return this.api.get<LeaveTransaction[]>(`${this.basePath}/transactions/${balanceId}`);
  }

  createTransaction(transaction: LeaveTransactionCreate): Observable<LeaveTransaction> {
    return this.api.post<LeaveTransaction>(`${this.basePath}/transactions`, transaction);
  }
}
