/**
 * Test-only CommonJS shim for `@nestjs/mapped-types`.
 *
 * v12 is published as pure ESM, which Jest cannot require. `PartialType`
 * only builds a subclass at decoration time; returning the base class keeps
 * `class UpdateXDto extends PartialType(CreateXDto)` valid for specs that
 * never run the ValidationPipe.
 */

export function PartialType<T>(classRef: T): T {
  return classRef;
}

export function PickType<T>(classRef: T, _keys: readonly string[]): T {
  return classRef;
}

export function OmitType<T>(classRef: T, _keys: readonly string[]): T {
  return classRef;
}

export function IntersectionType<T, U>(a: T, _b: U): T {
  return a;
}

export default { PartialType, PickType, OmitType, IntersectionType };
