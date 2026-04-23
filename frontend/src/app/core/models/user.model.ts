export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  employee_id: string | null;
  created_at: string;
  updated_at: string;
}

export type UserRole =
  | 'admin'
  | 'director'
  | 'coordinador'
  | 'secretaria'
  | 'catedratico'
  | 'supervisor'; // legacy — keep for backward compat

export interface LoginRequest {
  username: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}
