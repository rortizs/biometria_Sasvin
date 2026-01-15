import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import {
  SchedulePattern,
  SchedulePatternCreate,
  SchedulePatternUpdate,
  ScheduleAssignment,
  ScheduleAssignmentCreate,
  BulkScheduleAssignment,
  ScheduleException,
  ScheduleExceptionCreate,
  CalendarResponse,
} from '../models/schedule.model';

@Injectable({
  providedIn: 'root',
})
export class ScheduleService {
  private readonly api = inject(ApiService);

  // Schedule Patterns
  getPatterns(activeOnly: boolean = true): Observable<SchedulePattern[]> {
    return this.api.get<SchedulePattern[]>('/schedules/patterns', { active_only: activeOnly });
  }

  getPattern(id: string): Observable<SchedulePattern> {
    return this.api.get<SchedulePattern>(`/schedules/patterns/${id}`);
  }

  createPattern(pattern: SchedulePatternCreate): Observable<SchedulePattern> {
    return this.api.post<SchedulePattern>('/schedules/patterns', pattern);
  }

  updatePattern(id: string, pattern: SchedulePatternUpdate): Observable<SchedulePattern> {
    return this.api.patch<SchedulePattern>(`/schedules/patterns/${id}`, pattern);
  }

  deletePattern(id: string): Observable<void> {
    return this.api.delete<void>(`/schedules/patterns/${id}`);
  }

  // Schedule Assignments
  getAssignments(params?: {
    employee_id?: string;
    date_from?: string;
    date_to?: string;
  }): Observable<ScheduleAssignment[]> {
    return this.api.get<ScheduleAssignment[]>(
      '/schedules/assignments',
      params as Record<string, string>
    );
  }

  createAssignment(assignment: ScheduleAssignmentCreate): Observable<ScheduleAssignment> {
    return this.api.post<ScheduleAssignment>('/schedules/assignments', assignment);
  }

  createBulkAssignments(
    bulk: BulkScheduleAssignment
  ): Observable<{ created: number; message: string }> {
    return this.api.post<{ created: number; message: string }>(
      '/schedules/assignments/bulk',
      bulk
    );
  }

  deleteAssignment(id: string): Observable<void> {
    return this.api.delete<void>(`/schedules/assignments/${id}`);
  }

  // Schedule Exceptions
  getExceptions(params?: {
    employee_id?: string;
    exception_type?: string;
    date_from?: string;
    date_to?: string;
  }): Observable<ScheduleException[]> {
    return this.api.get<ScheduleException[]>(
      '/schedules/exceptions',
      params as Record<string, string>
    );
  }

  createException(exception: ScheduleExceptionCreate): Observable<ScheduleException> {
    return this.api.post<ScheduleException>('/schedules/exceptions', exception);
  }

  deleteException(id: string): Observable<void> {
    return this.api.delete<void>(`/schedules/exceptions/${id}`);
  }

  // Calendar View
  getCalendar(startDate: string, endDate: string): Observable<CalendarResponse> {
    return this.api.get<CalendarResponse>('/schedules/calendar', {
      start_date: startDate,
      end_date: endDate,
    });
  }
}
