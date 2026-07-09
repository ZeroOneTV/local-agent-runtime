import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalFilesystemAccessService } from './local-filesystem-access.service';
import { LocalFilesystemConfigService } from './local-filesystem.config';
import { FilesystemAuditService } from './filesystem-audit.service';
import { LocalFilesystemPermissionsService } from './local-filesystem-permissions.service';
import { FilesystemOperation } from './local-filesystem.types';

@Controller('filesystem')
export class LocalFilesystemController {
  constructor(
    private readonly access: LocalFilesystemAccessService,
    private readonly fsConfig: LocalFilesystemConfigService,
    private readonly audit: FilesystemAuditService,
    private readonly permissions: LocalFilesystemPermissionsService,
    private readonly config: ConfigService,
  ) {}

  @Get('mode')
  getMode() {
    return {
      enabled: this.fsConfig.enabled,
      mode: this.access.getMode(),
      allowBrowse: this.fsConfig.allowBrowse,
      allowRead: this.fsConfig.allowRead,
      allowWrite: this.fsConfig.allowWrite,
      requireApprovalForWrite: this.fsConfig.requireApprovalForWrite,
      requireApprovalForDelete: this.fsConfig.requireApprovalForDelete,
      mounts: this.fsConfig.mounts,
    };
  }

  @Post('test-access')
  testAccess(
    @Body()
    body: {
      path: string;
      operation?: FilesystemOperation;
      projectId?: string;
      projectRoot?: string;
    },
  ) {
    const projectRoot =
      body.projectRoot ||
      this.config.get<string>('storage.projects') ||
      '/storage/projects';
    const check = this.access.testAccess(
      body.path,
      body.operation || 'list',
      projectRoot,
    );
    return check;
  }

  @Get('permissions')
  listPermissions(@Query('projectId') projectId?: string) {
    return this.permissions.list(projectId);
  }

  @Get('permissions/project/:projectId')
  listByProject(@Param('projectId') projectId: string) {
    return this.permissions.list(projectId);
  }

  @Post('permissions')
  createPermission(
    @Body()
    body: {
      projectId: string;
      mode: string;
      hostPrefix: string;
      containerPrefix?: string;
      accessLevel: string;
      isActive?: boolean;
    },
  ) {
    return this.permissions.create(body);
  }

  @Patch('permissions/:id')
  updatePermission(
    @Param('id') id: string,
    @Body()
    body: {
      mode?: string;
      hostPrefix?: string;
      containerPrefix?: string;
      accessLevel?: string;
      isActive?: boolean;
    },
  ) {
    return this.permissions.update(id, body);
  }

  @Delete('permissions/:id')
  deletePermission(@Param('id') id: string) {
    return this.permissions.delete(id);
  }

  @Get('audit')
  getAudit() {
    return this.audit.getRecent();
  }
}
