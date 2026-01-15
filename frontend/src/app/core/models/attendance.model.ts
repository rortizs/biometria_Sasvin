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
  check_in_latitude?: number | null;
  check_in_longitude?: number | null;
  check_in_distance_meters?: number | null;
  check_out_latitude?: number | null;
  check_out_longitude?: number | null;
  check_out_distance_meters?: number | null;
  geo_validated?: boolean;
}

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'early_leave';

export interface AttendanceCheckInRequest {
  image: string;
  device_id?: string;
  latitude?: number;
  longitude?: number;
}

export interface FaceVerifyResponse {
  success: boolean;
  employee_id: string | null;
  employee_name: string | null;
  confidence: number | null;
  message: string | null;
}
