export interface AttendanceRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  record_date: string;
  check_in: string | null;
  check_out: string | null;
  status: AttendanceStatus;
  confidence: number | null;
  message?: string;
}

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'early_leave';

export interface AttendanceCheckInRequest {
  image: string;
  device_id?: string;
}

export interface FaceVerifyResponse {
  success: boolean;
  employee_id: string | null;
  employee_name: string | null;
  confidence: number | null;
  message: string | null;
}
