import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Permission } from '../models/role.model';

@Injectable({
  providedIn: 'root',
})
export class PermissionService {
  private readonly api = inject(ApiService);

  getPermissions(module?: string): Observable<Permission[]> {
    const params: Record<string, string> = {};
    if (module) {
      params['module'] = module;
    }
    return this.api.get<Permission[]>('/permissions/', params);
  }
}
