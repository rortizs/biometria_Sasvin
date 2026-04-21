export type PermissionRequestStatus =
  | 'pending'
  | 'coordinator_approved'
  | 'approved'
  | 'rejected';

export type RejectionStage = 'coordinator' | 'director';

export interface PermissionRequest {
  id: string;
  requested_by_user_id: string;
  employee_id: string;
  exception_type: string;
  start_date: string;
  end_date: string;
  description: string | null;
  status: PermissionRequestStatus;
  coordinator_reviewed_by: string | null;
  coordinator_reviewed_at: string | null;
  coordinator_notes: string | null;
  director_reviewed_by: string | null;
  director_reviewed_at: string | null;
  director_notes: string | null;
  rejection_stage: RejectionStage | null;
  rejection_reason: string | null;
  schedule_exception_id: string | null;
  created_at: string;
  // enriched fields (may be populated by backend or resolved client-side)
  employee_name?: string;
}

export interface PermissionRequestCreate {
  employee_id: string;
  exception_type: string;
  start_date: string;
  end_date: string;
  description?: string;
}

export interface PermissionRequestFilters {
  status?: PermissionRequestStatus;
  employee_id?: string;
}

export const STATUS_LABELS: Record<PermissionRequestStatus, string> = {
  pending: 'Pendiente',
  coordinator_approved: 'Aprobado por Coordinador',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

export const STATUS_COLORS: Record<PermissionRequestStatus, string> = {
  pending: '#F59E0B',
  coordinator_approved: '#3B82F6',
  approved: '#10B981',
  rejected: '#EF4444',
};

export const STATUS_BG_CLASSES: Record<PermissionRequestStatus, string> = {
  pending: 'badge-pending',
  coordinator_approved: 'badge-coordinator',
  approved: 'badge-approved',
  rejected: 'badge-rejected',
};
