export interface AuditLog {
  id?: number;
  timestamp?: Date;
  user_email: string;
  project_id?: string | null;
  action: AuditAction;
  resource_type?: string | null;
  resource_id?: string | null;
  method?: string | null;
  path?: string | null;
  details?: Record<string, any> | null;
  success: boolean;
  error_message?: string | null;
  session_id?: string | null;
}

export type AuditAction =
  | "USER_LOGIN"
  | "USER_LOGOUT"
  | "USER_ACTIVITY"
  | "CREATE_PROJECT"
  | "UPDATE_PROJECT"
  | "DELETE_PROJECT"
  | "CREATE_USER"
  | "UPDATE_USER"
  | "DELETE_USER"
  | "INSTALL_MODULE"
  | "UNINSTALL_MODULE"
  | "UPDATE_MODULE_PARAMS"
  | "RUN_MODULE"
  | "CREATE_DATASET"
  | "UPDATE_DATASET"
  | "DELETE_DATASET"
  | "UPLOAD_DATA"
  | "CREATE_REPORT"
  | "UPDATE_REPORT"
  | "DELETE_REPORT"
  | "CREATE_PRESENTATION"
  | "UPDATE_PRESENTATION"
  | "DELETE_PRESENTATION"
  | "IMPORT_STRUCTURE"
  | "UPDATE_STRUCTURE"
  | "IMPORT_HMIS_DATA"
  | "EXPORT_DATA"
  | string;

export interface AuditConfig {
  action: AuditAction;
  extractResourceId?: (c: any) => string | undefined;
  extractResourceType?: (c: any) => string | undefined;
  details?: (c: any) => Record<string, any> | undefined;
  skipOnError?: boolean;
}

export interface DirectAuditLog {
  user_email: string;
  action: AuditAction;
  project_id?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  method?: string | null;
  path?: string | null;
  details?: Record<string, any> | null;
  success: boolean;
  error_message?: string | null;
  session_id?: string | null;
}

export interface ActivityConfig {
  throttleMinutes?: number;
  excludePaths?: string[];
  onlyLoggedInUsers?: boolean;
}

export interface LoginDetails {
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
  auth_method?: string;
}