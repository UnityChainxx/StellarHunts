import { ApiProperty } from "@nestjs/swagger"

// Anti-enumeration response body returned by public auth endpoints when the
// server must not reveal whether an account already exists (OWASP A01:
// Broken Access Control — user/account enumeration). It carries no user
// identifier and no access token, so a probing attacker cannot distinguish
// a brand-new registration from one that already exists.
export class GenericAuthMessageDto {
  @ApiProperty({
    description: "Generic, account-existence-neutral message",
    example: "Registration successful. If an account already exists, please log in.",
  })
  message: string
}