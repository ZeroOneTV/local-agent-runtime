import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PermissionEngineService } from './permission-engine.service';
import { PolicyEngineService } from './policy-engine.service';
import { ShellGuardService } from './shell-guard.service';
import { SecurityConfigService } from './security.config';
import { SecurityController } from './security.controller';

@Module({
  controllers: [SecurityController],
  providers: [
    SecurityConfigService,
    AuditService,
    PermissionEngineService,
    PolicyEngineService,
    ShellGuardService,
  ],
  exports: [
    SecurityConfigService,
    AuditService,
    PermissionEngineService,
    PolicyEngineService,
    ShellGuardService,
  ],
})
export class SecurityModule {}
