import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalFilesystemConfigService } from './local-filesystem.config';
import { PathResolverService } from './path-resolver.service';
import { HostPathGuardService } from './path-guard.service';
import { FilesystemPermissionService } from './filesystem-permission.service';
import {
  DiscoveryResolveResult,
  KnownFolderType,
  NaturalPathReference,
  PathCandidate,
  PathCandidateSource,
  PathResolutionDebug,
  PathResolutionStrategy,
} from './host-filesystem-discovery.types';

const FOLDER_NAMES: Record<
  Exclude<KnownFolderType, 'home' | 'onedrive' | 'project' | 'drive'>,
  string[]
> = {
  documents: ['Documents', 'Documentos', 'My Documents'],
  desktop: ['Desktop', 'Área de Trabalho', 'Area de Trabalho'],
  downloads: ['Downloads', 'Baixados'],
  pictures: ['Pictures', 'Imagens', 'My Pictures'],
  music: ['Music', 'Músicas', 'Musicas', 'My Music'],
  videos: ['Videos', 'Vídeos', 'Videos', 'My Videos'],
};

@Injectable()
export class HostFilesystemDiscoveryService {
  private readonly logger = new Logger(HostFilesystemDiscoveryService.name);

  constructor(
    private readonly fsConfig: LocalFilesystemConfigService,
    private readonly pathResolver: PathResolverService,
    private readonly pathGuard: HostPathGuardService,
    private readonly permissions: FilesystemPermissionService,
  ) {}

  detectHomeDirectory(): string {
    if (this.fsConfig.userHome) return this.fsConfig.userHome;
    if (!this.fsConfig.allowHomeDiscovery) return '';
    return process.env.USERPROFILE || process.env.HOME || os.homedir();
  }

  /**
   * Resolved, existing, allowed personal/known folders on this host, so the LLM
   * can pass correct absolute paths to filesystem tools (native tool-calling).
   */
  listKnownFolders(): Array<{ label: string; path: string }> {
    if (!this.fsConfig.discoveryEnabled) return [];

    const result: Array<{ label: string; path: string }> = [];
    const seen = new Set<string>();
    const push = (label: string, p?: string) => {
      if (!p) return;
      const key = p.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      result.push({ label, path: p });
    };

    const home = this.detectHomeDirectory();
    if (home) push('Home', home);

    const folders: Array<[string, string]> = [
      ['Documentos', 'documents'],
      ['Desktop', 'desktop'],
      ['Downloads', 'downloads'],
      ['Imagens', 'pictures'],
      ['Músicas', 'music'],
      ['Vídeos', 'videos'],
    ];
    for (const [label, keyword] of folders) {
      try {
        const r = this.resolveFromText(keyword, '');
        if (r.status === 'resolved' && r.selected) {
          push(label, r.selected.resolvedPath);
        }
      } catch {
        // skip folders that can't be resolved
      }
    }

    for (const drive of this.detectAvailableDrives()) {
      push(`Drive ${drive}:`, `${drive}:\\`);
    }

    return result;
  }

  detectAvailableDrives(): string[] {
    if (!this.fsConfig.allowDriveDiscovery) {
      return this.fsConfig.allowedDrives;
    }

    const found: string[] = [];
    const allowed = this.fsConfig.allowedDrives;

    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i);
      if (allowed.length && !allowed.includes(letter)) continue;

