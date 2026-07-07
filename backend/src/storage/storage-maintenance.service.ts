import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface CleanupResult {
  tempFilesRemoved: number;
  artifactFilesRemoved: number;
  bytesFreed: number;
}

@Injectable()
export class StorageMaintenanceService {
  private readonly logger = new Logger(StorageMaintenanceService.name);

  constructor(private readonly config: ConfigService) {}

  async cleanupTemp(maxAgeHours = 24): Promise<CleanupResult> {
    const tempDir = this.config.get<string>('storage.temp') || '/storage/temp';
    return this.cleanupDirectory(tempDir, maxAgeHours * 60 * 60 * 1000, ['.gitkeep']);
  }

  async cleanupOldArtifacts(maxAgeDays = 30): Promise<CleanupResult> {
    const artifactsDir =
      this.config.get<string>('storage.artifacts') || '/storage/artifacts';
    return this.cleanupDirectory(artifactsDir, maxAgeDays * 24 * 60 * 60 * 1000, [
      '.gitkeep',
    ]);
  }

  async runScheduledCleanup(): Promise<CleanupResult> {
    const tempMaxHours =
      this.config.get<number>('storage.tempMaxAgeHours') ?? 24;
    const artifactMaxDays =
      this.config.get<number>('storage.artifactMaxAgeDays') ?? 30;

    const [temp, artifacts] = await Promise.all([
      this.cleanupTemp(tempMaxHours),
      this.cleanupOldArtifacts(artifactMaxDays),
    ]);

    const result: CleanupResult = {
      tempFilesRemoved: temp.tempFilesRemoved + artifacts.tempFilesRemoved,
      artifactFilesRemoved: temp.artifactFilesRemoved + artifacts.artifactFilesRemoved,
      bytesFreed: temp.bytesFreed + artifacts.bytesFreed,
    };

    this.logger.log(
      `Cleanup: ${result.tempFilesRemoved} temp, ${result.artifactFilesRemoved} artifacts, ${result.bytesFreed} bytes`,
    );

    return result;
  }

  private async cleanupDirectory(
    dir: string,
    maxAgeMs: number,
    skipNames: string[],
  ): Promise<CleanupResult> {
    const result: CleanupResult = {
      tempFilesRemoved: 0,
      artifactFilesRemoved: 0,
      bytesFreed: 0,
    };

    let entries: { name: string; isFile: () => boolean; isDirectory: () => boolean }[] = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true }) as typeof entries;
    } catch {
      return result;
    }

    const cutoff = Date.now() - maxAgeMs;
    const isArtifactDir = dir.includes('artifacts');

    for (const entry of entries) {
      if (skipNames.includes(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const nested = await this.cleanupDirectory(fullPath, maxAgeMs, skipNames);
        result.tempFilesRemoved += nested.tempFilesRemoved;
        result.artifactFilesRemoved += nested.artifactFilesRemoved;
        result.bytesFreed += nested.bytesFreed;
        continue;
      }

      if (!entry.isFile()) continue;

      try {
        const stat = await fs.stat(fullPath);
        if (stat.mtimeMs > cutoff) continue;

        await fs.unlink(fullPath);
        if (isArtifactDir) {
          result.artifactFilesRemoved++;
        } else {
          result.tempFilesRemoved++;
        }
        result.bytesFreed += stat.size;
      } catch {
        // ignore per-file errors
      }
    }

    return result;
  }
}
