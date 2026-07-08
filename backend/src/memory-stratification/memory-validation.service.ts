import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ExportManifest, ImportValidationResult } from './memory.types';
import { MemoryStratificationConfigService } from './memory-stratification.config';
import { MemoryCompatibilityService } from './memory-compatibility.service';

@Injectable()
export class MemoryValidationService {
  constructor(
    private readonly config: MemoryStratificationConfigService,
    private readonly compatibility: MemoryCompatibilityService,
  ) {}

  async validateZipExtract(extractDir: string): Promise<ImportValidationResult> {
    const warnings: string[] = [];
    const conflicts: string[] = [];

    const manifestPath = path.join(extractDir, 'manifest.json');
    const manifestRaw = await this.readJsonFile(manifestPath);
    if (!manifestRaw) {
      return {
        valid: false,
        requiresReembedding: true,
        warnings: ['manifest.json ausente'],
        conflicts,
      };
    }

    const manifest = manifestRaw as ExportManifest;
    if (!manifest.exportFormatVersion) {
      warnings.push('exportFormatVersion ausente');
    }

    const checksumsPath = path.join(extractDir, 'checksums.json');
    const checksums = (await this.readJsonFile(checksumsPath)) as Record<
      string,
      string
    > | null;

    if (checksums) {
      for (const [relPath, expected] of Object.entries(checksums)) {
        const full = path.join(extractDir, relPath);
        const safe = this.assertSafePath(extractDir, full);
        if (!safe) {
          return {
            valid: false,
            requiresReembedding: true,
            warnings: [`Path traversal detectado: ${relPath}`],
            conflicts,
          };
        }
        try {
          const hash = await this.sha256File(full);
          const normalized = expected.replace(/^sha256:/, '');
          if (hash !== normalized) {
            conflicts.push(`Checksum inválido: ${relPath}`);
          }
        } catch {
          conflicts.push(`Arquivo ausente: ${relPath}`);
        }
      }
    } else {
      warnings.push('checksums.json ausente — validação parcial');
    }

    const embedCheck = this.compatibility.checkEmbeddingCompatibility(manifest);

    return {
      valid: conflicts.length === 0,
      formatVersion: manifest.exportFormatVersion,
      requiresReembedding: embedCheck.requiresReembedding,
      warnings: [...warnings, embedCheck.reason].filter(Boolean),
      conflicts,
    };
  }

  assertSafePath(baseDir: string, targetPath: string): boolean {
    const resolvedBase = path.resolve(baseDir);
    const resolvedTarget = path.resolve(targetPath);
    return resolvedTarget.startsWith(resolvedBase + path.sep) || resolvedTarget === resolvedBase;
  }

  assertZipSize(sizeBytes: number) {
    const max = this.config.exportMaxSizeMb * 1024 * 1024;
    if (sizeBytes > max) {
      throw new BadRequestException(
        `Export excede limite de ${this.config.exportMaxSizeMb}MB`,
      );
    }
  }

  sanitizeFileName(name: string) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
  }

  async sha256File(filePath: string): Promise<string> {
    const data = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  async sha256String(content: string): Promise<string> {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async readJsonFile(filePath: string): Promise<unknown | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
