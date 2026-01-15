import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AttendanceRecord, AttendanceCheckInRequest, FaceVerifyResponse } from '../models/attendance.model';

@Injectable({
  providedIn: 'root',
})
export class AttendanceService {
  private readonly api = inject(ApiService);

  checkIn(request: AttendanceCheckInRequest): Observable<AttendanceRecord> {
    return this.api.post<AttendanceRecord>('/attendance/check-in', request);
  }

  checkOut(request: AttendanceCheckInRequest): Observable<AttendanceRecord> {
    return this.api.post<AttendanceRecord>('/attendance/check-out', request);
  }

  verifyFace(image: string): Observable<FaceVerifyResponse> {
    return this.api.post<FaceVerifyResponse>('/faces/verify', { image });
  }

  getTodayAttendance(): Observable<AttendanceRecord[]> {
    return this.api.get<AttendanceRecord[]>('/attendance/today');
  }

  getAttendance(params?: {
    record_date?: string;
    date_from?: string;
    date_to?: string;
    employee_id?: string;
    status?: string;
    skip?: number;
    limit?: number;
  }): Observable<AttendanceRecord[]> {
    return this.api.get<AttendanceRecord[]>('/attendance', params as Record<string, string | number>);
  }
}
