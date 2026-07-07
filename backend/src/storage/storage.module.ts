import { Module } from '@nestjs/common';
import { ArtifactsService } from './artifacts.service';
import { StorageMaintenanceService } from './storage-maintenance.service';
import { StorageController } from './storage.controller';

@Module({
  controllers: [StorageController],
  providers: [ArtifactsService, StorageMaintenanceService],
  exports: [ArtifactsService, StorageMaintenanceService],
})
export class StorageModule {}
