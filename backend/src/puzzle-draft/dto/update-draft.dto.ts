import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional } from 'class-validator';
import { CreateDraftDto } from './create-draft.dto';

/**
 * Request body for PATCH /drafts/:id (issue #529: request DTOs must carry
 * class-validator decorators). Status changes are constrained to the draft
 * workflow; the service enforces the allowed transition matrix on top.
 */
export class UpdateDraftDto extends PartialType(CreateDraftDto) {
  @IsOptional()
  @IsIn(['draft', 'review', 'approved', 'published'])
  status?: string;
}
