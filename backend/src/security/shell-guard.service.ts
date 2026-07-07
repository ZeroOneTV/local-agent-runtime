import { Injectable } from '@nestjs/common';
import { SecurityConfigService } from './security.config';

const COMPOUND_PATTERNS = [
  /[;|&`$]/,
  /\$\(/,
  />\s*\/etc/,
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
];

@Injectable()
export class ShellGuardService {
  constructor(private readonly securityConfig: SecurityConfigService) {}

  validate(command: string): { allowed: boolean; code?: string; message?: string } {
    const trimmed = command.trim();

    if (!trimmed) {
      return { allowed: false, code: 'EMPTY_COMMAND', message: 'Comando vazio' };
    }

    for (const pattern of COMPOUND_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          allowed: false,
          code: 'COMPOUND_COMMAND_BLOCKED',
          message: 'Comandos compostos ou interpretados não são permitidos',
        };
      }
    }

    const baseCommand = trimmed.split(/\s+/)[0];
    const allowed = this.securityConfig.shellAllowlist.some(
      (cmd) => baseCommand === cmd || baseCommand.endsWith(`/${cmd}`),
    );

    if (!allowed) {
      return {
        allowed: false,
        code: 'COMMAND_NOT_ALLOWED',
        message: `Comando não está na allowlist: ${baseCommand}`,
      };
    }

    return { allowed: true };
  }
}
