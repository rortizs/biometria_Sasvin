import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { User, UserRole } from '../models/user.model';

export interface UserCreatePayload {
  email: string;
  password: string;
  full_name: string | null;
  role: UserRole;
  employee_id?: string | null;
}

export interface UserUpdatePayload {
  full_name?: string | null;
  email?: string;
  role?: UserRole;
  is_active?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class UserManagementService {
  private readonly api = inject(ApiService);

  getUsers(): Observable<User[]> {
    return this.api.get<User[]>('/users/');
  }

  updateUser(id: string, data: UserUpdatePayload): Observable<User> {
    return this.api.patch<User>(`/users/${id}`, data);
  }

  deleteUser(id: string): Observable<void> {
    return this.api.delete<void>(`/users/${id}`);
  }

  changePassword(id: string, newPassword: string): Observable<void> {
    return this.api.post<void>(`/users/${id}/change-password`, { new_password: newPassword });
  }

  createUser(data: UserCreatePayload): Observable<User> {
    return this.api.post<User>('/auth/register', data);
  }

  changeFirstPassword(newPassword: string): Observable<void> {
    return this.api.post<void>('/auth/change-first-password', { new_password: newPassword });
  }
}
