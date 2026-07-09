import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FilesystemAccessLevel,
  FilesystemMount,
  HostFilesystemMode,
} from './local-filesystem.types';

@Injectable()
export class LocalFilesystemConfigService {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<boolean>('hostFilesystem.enabled') ?? false;
  }

  get mode(): HostFilesystemMode {
    return (
      this.config.get<HostFilesystemMode>('hostFilesystem.mode') ?? 'disabled'
    );
  }

  get allowBrowse(): boolean {
    return this.config.get<boolean>('hostFilesystem.allowBrowse') ?? true;
  }

  get allowRead(): boolean {
    return this.config.get<boolean>('hostFilesystem.allowRead') ?? true;
  }

  get allowWrite(): boolean {
    return this.config.get<boolean>('hostFilesystem.allowWrite') ?? false;
  }

  get requireApprovalForWrite(): boolean {
    return (
      this.config.get<boolean>('hostFilesystem.requireApprovalForWrite') ?? true
    );
  }

  get requireApprovalForDelete(): boolean {
    return (
      this.config.get<boolean>('hostFilesystem.requireApprovalForDelete') ??
      true
    );
  }

  get blockSensitivePaths(): boolean {
    return (
      this.config.get<boolean>('hostFilesystem.blockSensitivePaths') ?? true
    );
  }

  get auditEnabled(): boolean {
    return this.config.get<boolean>('hostFilesystem.auditEnabled') ?? true;
  }

  get allowedDrives(): string[] {
    const raw =
      this.config.get<string>('hostFilesystem.allowedDrives') || '';
    return raw
      .split(',')
      .map((d) => d.trim().toUpperCase())
      .filter(Boolean);
  }

  get defaultAccess(): FilesystemAccessLevel {
    return (
      this.config.get<FilesystemAccessLevel>('hostFilesystem.defaultAccess') ??
      'read'
    );
  }

  get mounts(): FilesystemMount[] {
    return this.config.get<FilesystemMount[]>('hostFilesystem.mounts') ?? [];
  }

  get hostAgentBaseUrl(): string {
    return (
      this.config.get<string>('hostFilesystem.hostAgentBaseUrl') ||
      'http://host.docker.internal:3847'
    );
  }

  get hostAgentTimeoutMs(): number {
    return (
      this.config.get<number>('hostFilesystem.hostAgentTimeoutMs') ?? 30000
    );
  }

  get maxDirectoryDepth(): number {
    return this.config.get<number>('security.maxDirectoryDepth') ?? 8;
  }

  get maxFilesPerSearch(): number {
    return this.config.get<number>('security.maxFilesPerSearch') ?? 100;
  }
}
