import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import { StructuredToolResult } from '../tools.types';

const execAsync = promisify(exec);

@Injectable()
export class GitService {
  private async run(
    rootPath: string,
    command: string,
    timeout = 15000,
  ): Promise<StructuredToolResult> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: rootPath,
        timeout,
        maxBuffer: 512 * 1024,
      });
      return {
        success: true,
        data: { output: stdout || stderr || '' },
      };
    } catch (e: unknown) {
      const err = e as { stderr?: string; message?: string };
      return {
        success: false,
        error: {
          code: 'GIT_ERROR',
          message: err.stderr || err.message || 'Erro Git',
        },
      };
    }
  }

  gitStatus(rootPath: string) {
    return this.run(rootPath, 'git status --short');
  }

  gitDiff(rootPath: string, filePath?: string) {
    const cmd = filePath ? `git diff -- "${filePath}"` : 'git diff';
    return this.run(rootPath, cmd);
  }

  gitLog(rootPath: string, limit = 10) {
    return this.run(rootPath, `git log --oneline -n ${limit}`);
  }

  gitBranch(rootPath: string) {
    return this.run(rootPath, 'git branch -a');
  }

  gitShowFile(rootPath: string, filePath: string) {
    return this.run(rootPath, `git show HEAD:"${filePath}"`);
  }
}
