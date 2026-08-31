import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { isSafeHttpUrl } from './safe-url';

/**
 * class-validator constraint for DTO fields that accept external URLs.
 * Applies the SSRF policy from `safe-url.ts` (issue #318): http(s) only, no
 * userinfo, no private/loopback/link-local/reserved destinations.
 */
@ValidatorConstraint({ name: 'isSafeHttpUrl', async: false })
export class IsSafeHttpUrlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isSafeHttpUrl(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be an http(s) URL that does not point to private, loopback, link-local or reserved network destinations`;
  }
}