      const root = `${letter}:\\`;
      if (this.pathExists(root)) {
        found.push(letter);
      }
    }

    // docker-mounted: infer drives from mount hostPrefixes
    if (this.fsConfig.mode === 'docker-mounted') {
      for (const mount of this.fsConfig.mounts) {
        const m = /^([a-zA-Z]):/.exec(mount.hostPrefix);
        if (m) {
          const letter = m[1].toUpperCase();
          if ((!allowed.length || allowed.includes(letter)) && !found.includes(letter)) {
            found.push(letter);
          }
        }
      }
    }

    return found.length ? found : allowed;
  }

  resolveKnownFolder(
    type: KnownFolderType,
    projectRoot?: string,
  ): PathCandidate[] {
    return this.findCandidatePaths({
      kind: type === 'drive' ? 'unknown' : 'known_folder',
      knownFolder: type === 'drive' ? undefined : type,
    }, projectRoot);
  }

  /** Personal/Windows filesystem — takes priority over project.rootPath. */
  isPersonalFilesystemReference(text: string): boolean {
    const lower = text.toLowerCase();
    if (this.extractAbsolutePath(text)) return true;
    if (/[a-z]:\\/i.test(text) || /\\\\/.test(text)) return true;
    if (/\bwindows\b/i.test(lower)) return true;
    if (
      /\b(meus?\s+documentos?|pasta\s+documentos?|documentos?\s+do\s+windows|documents?)\b/i.test(
        lower,
      )
    ) {
      return true;
    }
    if (
      /\b(desktop|área\s+de\s+trabalho|area\s+de\s+trabalho|downloads?|baixados?|pictures?|imagens?|fotos?|m[uú]sicas?|v[ií]deos?|onedrive|pasta\s+do\s+usu[aá]rio|user\s+profile)\b/i.test(
        lower,
      )
    ) {
      return true;
    }
    if (/\b(disco|drive)\s+[a-z]\b/i.test(lower)) return true;
    if (/\b[a-z]\s*:\s*(?:\\|\/)?(?:\s|$)/i.test(lower)) return true;
    return false;
  }

  /** Explicit project/repo references — only then use project.rootPath. */
  isProjectFilesystemReference(text: string): boolean {
    const lower = text.toLowerCase();
    return /\b(projeto|reposit[oó]rio|c[oó]digo|backend|pasta\s+do\s+projeto|diret[oó]rio\s+atual\s+do\s+projeto|project\s+root|repo)\b/i.test(
      lower,
    );
  }

  resolveNaturalPathReference(text: string): NaturalPathReference {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    const absolute = this.extractAbsolutePath(trimmed);
    if (absolute) {
      return { kind: 'absolute', absolutePath: absolute, raw: trimmed };
    }

    // Project root only when explicitly requested (and not a personal Windows folder)
    if (
      this.isProjectFilesystemReference(trimmed) &&
      !this.isPersonalFilesystemReference(trimmed)
    ) {
      return { kind: 'known_folder', knownFolder: 'project', raw: trimmed };
    }

    const drive =
      lower.match(/\b(?:disco|drive)\s+([a-z])\b/i) ||
      lower.match(/\b([a-z])\s*:\s*(?:\\|\/)?(?:\s|$)/i) ||
      lower.match(/\bno\s+([a-z])\s*:/i);
    if (
      drive?.[1] &&
      !/\b(documentos?|desktop|downloads?|pictures?|imagens?)\b/i.test(lower)
    ) {
      return {
        kind: 'drive',
        driveLetter: drive[1].toUpperCase(),
        raw: trimmed,
      };
    }

    if (
      /\b(documentos?|documents?|meus?\s+documentos?|pasta\s+documentos?)\b/i.test(
        lower,
      )
    ) {
      return { kind: 'known_folder', knownFolder: 'documents', raw: trimmed };
    }
    if (/\b(desktop|área\s+de\s+trabalho|area\s+de\s+trabalho)\b/i.test(lower)) {
      return { kind: 'known_folder', knownFolder: 'desktop', raw: trimmed };
    }
    if (/\b(downloads?|baixados?)\b/i.test(lower)) {
      return { kind: 'known_folder', knownFolder: 'downloads', raw: trimmed };
    }
    if (/\b(pictures?|imagens?|fotos?)\b/i.test(lower)) {
      return { kind: 'known_folder', knownFolder: 'pictures', raw: trimmed };
    }
    if (/\b(music|m[uú]sicas?)\b/i.test(lower)) {
      return { kind: 'known_folder', knownFolder: 'music', raw: trimmed };
    }
    if (/\b(videos?|v[ií]deos?)\b/i.test(lower)) {
      return { kind: 'known_folder', knownFolder: 'videos', raw: trimmed };
    }
    if (/\b(onedrive|one\s+drive)\b/i.test(lower)) {
      return { kind: 'known_folder', knownFolder: 'onedrive', raw: trimmed };
    }
    if (
      /\b(home|pasta\s+do\s+usu[aá]rio|meu\s+usu[aá]rio|user\s+profile)\b/i.test(
        lower,
      )
    ) {
      return { kind: 'known_folder', knownFolder: 'home', raw: trimmed };
    }

    return { kind: 'unknown', raw: trimmed };
  }

  findCandidatePaths(
    reference: NaturalPathReference,
    projectRoot?: string,
  ): PathCandidate[] {
    if (!this.fsConfig.discoveryEnabled && reference.kind !== 'absolute') {
      // Discovery off: still allow absolute + optional env overrides
      return this.findWithOverridesOnly(reference, projectRoot);
    }

    const candidates: PathCandidate[] = [];

    if (reference.kind === 'absolute' && reference.absolutePath) {
      candidates.push(
        ...this.candidatesForAbsolute(reference.absolutePath, projectRoot),
      );
    }

    if (reference.kind === 'drive' && reference.driveLetter) {
      candidates.push(
        ...this.candidatesForDrive(reference.driveLetter, projectRoot),
      );
    }

    if (reference.kind === 'known_folder' && reference.knownFolder) {
      candidates.push(
        ...this.candidatesForKnownFolder(reference.knownFolder, projectRoot),
      );
    }

    return this.dedupeCandidates(candidates);
  }

  validateCandidatePaths(
    candidates: PathCandidate[],
    projectRoot: string,
  ): PathCandidate[] {
    return candidates.map((c) => this.validateOne(c, projectRoot));
  }

  rankCandidates(candidates: PathCandidate[]): PathCandidate[] {
    return [...candidates].sort((a, b) => {
      if (a.allowed !== b.allowed) return a.allowed ? -1 : 1;
      if (a.exists !== b.exists) return a.exists ? -1 : 1;
      return b.score - a.score;
    });
  }

  /** Full pipeline: NL text → ranked validated candidates + status. */
  resolveFromText(
    text: string,
    projectRoot: string,
  ): DiscoveryResolveResult {
    const strategy = this.detectStrategy(text);
    const reference = this.resolveNaturalPathReference(text);

    // Personal/Windows folders must never fall back to project.rootPath
    const effectiveProjectRoot =
      strategy === 'host_personal' && reference.knownFolder !== 'project'
        ? ''
        : projectRoot;

    let candidates = this.findCandidatePaths(reference, effectiveProjectRoot || undefined);
    candidates = this.validateCandidatePaths(
      candidates,
      effectiveProjectRoot || projectRoot,
    );
    candidates = this.rankCandidates(candidates);

    const valid = candidates.filter((c) => c.exists && c.allowed);
    const debug = this.buildDebug(strategy, reference, candidates, valid[0]?.resolvedPath);

    this.logger.debug(
      `pathResolution strategy=${strategy} status candidates=${candidates.length} valid=${valid.length} selected=${valid[0]?.resolvedPath || '-'}`,
    );

    if (
      reference.kind === 'absolute' &&
      this.fsConfig.mode === 'docker-mounted' &&
      candidates.some((c) => c.reason === 'needs_mount')
    ) {
      return {
        reference,
        candidates,
        status: 'needs_mount',
        strategy,
        debug,
        message:
          'Path do host sem mount correspondente. Configure HOST_FILESYSTEM_MOUNTS_JSON.',
      };
    }

    if (valid.length === 1) {
      return {
        reference,
        candidates,
        selected: valid[0],
        status: 'resolved',
        strategy,
        debug: this.buildDebug(strategy, reference, candidates, valid[0].resolvedPath),
      };
    }

    if (valid.length > 1) {
      const options = valid
        .map((c, i) => `${i + 1}. ${c.label}: \`${c.resolvedPath}\``)
        .join('\n');
      return {
        reference,
        candidates: valid,
        status: 'ambiguous',
        strategy,
        debug: this.buildDebug(strategy, reference, valid),
        message:
          `Múltiplas pastas válidas encontradas. Qual deseja usar?\n\n${options}\n\nResponda com o número ou o caminho completo.`,
      };
    }

    const blocked = candidates.filter((c) => c.exists && !c.allowed);
    if (blocked.length && !candidates.some((c) => c.exists && c.allowed)) {
      return {
        reference,
        candidates,
        status: 'blocked',
        strategy,
        debug,
        message: blocked[0].reason || 'Caminho bloqueado pelo Permission Engine',
      };
    }

    return {
      reference,
      candidates,
      status: 'not_found',
      strategy,
      debug,
      message:
        'Não encontrei a pasta automaticamente. Informe o caminho completo (ex.: C:\\Users\\SeuUsuario\\Documents).',
    };
  }

  detectStrategy(text: string): PathResolutionStrategy {
    if (this.extractAbsolutePath(text)) return 'absolute';
    if (this.isPersonalFilesystemReference(text)) return 'host_personal';
    if (this.isProjectFilesystemReference(text)) return 'project_root';
    const ref = this.resolveNaturalPathReference(text);
    if (ref.kind === 'known_folder' && ref.knownFolder === 'project') {
      return 'project_root';
    }
    if (ref.kind === 'known_folder' || ref.kind === 'drive') {
      return 'host_personal';
    }
    return 'unknown';
  }

  private buildDebug(
    strategy: PathResolutionStrategy,
    reference: NaturalPathReference,
    candidates: PathCandidate[],
    selectedPath?: string,
  ): PathResolutionDebug {
    return {
      filesystemMode: this.fsConfig.enabled ? this.fsConfig.mode : 'disabled',
      cwd: process.cwd(),
      osHomedir: os.homedir(),
      pathResolutionStrategy: strategy,
      candidates: candidates.map((c) => ({
        path: c.path,
        resolvedPath: c.resolvedPath,
        exists: c.exists,
        allowed: c.allowed,
        source: c.source,
        label: c.label,
      })),
      selectedPath,
      referenceKind: reference.kind,
      knownFolder: reference.knownFolder,
    };
  }

  private findWithOverridesOnly(
    reference: NaturalPathReference,
    projectRoot?: string,
  ): PathCandidate[] {
    if (reference.kind === 'absolute' && reference.absolutePath) {
      return this.candidatesForAbsolute(reference.absolutePath, projectRoot);
    }
    if (reference.kind === 'known_folder' && reference.knownFolder) {
      const override = this.envOverrideFor(reference.knownFolder);
      if (override) {
        return [
          this.makeCandidate(
            override,
            'env_override',
            reference.knownFolder,
            `Override env: ${reference.knownFolder}`,
            100,
          ),
        ];
      }
    }
    return [];
  }

  private candidatesForKnownFolder(
    type: KnownFolderType,
    projectRoot?: string,
  ): PathCandidate[] {
    const out: PathCandidate[] = [];

    if (type === 'project') {
      if (projectRoot) {
        out.push(
          this.makeCandidate(
            projectRoot,
            'project',
            'project',
            'Projeto atual',
            90,
          ),
        );
      }
      return out;
    }

    const override = this.envOverrideFor(type);
    if (override) {
      out.push(
        this.makeCandidate(
          override,
          'env_override',
          type,
          `Override: ${type}`,
          100,
        ),
      );
    }

    if (type === 'home' || type === 'onedrive') {
      const home = this.detectHomeDirectory();
      if (!home) return out;
      if (type === 'home') {
        out.push(
          this.makeCandidate(home, 'home_derived', 'home', 'Home do usuário', 95),
        );
      } else {
        out.push(...this.onedriveRoots(home));
      }
      return out;
    }

    if (!this.fsConfig.allowHomeDiscovery && !override) {
      return out;
    }

    const home = this.detectHomeDirectory() || os.homedir();
    if (!home) return out;

    // Documents: explicit Windows candidates (never project.rootPath)
    if (type === 'documents') {
      const docsCandidates = [
        path.join(home, 'Documents'),
        path.join(home, 'Documentos'),
        path.join(home, 'OneDrive', 'Documents'),
        path.join(home, 'OneDrive', 'Documentos'),
      ];
      for (const p of docsCandidates) {
        out.push(
          this.makeCandidate(
            p,
            p.toLowerCase().includes('onedrive') ? 'onedrive' : 'home_derived',
            'documents',
            p,
            p.toLowerCase().includes('onedrive') ? 80 : 90,
          ),
        );
      }
      // Also scan other OneDrive* roots
      for (const od of this.onedriveRoots(home)) {
        for (const name of ['Documents', 'Documentos']) {
          const p = this.joinPath(od.path, name);
          out.push(
            this.makeCandidate(p, 'onedrive', 'documents', `${name} via ${od.label}`, 80),
          );
        }
      }
      return this.dedupeCandidates(out);
    }

    const names = FOLDER_NAMES[type as keyof typeof FOLDER_NAMES] || [
      type.charAt(0).toUpperCase() + type.slice(1),
    ];

    for (const name of names) {
      out.push(
        this.makeCandidate(
          this.joinPath(home, name),
          'home_derived',
          type,
          `${name} em home`,
          90,
        ),
      );
    }

    // OneDrive variants (common on Windows)
    for (const od of this.onedriveRoots(home)) {
      for (const name of names) {
        out.push(
          this.makeCandidate(
            this.joinPath(od.path, name),
            'onedrive',
            type,
            `${name} via OneDrive`,
            80,
          ),
        );
      }
    }

    // docker-mounted: also try mapping home-derived host paths through mounts
    if (this.fsConfig.mode === 'docker-mounted') {
      for (const mount of this.fsConfig.mounts) {
        for (const name of names) {
          const hostGuess = this.joinPath(
            this.guessHomeFromMount(mount.hostPrefix) || mount.hostPrefix,
            name,
          );
          out.push(
            this.makeCandidate(
              hostGuess,
              'mount',
              type,
              `${name} via mount ${mount.hostPrefix}`,
              70,
            ),
          );
        }
      }
    }

    return out;
  }

  private candidatesForDrive(
    letter: string,
    projectRoot?: string,
  ): PathCandidate[] {
    const L = letter.toUpperCase();
    const hostRoot = `${L}:\\`;

    if (this.fsConfig.mode === 'docker-mounted') {
      const mount = this.fsConfig.mounts.find((m) =>
        new RegExp(`^${L}:`, 'i').test(m.hostPrefix),
      );
      if (!mount) {
        return [
          {
            path: hostRoot,
            resolvedPath: hostRoot,
            source: 'drive',
            knownFolder: 'drive',
            label: `Drive ${L}: (sem mount)`,
            exists: false,
            allowed: false,
            reason: 'needs_mount',
            score: 0,
          },
        ];
      }
      return [
        this.makeCandidate(
          mount.hostPrefix,
          'mount',
          'drive',
          `Drive ${L}: → ${mount.containerPrefix}`,
          85,
        ),
      ];
    }

    return [
      this.makeCandidate(hostRoot, 'drive', 'drive', `Drive ${L}:`, 85),
    ];
  }

  private candidatesForAbsolute(
    absolutePath: string,
    projectRoot?: string,
  ): PathCandidate[] {
    if (this.fsConfig.mode === 'docker-mounted') {
      const container = this.pathResolver.hostToContainer(absolutePath);
      if (!container) {
        return [
          {
            path: absolutePath,
            resolvedPath: absolutePath,
            source: 'absolute',
            label: absolutePath,
            exists: false,
            allowed: false,
            reason: 'needs_mount',
            score: 0,
          },
        ];
      }
      return [
        this.makeCandidate(
          absolutePath,
          'mount',
          undefined,
          `Host ${absolutePath} → ${container}`,
          95,
        ),
      ];
    }

    return [
      this.makeCandidate(absolutePath, 'absolute', undefined, absolutePath, 95),
    ];
  }

  private validateOne(
    candidate: PathCandidate,
    projectRoot: string,
  ): PathCandidate {
    if (candidate.reason === 'needs_mount') {
      return { ...candidate, exists: false, allowed: false };
    }

    const mode = this.fsConfig.mode;
    const resolved = this.pathResolver.resolve(
      candidate.path,
      projectRoot,
      mode,
    );

    const exists = this.pathExists(resolved.resolvedPath) || this.pathExists(candidate.path);

    if (this.pathGuard.isSensitivePath(resolved.resolvedPath)) {
      return {
        ...candidate,
        resolvedPath: resolved.resolvedPath,
        exists,
        allowed: false,
        reason: 'Path sensível bloqueado',
        score: candidate.score - 50,
      };
    }

    // Listing entire drive root is not auto-executed — mark for approval
    if (this.isDriveRoot(candidate.path) || this.isDriveRoot(resolved.resolvedPath)) {
      const access = this.permissions.checkAccess(
        'list',
        resolved,
        { projectRoot, approved: false },
      );
      return {
        ...candidate,
        resolvedPath: resolved.resolvedPath,
        exists,
        allowed: access.allowed && exists,
        reason: exists
          ? 'drive_root_needs_approval'
          : access.reason || 'Caminho não existe',
        score: candidate.score - 20,
      };
    }

    const access = this.permissions.checkAccess(
      'list',
      resolved,
      { projectRoot, approved: false },
    );

    return {
      ...candidate,
      resolvedPath: resolved.resolvedPath,
      exists,
      allowed: access.allowed && exists,
      reason: access.allowed
        ? exists
          ? undefined
          : 'Caminho não existe'
        : access.reason,
      score: access.allowed && exists ? candidate.score : candidate.score - 30,
    };
  }

  private onedriveRoots(home: string): PathCandidate[] {
    const names = [
      'OneDrive',
      'OneDrive - Personal',
      'OneDrive - Pessoal',
    ];
    // Also scan home for OneDrive*
    const roots = names.map((n) => this.joinPath(home, n));
    try {
      if (this.pathExists(home)) {
        const entries = fs.readdirSync(home, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory() && /^OneDrive/i.test(e.name)) {
            const p = this.joinPath(home, e.name);
            if (!roots.includes(p)) roots.push(p);
          }
        }
      }
    } catch {
      // ignore
    }

    return roots.map((p) =>
      this.makeCandidate(p, 'onedrive', 'onedrive', `OneDrive: ${p}`, 75),
    );
  }

  private envOverrideFor(type: KnownFolderType): string | null {
    switch (type) {
      case 'documents':
        return this.fsConfig.documentsPath || null;
      case 'desktop':
        return this.fsConfig.desktopPath || null;
      case 'downloads':
        return this.fsConfig.downloadsPath || null;
      case 'pictures':
        return this.fsConfig.picturesPath || null;
      case 'music':
        return this.fsConfig.musicPath || null;
      case 'videos':
        return this.fsConfig.videosPath || null;
      case 'home':
        return this.fsConfig.userHome || null;
      default:
        return null;
    }
  }

  private makeCandidate(
    p: string,
    source: PathCandidateSource,
    knownFolder: KnownFolderType | undefined,
    label: string,
    score: number,
  ): PathCandidate {
    return {
      path: p,
      resolvedPath: p,
      source,
      knownFolder,
      label,
      exists: false,
      allowed: false,
      score,
    };
  }

  private dedupeCandidates(candidates: PathCandidate[]): PathCandidate[] {
    const seen = new Set<string>();
    const out: PathCandidate[] = [];
    for (const c of candidates) {
      const key = c.path.replace(/\//g, '\\').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }

  private joinPath(base: string, ...parts: string[]): string {
    const clean = base.replace(/[\\/]+$/, '');
    if (/^[a-zA-Z]:/.test(clean) || clean.startsWith('\\\\')) {
      return [clean, ...parts].join('\\');
    }
    return path.posix.join(clean, ...parts);
  }

  private guessHomeFromMount(hostPrefix: string): string | null {
    // e.g. C:\Users\Gabri or /host/home/user
    const win = hostPrefix.match(/^([a-zA-Z]:\\Users\\[^\\/]+)/i);
    if (win) return win[1];
    const posix = hostPrefix.match(/^(\/home\/[^/]+)/);
    if (posix) return posix[1];
    if (/Users|home/i.test(hostPrefix)) return hostPrefix;
    return null;
  }

  private isDriveRoot(p: string): boolean {
    return /^[a-zA-Z]:[\\/]?$/.test(p.trim());
  }

  private pathExists(p: string): boolean {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  }

  extractAbsolutePath(message: string): string | null {
    const cleaned = message.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

    const winBack = cleaned.match(
      /([A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n.]*)/,
    );
    if (winBack) return winBack[1].replace(/[.,;:!?)]+$/, '');

    const winFwd = cleaned.match(
      /([A-Za-z]:\/(?:[^\/:*?"<>|\r\n]+\/)*[^\/:*?"<>|\r\n.]*)/,
    );
    if (winFwd) {
      return winFwd[1].replace(/\//g, '\\').replace(/[.,;:!?)]+$/, '');
    }

    const unc = cleaned.match(/(\\\\[^\s"'`]+)/);
    if (unc) return unc[1].replace(/[.,;:!?)]+$/, '');

    const unix = cleaned.match(
      /(?<![\w])(\/(?:home|Users|tmp|var|opt|mnt|media|host)\/[^\s"'`,]+)/,
    );
    if (unix) return unix[1].replace(/[.,;:!?)]+$/, '');

    return null;
  }
}
