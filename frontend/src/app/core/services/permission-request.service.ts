import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import {
  PermissionRequest,
  PermissionRequestCreate,
  PermissionRequestFilters,
} from '../models/permission-request.model';

@Injectable({
  providedIn: 'root',
})
export class PermissionRequestService {
  private readonly api = inject(ApiService);

  getAll(filters?: PermissionRequestFilters): Observable<PermissionRequest[]> {
    return this.api.get<PermissionRequest[]>(
      '/permission-requests',
      filters as Record<string, string>
    );
  }

  getById(id: string): Observable<PermissionRequest> {
    return this.api.get<PermissionRequest>(`/permission-requests/${id}`);
  }

  create(payload: PermissionRequestCreate): Observable<PermissionRequest> {
    return this.api.post<PermissionRequest>('/permission-requests', payload);
  }

  approve(id: string, notes?: string): Observable<PermissionRequest> {
    return this.api.patch<PermissionRequest>(`/permission-requests/${id}/approve`, {
      notes: notes ?? null,
    });
  }

  reject(id: string, rejection_reason: string): Observable<PermissionRequest> {
    return this.api.patch<PermissionRequest>(`/permission-requests/${id}/reject`, {
      rejection_reason,
    });
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/permission-requests/${id}`);
  }
}
