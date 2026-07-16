import { Injectable } from '@nestjs/common';
import { HostFilesystemDiscoveryService } from '../local-filesystem/host-filesystem-discovery.service';
import { KnownFolderType } from '../local-filesystem/host-filesystem-discovery.types';

/**
 * Thin facade over HostFilesystemDiscoveryService for known-folder labels.
 * Prefer HostFilesystemDiscoveryService for path resolution.
 */
@Injectable()
export class KnownFoldersResolverService {
  constructor(private readonly discovery: HostFilesystemDiscoveryService) {}

  get userHome(): string {
    return this.discovery.detectHomeDirectory();
  }

  resolve(kind: KnownFolderType, projectRoot?: string): string | null {
    const candidates = this.discovery.resolveKnownFolder(kind, projectRoot);
    const best = candidates.find((c) => c.source === 'env_override') || candidates[0];
    return best?.path || null;
  }

  detectFromMessage(message: string): KnownFolderType | null {
    const ref = this.discovery.resolveNaturalPathReference(message);
    return ref.knownFolder || null;
  }
}
