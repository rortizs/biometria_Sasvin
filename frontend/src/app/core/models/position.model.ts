export interface Position {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  // Design D6 / task 3.4 (`positions.canonical_role`), exposed by the
  // backend's `PositionResponse` (task 4.7a). Drives the create/edit
  // position picker restriction in `employees.component.ts` (task 4.7),
  // mirroring the backend's `require_teacher_position` gate.
  canonical_role: string | null;
}
