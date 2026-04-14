import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Position } from '../models/position.model';

export interface PositionCreate {
  name: string;
  description?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class PositionService {
  private api = inject(ApiService);

  getPositions(activeOnly: boolean = true): Observable<Position[]> {
    return this.api.get<Position[]>(`/positions/?active_only=${activeOnly}`);
  }

  getPosition(id: string): Observable<Position> {
    return this.api.get<Position>(`/positions/${id}`);
  }

  createPosition(position: PositionCreate): Observable<Position> {
    return this.api.post<Position>('/positions/', position);
  }

  updatePosition(id: string, position: Partial<PositionCreate> & { is_active?: boolean }): Observable<Position> {
    return this.api.patch<Position>(`/positions/${id}`, position);
  }

  deletePosition(id: string): Observable<void> {
    return this.api.delete<void>(`/positions/${id}`);
  }
}
