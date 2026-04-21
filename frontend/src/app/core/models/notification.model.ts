export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  request_id: string | null;
  created_at: string;
}

export interface UnreadCountResponse {
  count: number;
}
