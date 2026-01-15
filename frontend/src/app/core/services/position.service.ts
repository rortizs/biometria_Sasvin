import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Position } from '../models/position.model';

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
}
