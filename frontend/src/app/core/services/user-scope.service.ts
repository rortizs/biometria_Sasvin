import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { UserScopeAssignment } from '../models/user.model';

// Mirrors backend/app/schemas/user_scope_assignment.py's
// `UserScopeAssignmentCreate` (task 3.8): exactly one of department_id /
// location_id / director_user_id must be set — enforced server-side (422
// via the schema validator, 409 on the unique-index conflict). The
// consuming component is responsible for sending exactly one target.
export interface UserScopeAssignmentCreate {
  user_id: string;
  department_id?: string | null;
  location_id?: string | null;
  director_user_id?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class UserScopeService {
  private readonly api = inject(ApiService);

  getAll(userId?: string): Observable<UserScopeAssignment[]> {
    return this.api.get<UserScopeAssignment[]>(
      '/user-scopes/',
      userId ? { user_id: userId } : undefined
    );
  }

  create(payload: UserScopeAssignmentCreate): Observable<UserScopeAssignment> {
    return this.api.post<UserScopeAssignment>('/user-scopes/', payload);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/user-scopes/${id}`);
  }
}
