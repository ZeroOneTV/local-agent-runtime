import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { LocalFilesystemConfigService } from './local-filesystem.config';
import { ResolvedPathInfo } from './local-filesystem.types';

const WINDOWS_BLOCKED_DIRS = [
  'C:/Windows',
  'C:/Program Files',
  'C:/Program Files (x86)',
];

const UNIX_BLOCKED_DIRS = [
  '/etc',
  '/bin',
  '/sbin',
  '/usr/bin',
  '/usr/sbin',
  '/var',
  '/private',
];

const BLOCKED_FILE_PATTERNS = [
  /^\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /^id_rsa$/i,
  /^id_ed25519$/i,
  /credentials/i,
  /token/i,
  /secrets/i,
  /\.pfx$/i,
  /\.p12$/i,
];

@Injectable()
export class HostPathGuardService {
  constructor(private readonly fsConfig: LocalFilesystemConfigService) {}

  isTraversalAttempt(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    return (
      normalized.includes('/../') ||
      normalized.startsWith('../') ||
      normalized.endsWith('/..') ||
      normalized === '..'
    );
  }

  isSensitivePath(resolvedPath: string): boolean {
    if (!this.fsConfig.blockSensitivePaths) return false;

    const normalized = resolvedPath.replace(/\\/g, '/');
    const lower = normalized.toLowerCase();
    const basename = path.basename(normalized);

    if (BLOCKED_FILE_PATTERNS.some((p) => p.test(basename))) {
      return true;
    }

    if (this.matchesWindowsSensitive(lower)) return true;
    if (this.matchesUnixSensitive(lower)) return true;

    return false;
  }

  isDriveAllowed(resolved: ResolvedPathInfo): boolean {
    const drives = this.fsConfig.allowedDrives;
    if (!drives.length) return true;

    const match = /^([a-zA-Z]):/.exec(resolved.resolvedPath);
    if (!match) return true;
    return drives.includes(match[1].toUpperCase());
  }

  isWithinProjectRoot(projectRoot: string, resolvedPath: string): boolean {
    const root = path.resolve(projectRoot);
    const target = path.resolve(resolvedPath);
    return target === root || target.startsWith(root + path.sep);
  }

  private matchesWindowsSensitive(normalized: string): boolean {
    if (WINDOWS_BLOCKED_DIRS.some((d) => normalized.startsWith(d.toLowerCase()))) {
      return true;
    }

    const appData = /\/users\/[^/]+\/appdata/i;
    const ssh = /\/users\/[^/]+\/\.ssh/i;
    const aws = /\/users\/[^/]+\/\.aws/i;
    const azure = /\/users\/[^/]+\/\.azure/i;
    const docker = /\/users\/[^/]+\/\.docker/i;
    const kube = /\/users\/[^/]+\/\.kube/i;

    return (
      appData.test(normalized) ||
      ssh.test(normalized) ||
      aws.test(normalized) ||
      azure.test(normalized) ||
      docker.test(normalized) ||
      kube.test(normalized)
    );
  }

  private matchesUnixSensitive(normalized: string): boolean {
    if (UNIX_BLOCKED_DIRS.some((d) => normalized === d || normalized.startsWith(d + '/'))) {
      return true;
    }

    const homeSensitive = [
      '/.ssh',
      '/.aws',
      '/.azure',
      '/.docker',
      '/.kube',
    ];
    return homeSensitive.some(
      (s) => normalized.includes(s) || normalized.endsWith(s.slice(1)),
    );
  }
}
