export interface Employee {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  hire_date: string | null;
  is_active: boolean;
  created_at: string;
  has_face_registered: boolean;
  department_id: string | null;
  position_id: string | null;
  location_id: string | null;
}

export interface EmployeeCreate {
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  hire_date?: string;
  department_id?: string | null;
  position_id?: string | null;
  location_id?: string | null;
}

export interface EmployeeUpdate {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  hire_date?: string;
  is_active?: boolean;
  department_id?: string | null;
  position_id?: string | null;
  location_id?: string | null;
}
