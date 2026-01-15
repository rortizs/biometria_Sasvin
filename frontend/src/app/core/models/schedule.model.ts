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
// Extended types based on SIA system
export type ExceptionType =
  | 'vacation'           // Vacaciones
  | 'sick_leave'         // Incapacidad Medica
  | 'bereavement'        // Luto
  | 'medical_permission' // Permiso-Medico
  | 'work_letter'        // Carta de Trabajo
  | 'compensatory'       // Compensatorio
  | 'maternity_leave'    // Licencia de Maternidad
  | 'paternity_leave'    // Licencia de Paternidad
  | 'personal_day'       // Dia Personal
  | 'holiday'            // Feriado
  | 'day_off'            // Dia Libre
  | 'permission'         // Permiso General
  | 'other';             // Otro

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
  vacation: 'Vacaciones',
  sick_leave: 'Incapacidad Medica',
  bereavement: 'Luto',
  medical_permission: 'Permiso Medico',
  work_letter: 'Carta de Trabajo',
  compensatory: 'Compensatorio',
  maternity_leave: 'Licencia Maternidad',
  paternity_leave: 'Licencia Paternidad',
  personal_day: 'Dia Personal',
  holiday: 'Feriado',
  day_off: 'Dia Libre',
  permission: 'Permiso',
  other: 'Otro',
};

export const EXCEPTION_TYPE_COLORS: Record<ExceptionType, string> = {
  vacation: '#1E3A5F',       // dark blue
  sick_leave: '#DC2626',     // red
  bereavement: '#374151',    // dark gray
  medical_permission: '#7C3AED', // purple
  work_letter: '#0891B2',    // cyan
  compensatory: '#059669',   // green
  maternity_leave: '#EC4899', // pink
  paternity_leave: '#8B5CF6', // violet
  personal_day: '#F59E0B',   // amber
  holiday: '#EF4444',        // red
  day_off: '#9CA3AF',        // gray
  permission: '#F97316',     // orange
  other: '#6B7280',          // gray
};
