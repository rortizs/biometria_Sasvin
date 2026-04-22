export interface Permission {
  id: string;
  code: string;
  module: string;
  action: string;
  scope: string;
  description: string | null;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  permissions: Permission[];
}

export interface RoleCreate {
  name: string;
  description?: string | null;
  permission_ids?: string[];
}

export interface RoleUpdate {
  name?: string;
  description?: string | null;
  is_active?: boolean;
}

export interface UserRoleAssignmentResponse {
  id: string;
  user_id: string;
  role_id: string;
  role: Role;
  assigned_at: string;
  assigned_by: string | null;
}
