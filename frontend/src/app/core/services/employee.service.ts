import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Employee, EmployeeCreate, EmployeeUpdate } from '../models/employee.model';

@Injectable({
  providedIn: 'root',
})
export class EmployeeService {
  private readonly api = inject(ApiService);

  getAll(params?: {
    skip?: number;
    limit?: number;
    active_only?: boolean;
  }): Observable<Employee[]> {
    return this.api.get<Employee[]>('/employees', params as Record<string, string | number | boolean>);
  }

  getById(id: string): Observable<Employee> {
    return this.api.get<Employee>(`/employees/${id}`);
  }

  create(employee: EmployeeCreate): Observable<Employee> {
    return this.api.post<Employee>('/employees', employee);
  }

  update(id: string, employee: EmployeeUpdate): Observable<Employee> {
    return this.api.patch<Employee>(`/employees/${id}`, employee);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/employees/${id}`);
  }

  registerFace(employeeId: string, images: string[]): Observable<{ success: boolean; message: string }> {
    return this.api.post('/faces/register', {
      employee_id: employeeId,
      images,
    });
  }

  deleteFace(employeeId: string): Observable<{ success: boolean; message: string }> {
    return this.api.delete(`/faces/${employeeId}`);
  }
}
