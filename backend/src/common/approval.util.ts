import { BadRequestException } from '@nestjs/common';
import { DEFAULT_LOCAL_USER_ID } from './constants';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveApprovedBy(approvedBy?: string): string {
  if (!approvedBy?.trim()) {
    return DEFAULT_LOCAL_USER_ID;
  }
  if (!UUID_REGEX.test(approvedBy.trim())) {
    throw new BadRequestException('approvedBy must be a valid UUID');
  }
  return approvedBy.trim();
}

export function resolveUserId(userId?: string): string {
  if (!userId?.trim()) {
    return DEFAULT_LOCAL_USER_ID;
  }
  if (!UUID_REGEX.test(userId.trim())) {
    throw new BadRequestException('userId must be a valid UUID');
  }
  return userId.trim();
}
