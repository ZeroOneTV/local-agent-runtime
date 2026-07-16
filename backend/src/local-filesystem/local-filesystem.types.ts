export type HostFilesystemMode =
  | 'disabled'
  | 'native'
  | 'docker-mounted'
  | 'host-agent';

export type FilesystemAccessLevel =
  | 'browse'
  | 'read'
  | 'read_write_approval'
  | 'read_write_auto'
  | 'delete_approval'
  | 'blocked';

export type FilesystemOperation =
  | 'list'
  | 'read'
  | 'search'
  | 'write'
  | 'delete'
  | 'stat'
  | 'size_summary';

export interface FilesystemMount {
  hostPrefix: string;
  containerPrefix: string;
  access: FilesystemAccessLevel;
}

export interface ResolvedPathInfo {
  originalPath: string;
  resolvedPath: string;
  mode: HostFilesystemMode;
  accessLevel: FilesystemAccessLevel;
  isProjectScoped: boolean;
  mount?: FilesystemMount;
}

export interface FilesystemAccessCheck {
  allowed: boolean;
  mode: HostFilesystemMode;
  originalPath: string;
  resolvedPath: string;
  accessLevel?: FilesystemAccessLevel;
  reason?: string;
  requiresApproval?: boolean;
  risk?: string;
}

export interface FilesystemAuditEntry {
  operation: FilesystemOperation;
  originalPath: string;
  resolvedPath: string;
  mode: HostFilesystemMode;
  projectId?: string;
  conversationId?: string;
  risk: string;
  approved: boolean;
  status: 'success' | 'blocked' | 'error';
  errorCode?: string;
  timestamp: string;
}

export interface FilesystemOperationContext {
  projectId?: string;
  conversationId?: string;
  approved?: boolean;
  projectRoot: string;
}
