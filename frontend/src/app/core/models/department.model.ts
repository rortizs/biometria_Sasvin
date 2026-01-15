export interface Department {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface DepartmentCreate {
  name: string;
  description?: string | null;
}
