import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Department, DepartmentCreate } from '../models/department.model';

@Injectable({
  providedIn: 'root'
})
export class DepartmentService {
  private api = inject(ApiService);

  getDepartments(activeOnly: boolean = true): Observable<Department[]> {
    return this.api.get<Department[]>(`/departments/?active_only=${activeOnly}`);
  }

  getDepartment(id: string): Observable<Department> {
    return this.api.get<Department>(`/departments/${id}`);
  }

  createDepartment(department: DepartmentCreate): Observable<Department> {
    return this.api.post<Department>('/departments/', department);
  }

  updateDepartment(id: string, department: Partial<DepartmentCreate>): Observable<Department> {
    return this.api.patch<Department>(`/departments/${id}`, department);
  }

  deleteDepartment(id: string): Observable<void> {
    return this.api.delete<void>(`/departments/${id}`);
  }
}
