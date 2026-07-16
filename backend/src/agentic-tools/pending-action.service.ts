import { Injectable, Logger } from '@nestjs/common';
import { AgenticAction } from './types/agentic-action.types';

export type PendingActionStatus = 'pending' | 'executed' | 'expired' | 'cancelled';

export interface PendingAction {
  conversationId: string;
  projectId: string;
  userId?: string;
  toolName: string;
  args: Record<string, unknown>;
  risk: string;
  reason: string;
  path?: string;
  command?: string;
  toolCallId?: string;
  createdAt: number;
  expiresAt: number;
  status: PendingActionStatus;
}

const CONFIRM_RE =
  /^(sim|s|ok|okay|pode|pode seguir|pode continuar|autorizo|autorizar|continua|continuar|prosseguir|aprova|aprovar|confirmo|confirmado|yes|y|go|faz|faça|execute|executa|executar)([\s!.?,]*)$/i;

const CONFIRM_CONTAINS_RE =
  /\b(pode seguir|pode continuar|autorizo|aprova(r)?|confirmo|execute|executa|prosseguir)\b/i;

@Injectable()
export class PendingActionService {
  private readonly logger = new Logger(PendingActionService.name);
  private readonly byConversation = new Map<string, PendingAction>();
  private readonly ttlMs = 30 * 60 * 1000;

  set(action: Omit<PendingAction, 'createdAt' | 'expiresAt' | 'status'>): PendingAction {
    const pending: PendingAction = {
      ...action,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs,
      status: 'pending',
    };
    this.byConversation.set(action.conversationId, pending);
    this.logger.log(
      `PendingAction saved for ${action.conversationId}: ${action.toolName}`,
    );
    return pending;
  }

  fromAgenticAction(
    ctx: {
      conversationId: string;
      projectId: string;
      userId?: string;
      toolCallId?: string;
    },
    action: AgenticAction,
    risk: string,
    reason: string,
  ): PendingAction {
    return this.set({
      conversationId: ctx.conversationId,
      projectId: ctx.projectId,
      userId: ctx.userId,
      toolCallId: ctx.toolCallId,
      toolName: action.toolName,
      args: action.args,
      risk,
      reason,
      path: action.path,
      command: action.command,
    });
  }

  get(conversationId: string): PendingAction | null {
    const pending = this.byConversation.get(conversationId);
    if (!pending) return null;
    if (pending.status !== 'pending') return null;
    if (Date.now() > pending.expiresAt) {
      pending.status = 'expired';
      this.byConversation.delete(conversationId);
      return null;
    }
    return pending;
  }

  isConfirmation(message: string): boolean {
    const trimmed = message.trim();
    if (!trimmed) return false;
    if (CONFIRM_RE.test(trimmed)) return true;
    if (trimmed.length < 40 && CONFIRM_CONTAINS_RE.test(trimmed)) return true;
    return false;
  }

  consume(conversationId: string): PendingAction | null {
    const pending = this.get(conversationId);
    if (!pending) return null;
    pending.status = 'executed';
    this.byConversation.delete(conversationId);
    return pending;
  }

  cancel(conversationId: string): void {
    const pending = this.byConversation.get(conversationId);
    if (pending) {
      pending.status = 'cancelled';
      this.byConversation.delete(conversationId);
    }
  }
}
