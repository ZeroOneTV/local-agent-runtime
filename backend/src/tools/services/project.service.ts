import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StructuredToolResult } from '../tools.types';

@Injectable()
export class ProjectInspectService {
  async inspectStructure(
    rootPath: string,
    depth = 2,
  ): Promise<StructuredToolResult> {
    const tree = await this.buildTree(rootPath, rootPath, depth);
    return { success: true, data: { structure: tree } };
  }

  async detectStack(rootPath: string): Promise<StructuredToolResult> {
    const indicators: string[] = [];
    const checks: [string, string][] = [
      ['package.json', 'Node.js'],
      ['docker-compose.yml', 'Docker Compose'],
      ['prisma/schema.prisma', 'Prisma'],
      ['nest-cli.json', 'NestJS'],
      ['next.config.js', 'Next.js'],
      ['requirements.txt', 'Python'],
      ['Cargo.toml', 'Rust'],
      ['go.mod', 'Go'],
    ];

    for (const [file, stack] of checks) {
      try {
        await fs.access(path.join(rootPath, file));
        indicators.push(stack);
      } catch {
        // not found
      }
    }

    return { success: true, data: { stack: indicators } };
  }

  async listDependencies(rootPath: string): Promise<StructuredToolResult> {
    const pkgPath = path.join(rootPath, 'package.json');
    try {
      const raw = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(raw);
      return {
        success: true,
        data: {
          dependencies: pkg.dependencies ?? {},
          devDependencies: pkg.devDependencies ?? {},
        },
      };
    } catch {
      return {
        success: false,
        error: { code: 'NO_PACKAGE_JSON', message: 'package.json não encontrado' },
      };
    }
  }

  private async buildTree(
    base: string,
    dir: string,
    depth: number,
  ): Promise<unknown> {
    if (depth <= 0) return '...';

    const entries = await fs.readdir(dir, { withFileTypes: true });
    const result: Record<string, unknown> = {};

    for (const entry of entries.slice(0, 30)) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        result[entry.name] = await this.buildTree(base, full, depth - 1);
      } else {
        result[entry.name] = 'file';
      }
    }

    return result;
  }
}
