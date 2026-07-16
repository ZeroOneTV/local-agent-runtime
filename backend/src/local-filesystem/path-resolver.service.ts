import { Injectable } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import { LocalFilesystemConfigService } from './local-filesystem.config';
import {
  FilesystemAccessLevel,
  FilesystemMount,
  HostFilesystemMode,
  ResolvedPathInfo,
} from './local-filesystem.types';

/** Relative labels that must NEVER be joined with project.rootPath. */
const KNOWN_FOLDER_LABELS =
  /^(documentos?|documents?|desktop|área de trabalho|area de trabalho|downloads?|baixados?|pictures?|imagens?|fotos?|music|m[uú]sicas?|videos?|v[ií]deos?|home|onedrive)$/i;

@Injectable()
export class PathResolverService {
  constructor(private readonly fsConfig: LocalFilesystemConfigService) {}

  normalizeSeparators(p: string): string {
    return p.replace(/\\/g, '/');
  }

  expandHome(p: string): string {
    if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
      return path.join(os.homedir(), p.slice(2));
    }
    return p;
  }

  isAbsolute(p: string): boolean {
    const n = this.normalizeSeparators(p);
    return (
      n.startsWith('/') ||
      /^[a-zA-Z]:/.test(p) ||
      p.startsWith('\\\\')
    );
  }

  isKnownFolderLabel(p: string): boolean {
    return KNOWN_FOLDER_LABELS.test(p.trim());
  }

  isHostPath(p: string, projectRoot: string): boolean {
    if (!this.isAbsolute(p)) return false;
    const resolved = path.resolve(this.expandHome(p));
    const root = path.resolve(projectRoot);
    return resolved !== root && !resolved.startsWith(root + path.sep);
  }

  resolve(
    inputPath: string,
    projectRoot: string,
    mode: HostFilesystemMode,
  ): ResolvedPathInfo {
    const originalPath = inputPath || '.';
    const expanded = this.expandHome(originalPath);

    // Never map "documentos"/"desktop"/etc. onto project.rootPath
    if (this.isKnownFolderLabel(expanded) && !this.isAbsolute(expanded)) {
      return {
        originalPath,
        resolvedPath: originalPath,
        mode,
        accessLevel: 'blocked',
        isProjectScoped: false,
      };
    }

    if (!this.isHostPath(expanded, projectRoot)) {
      const resolved = path.resolve(
        path.resolve(projectRoot),
        expanded === '.' ? '' : expanded,
      );
      return {
        originalPath,
        resolvedPath: resolved,
        mode,
        accessLevel: 'read_write_approval',
        isProjectScoped: true,
      };
    }

    if (mode === 'disabled') {
      return {
        originalPath,
        resolvedPath: originalPath,
        mode,
        accessLevel: 'blocked',
        isProjectScoped: false,
      };
    }

    if (mode === 'native' || mode === 'host-agent') {
      const resolved = path.resolve(expanded);
      return {
        originalPath,
        resolvedPath: resolved,
        mode,
        accessLevel: this.resolveAccessForNative(resolved),
        isProjectScoped: false,
      };
    }

    return this.resolveDockerMounted(expanded, mode);
  }

  hostToContainer(hostPath: string): string | null {
    const mount = this.findMount(hostPath);
    if (!mount) return null;

    const normalizedHost = this.normalizeSeparators(
      path.resolve(this.expandHome(hostPath)),
    );
    const hostPrefix = this.normalizeSeparators(
      path.resolve(this.expandHome(mount.hostPrefix)),
    );
    const containerPrefix = this.normalizeSeparators(mount.containerPrefix);
    const suffix = normalizedHost.slice(hostPrefix.length);
    return path.posix.join(containerPrefix, suffix.replace(/^\//, ''));
  }

  private resolveDockerMounted(
    hostPath: string,
    mode: HostFilesystemMode,
  ): ResolvedPathInfo {
    const containerPath = this.hostToContainer(hostPath);
    const mount = this.findMount(hostPath);

    if (!containerPath || !mount) {
      return {
        originalPath: hostPath,
        resolvedPath: hostPath,
        mode,
        accessLevel: 'blocked',
        isProjectScoped: false,
      };
    }

    return {
      originalPath: hostPath,
      resolvedPath: containerPath,
      mode,
      accessLevel: mount.access,
      isProjectScoped: false,
      mount,
    };
  }

  private findMount(hostPath: string): FilesystemMount | undefined {
    const normalizedHost = this.normalizeSeparators(
      path.resolve(this.expandHome(hostPath)),
    );

    const matches = this.fsConfig.mounts.filter((mount) => {
      const hostPrefix = this.normalizeSeparators(
        path.resolve(this.expandHome(mount.hostPrefix)),
      );
      return (
        normalizedHost === hostPrefix ||
        normalizedHost.startsWith(hostPrefix + '/')
      );
    });

    if (!matches.length) return undefined;

    return matches.sort((a, b) => {
      const lenA = path.resolve(this.expandHome(a.hostPrefix)).length;
      const lenB = path.resolve(this.expandHome(b.hostPrefix)).length;
      return lenB - lenA;
    })[0];
  }

  private resolveAccessForNative(resolved: string): FilesystemAccessLevel {
    const mount = this.findMount(resolved);
    if (mount) return mount.access;
    return this.fsConfig.defaultAccess;
  }
}
