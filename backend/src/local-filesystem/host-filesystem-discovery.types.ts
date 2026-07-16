export type KnownFolderType =
  | 'documents'
  | 'desktop'
  | 'downloads'
  | 'pictures'
  | 'music'
  | 'videos'
  | 'home'
  | 'onedrive'
  | 'project'
  | 'drive';

export type PathCandidateSource =
  | 'env_override'
  | 'home_derived'
  | 'onedrive'
  | 'drive'
  | 'mount'
  | 'absolute'
  | 'project';

export type PathResolutionStrategy =
  | 'host_personal'
  | 'project_root'
  | 'absolute'
  | 'unknown';

export interface PathCandidate {
  path: string;
  /** Path usable by the runtime (host or container). */
  resolvedPath: string;
  source: PathCandidateSource;
  knownFolder?: KnownFolderType;
  label: string;
  exists: boolean;
  allowed: boolean;
  reason?: string;
  score: number;
}

export interface NaturalPathReference {
  kind: 'known_folder' | 'drive' | 'absolute' | 'unknown';
  knownFolder?: KnownFolderType;
  driveLetter?: string;
  absolutePath?: string;
  raw?: string;
}

export interface PathResolutionDebug {
  filesystemMode: string;
  cwd: string;
  osHomedir: string;
  pathResolutionStrategy: PathResolutionStrategy;
  candidates: Array<{
    path: string;
    resolvedPath: string;
    exists: boolean;
    allowed: boolean;
    source: string;
    label: string;
  }>;
  selectedPath?: string;
  referenceKind?: string;
  knownFolder?: string;
}

export interface DiscoveryResolveResult {
  reference: NaturalPathReference;
  candidates: PathCandidate[];
  /** Best single candidate when unambiguous. */
  selected?: PathCandidate;
  status: 'resolved' | 'ambiguous' | 'not_found' | 'needs_mount' | 'blocked';
  message?: string;
  strategy: PathResolutionStrategy;
  debug: PathResolutionDebug;
}
