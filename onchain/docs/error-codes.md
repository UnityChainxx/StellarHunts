# Contract Error Codes

This document lists all error codes raised by the StellarHunts Soroban contracts (`stellar_hunts` and `stellar_hunts_nft`), their numeric discriminants, and the entry points that raise them. Off-chain clients should map these codes to user-facing messages and UI states.

## stellar_hunts Error Codes

| Code | Error Name | Entry Points | Description |
| --- | --- | --- | --- |
| 1 | NotAuthorized | `init` | Caller is not authorized to perform the action (e.g., not the admin). |
| 2 | EmptyField | `add_question`, `set_question_per_level`, `update_question` | A required field is empty or missing. |
| 3 | QuestionNotFound | `get_question`, `get_question_in_level`, `request_hint`, `retire_question`, `submit_answer`, `update_question` | The specified question ID does not exist. |
| 4 | LevelNotCompleted | `claim_level_completion_nft` | The caller has not completed the required level. |
| 5 | AlreadyMinted | `claim_level_completion_nft` | The caller has already minted the NFT for this level. |
| 6 | NotInitialized | `claim_level_completion_nft`, `get_player_level`, `get_schema_version`, `request_hint` | The contract or player state is not initialized. |
| 7 | WrongLevel | `request_hint` | The question does not belong to the caller's current level. |
| 8 | QuestionPerLevelLimit | `add_question`, `update_question` | The maximum number of questions per level has been reached. |
| 9 | MissingNftContract | `claim_level_completion_nft`, `get_nft_contract_address` | The NFT contract address is not set. |
| 10 | AttemptTooSoon | `submit_answer` | The caller is attempting to submit another answer too quickly (rate limit). |
| 11 | LevelImmutable | - | Reserved for future use (currently defined but not raised). |
| 12 | ArithmeticOverflow | `add_question`, `submit_answer`, `update_question` | An arithmetic operation would overflow. |
| 6 | ContractPaused | `claim_level_completion_nft`, `submit_answer` | The contract is paused and cannot accept submissions. |

**Note:** Code 6 is used for both `NotInitialized` and `ContractPaused`. This is a legacy duplication that should be avoided in new code.

## stellar_hunts_nft Error Codes

| Code | Error Name | Entry Points | Description |
| --- | --- | --- | --- |
| 1 | NotAuthorized | `mint_level_badge` | Caller is not authorized to perform the action. |
| 2 | AlreadyHasBadge | `mint_level_badge` | The caller already has the badge for this level. |
| 3 | AlreadyInitialized | `init` | The contract is already initialized. |
| 4 | InvalidBaseUri | `init` | The provided base URI for metadata is invalid. |
| 5 | MetadataTooLarge | `init` | The metadata exceeds the maximum allowed size. |
| 6 | NotInitialized | `mint_level_badge` | The contract is not initialized. |
| 6 | ContractPaused | `mint_level_badge` | The contract is paused and cannot mint badges. |

**Note:** Code 6 is used for both `NotInitialized` and `ContractPaused` in the NFT contract as well. This duplication should be avoided in new code.

## Error Code Assignment Guidelines

When adding new error codes:

1. **Never reuse an existing code** unless explicitly marking it as reserved/legacy.
2. **Use the next available sequential number** to maintain consistency.
3. **Document the entry points** that raise the error in this table.
4. **Provide a clear description** of the condition that triggers the error.
5. **Update this document** whenever the error enums change.

## Reserved/Legacy Codes

- Code 6 in both contracts is currently used for two different errors (`NotInitialized` and `ContractPaused`). This is a legacy pattern that should not be repeated for new error codes.

## Off-Chain Client Integration

Off-chain clients (frontend, backend) should:

1. Parse the error code from contract invocation failures.
2. Map the numeric code to the corresponding error name from this table.
3. Display user-friendly messages based on the error description.
4. Handle special cases like `ContractPaused` to show appropriate UI states.
5. Log the full error context for debugging purposes.

Example error handling flow:

```javascript
try {
  await contract.call('submit_answer', { question_id: 123, answer: 'test' });
} catch (error) {
  const errorCode = error.code; // e.g., 3
  const errorInfo = ERROR_CODES[errorCode]; // Look up in this table
  // errorInfo = { name: 'QuestionNotFound', description: '...' }
  showUserMessage(errorInfo.description);
}
```
