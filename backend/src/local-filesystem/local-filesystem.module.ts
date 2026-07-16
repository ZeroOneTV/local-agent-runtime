import { Module } from '@nestjs/common';
import { LocalFilesystemAccessService } from './local-filesystem-access.service';
import { LocalFilesystemConfigService } from './local-filesystem.config';
import { PathResolverService } from './path-resolver.service';
import { HostPathGuardService } from './path-guard.service';
import { FilesystemPermissionService } from './filesystem-permission.service';
import { FilesystemAuditService } from './filesystem-audit.service';
import { NativeFilesystemProvider } from './providers/native-filesystem.provider';
import { DockerMountedFilesystemProvider } from './providers/docker-mounted-filesystem.provider';
import { HostAgentFilesystemProvider } from './providers/host-agent-filesystem.provider';
import { LocalFilesystemController } from './local-filesystem.controller';
import { LocalFilesystemPermissionsService } from './local-filesystem-permissions.service';
import { HostFilesystemDiscoveryService } from './host-filesystem-discovery.service';

@Module({
  controllers: [LocalFilesystemController],
  providers: [
    LocalFilesystemConfigService,
    PathResolverService,
    HostPathGuardService,
    FilesystemPermissionService,
    FilesystemAuditService,
    NativeFilesystemProvider,
    DockerMountedFilesystemProvider,
    HostAgentFilesystemProvider,
    LocalFilesystemAccessService,
    LocalFilesystemPermissionsService,
    HostFilesystemDiscoveryService,
  ],
  exports: [
    LocalFilesystemAccessService,
    LocalFilesystemConfigService,
    HostFilesystemDiscoveryService,
    PathResolverService,
  ],
})
export class LocalFilesystemModule {}
