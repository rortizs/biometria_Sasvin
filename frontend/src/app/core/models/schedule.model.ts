// Schedule Pattern - Define work schedules templates
export interface SchedulePattern {
  id: string;
  name: string;
  description: string | null;
  check_in_time: string; // "08:00:00"
  check_out_time: string; // "17:00:00"
  grace_minutes: number;
  color: string; // hex color like "#4CAF50"
  is_active: boolean;
  created_at: string;
}

export interface SchedulePatternCreate {
  name: string;
  description?: string;
  check_in_time: string;
  check_out_time: string;
  grace_minutes?: number;
  color?: string;
}

export interface SchedulePatternUpdate {
  name?: string;
  description?: string;
  check_in_time?: string;
  check_out_time?: string;
  grace_minutes?: number;
  color?: string;
  is_active?: boolean;
}

// Schedule Assignment - Assign patterns to employees for specific dates
export interface ScheduleAssignment {
  id: string;
  employee_id: string;
  schedule_pattern_id: string;
  date: string; // "2025-01-15"
  is_day_off: boolean;
  created_at: string;
}

export interface ScheduleAssignmentCreate {
  employee_id: string;
  schedule_pattern_id?: string;
  date: string;
  is_day_off?: boolean;
}

export interface BulkScheduleAssignment {
  employee_ids: string[];
  schedule_pattern_id?: string;
  start_date: string;
  end_date: string;
  days_of_week?: number[]; // 0=Monday, 6=Sunday
  is_day_off?: boolean;
}

// Schedule Exception - Vacations, holidays, sick leave, etc.
export type ExceptionType = 'day_off' | 'vacation' | 'sick_leave' | 'holiday' | 'permission' | 'other';

export interface ScheduleException {
  id: string;
  employee_id: string | null; // null = applies to all employees (e.g., holiday)
  exception_type: ExceptionType;
  start_date: string;
  end_date: string;
  description: string | null;
  created_at: string;
}

export interface ScheduleExceptionCreate {
  employee_id?: string | null;
  exception_type: ExceptionType;
  start_date: string;
  end_date: string;
  description?: string;
}

// Calendar View Response
export interface CalendarDay {
  date: string;
  schedule_name: string | null;
  check_in: string | null; // "08:00:00"
  check_out: string | null; // "17:00:00"
  is_day_off: boolean;
  exception_type: ExceptionType | null;
  exception_description: string | null;
  color: string; // hex color
}

export interface CalendarEmployee {
  employee_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  department_name: string | null;
  default_schedule_name: string | null;
  days: CalendarDay[];
}

export interface CalendarResponse {
  start_date: string;
  end_date: string;
  employees: CalendarEmployee[];
}

// UI helper types
export interface CalendarFilters {
  search: string;
  departmentId: string;
  employeeId: string;
  patternId: string;
  startDate: string;
  endDate: string;
}

export const EXCEPTION_TYPE_LABELS: Record<ExceptionType, string> = {
  day_off: 'Libre',
  vacation: 'Vacaciones',
  sick_leave: 'Incapacidad',
  holiday: 'Feriado',
  permission: 'Permiso',
  other: 'Otro',
};

export const EXCEPTION_TYPE_COLORS: Record<ExceptionType, string> = {
  day_off: '#9CA3AF', // gray
  vacation: '#3B82F6', // blue
  sick_leave: '#EF4444', // red
  holiday: '#8B5CF6', // purple
  permission: '#F59E0B', // amber
  other: '#6B7280', // gray
};
