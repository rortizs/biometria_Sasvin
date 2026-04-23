import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Role, RoleCreate, RoleUpdate, UserRoleAssignmentResponse } from '../models/role.model';

@Injectable({
  providedIn: 'root',
})
export class RoleService {
  private readonly api = inject(ApiService);

  getRoles(activeOnly = true): Observable<Role[]> {
    return this.api.get<Role[]>('/roles/', { active_only: activeOnly });
  }

  getRole(id: string): Observable<Role> {
    return this.api.get<Role>(`/roles/${id}`);
  }

  createRole(data: RoleCreate): Observable<Role> {
    return this.api.post<Role>('/roles/', data);
  }

  updateRole(id: string, data: RoleUpdate): Observable<Role> {
    return this.api.patch<Role>(`/roles/${id}`, data);
  }

  deleteRole(id: string): Observable<void> {
    return this.api.delete<void>(`/roles/${id}`);
  }

  setRolePermissions(roleId: string, permissionIds: string[]): Observable<Role> {
    return this.api.put<Role>(`/roles/${roleId}/permissions`, permissionIds);
  }

  getUserRoles(userId: string): Observable<UserRoleAssignmentResponse[]> {
    return this.api.get<UserRoleAssignmentResponse[]>(`/roles/users/${userId}/roles`);
  }

  assignUserRoles(userId: string, roleIds: string[]): Observable<UserRoleAssignmentResponse[]> {
    return this.api.put<UserRoleAssignmentResponse[]>(`/roles/users/${userId}/roles`, { role_ids: roleIds });
  }
}
