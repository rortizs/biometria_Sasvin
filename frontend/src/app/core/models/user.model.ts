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

// `/auth/me`-only wire shape (backend/app/schemas/user.py's
// `AuthMeResponse(UserResponse)`, task 4.3a). Adds the current user's
// deduplicated, sorted granted permission codes so the frontend can gate
// guards/UI by permission code instead of hardcoding a role→permission map
// that would drift from the admin-configurable Roles UI. No other endpoint
// (`GET /users/`, `PATCH /users/{id}`, etc.) returns this shape — those
// still resolve to plain `User`.
export interface AuthMeResponse extends User {
  permissions: string[];
}

// Canonical roles (design.md, "Canonical Roles" spec requirement). Mirrors
// backend/app/models/user.py's `UserRole` enum values exactly — these are
// the uppercase strings the backend actually serializes on the wire
// (`UserResponse.role` is a `str, Enum` member; Pydantic v2 emits its
// `.value`, e.g. "COORDINADOR", never a legacy lowercase alias name).
//
// `ADMINISTRATIVO` is intentionally NOT included here: it remains defined
// at the database enum level for backward compatibility but MUST NOT be
// assignable to any user through any API (design.md D1), so it is not a
// value the frontend should ever need to model or accept.
//
// Historical note only — the OLD legacy lowercase union this type replaced
// was `'admin' | 'director' | 'coordinador' | 'secretaria' | 'catedratico'
// | 'supervisor'`. Several call sites still compare against those lowercase
// literals (`auth.guard.ts`, `auth.service.ts`, `login.component.ts`,
// `my-requests.component.ts`, `permission-requests.component.ts`,
// `users.component.ts`) and are intentionally left unchanged by this task —
// see apply-progress.md task 4.1 evidence for the full list; they are
// updated by tasks 4.3/4.4/4.5/4.7.
export type UserRole =
  | 'ADMIN'
  | 'DEV'
  | 'DECANO'
  | 'DUEÑO'
  | 'DIRECTOR'
  | 'COORDINADOR'
  | 'SECRETARIA'
  | 'CATEDRATICO'
  | 'ESTUDIANTE'
  | 'PADRES';

// Mirrors backend/app/schemas/user_scope_assignment.py's
// `UserScopeAssignmentResponse` (design.md D4). Exactly one of
// `department_id` / `location_id` / `director_user_id` is set per row,
// enforced server-side by a CHECK constraint + a 422-raising Pydantic
// validator — the frontend type does not re-encode that invariant since
// TypeScript has no clean "exactly one of" shape for optional fields.
export interface UserScopeAssignment {
  id: string;
  user_id: string;
  department_id: string | null;
  location_id: string | null;
  director_user_id: string | null;
  created_at: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}
