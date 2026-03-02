export interface ActivityLog {
  id: string;
  org_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  metadata: Record<string, any> | null;
  actor_user_id: string | null;
  created_at: string;
  actor?: {
    id: string;
    full_name: string | null;
    email: string;
  };
}

export interface ActivityLogGrouped {
  date: string;
  logs: ActivityLog[];
}
