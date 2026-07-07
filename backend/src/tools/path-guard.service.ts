import { Injectable } from '@nestjs/common';
import * as path from 'path';

@Injectable()
export class PathGuardService {
  resolveSafePath(rootPath: string, filePath: string): string | null {
    const resolvedRoot = path.resolve(rootPath);
    const resolved = path.resolve(resolvedRoot, filePath || '.');

    if (
      resolved !== resolvedRoot &&
      !resolved.startsWith(resolvedRoot + path.sep)
    ) {
      return null;
    }

    return resolved;
  }

  isPathEscapeAttempt(filePath: string): boolean {
    const dangerous = ['..', '/etc/', 'C:\\Windows', '/Users/', '~/'];
    const normalized = filePath.replace(/\\/g, '/');
    return dangerous.some((d) => normalized.includes(d));
  }
}
