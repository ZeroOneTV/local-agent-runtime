import { Controller, Post } from '@nestjs/common';
import { StorageMaintenanceService } from './storage-maintenance.service';

@Controller('storage')
export class StorageController {
  constructor(private readonly maintenance: StorageMaintenanceService) {}

  @Post('cleanup')
  cleanup() {
    return this.maintenance.runScheduledCleanup();
  }
}
