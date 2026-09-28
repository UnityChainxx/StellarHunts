import { apiClient, ApiError } from "@/lib/api";

/**
 * Service for the backend puzzle-draft lifecycle (`backend/src/puzzle-draft/`).
 *
 * All routes are admin-only on the server (JwtAuthGuard + RolesGuard with
 * `AdminRole.ADMIN`); this module intentionally performs no authorization
 * logic of its own — the client-side check is advisory, the backend is the
 * source of truth (issue #511).
 *
 * Endpoints (mounted under the versioned API prefix, see `lib/api.js`):
 *  - POST   /drafts            → create a draft
 *  - PATCH  /drafts/:id        → update a draft (rejected for published drafts)
 *  - POST   /drafts/:id/publish → publish a draft
 */

/** Creates a draft from a `CreateDraftDto`-shaped payload. */
export async function createDraft(payload) {
  const response = await apiClient.post("/drafts", payload);
  return response.data;
}

/** Updates an existing draft from an `UpdateDraftDto`-shaped payload. */
export async function updateDraft(draftId, payload) {
  const response = await apiClient.patch(`/drafts/${draftId}`, payload);
  return response.data;
}

/** Publishes a draft through the backend publish endpoint. */
export async function publishDraft(draftId) {
  const response = await apiClient.post(`/drafts/${draftId}/publish`);
  return response.data;
}

/**
 * Maps a backend validation rejection onto per-field errors.
 *
 * The global ValidationPipe returns class-validator messages as an array on
 * `response.data.message` (e.g. `["title must be a string", ...]`). Each
 * message is attributed to the first form field it mentions so the form can
 * render the error next to the offending input; messages that name no known
 * field are returned under `form`.
 *
 * @param {Error} error - an `ApiError` thrown by `apiClient` (or any error)
 * @returns {Record<string, string>} field name → message
 */
export function extractFieldErrors(error) {
  const messages = error?.data?.message ?? error?.response?.data?.message;
  const list = Array.isArray(messages) ? messages : messages ? [messages] : [];

  const knownFields = ["title", "description", "content"];
  const fieldErrors = {};

  for (const message of list) {
    const text = typeof message === "string" ? message : String(message);
    const match = knownFields.find((field) => text.includes(field));
    const key = match ?? "form";
    // Keep the first message per field; the rest are noise for the user.
    if (!fieldErrors[key]) fieldErrors[key] = text;
  }

  return fieldErrors;
}

/**
 * Builds the `CreateDraftDto` payload from the form state.
 *
 * The backend DTO contract is `{ title: string, description?: string,
 * content: object }` (`backend/src/puzzle-draft/dto/create-draft.dto.ts`).
 * The answer, difficulty and NFT metadata live inside the `content` object;
 * the NFT metadata textarea is JSON text, so it is parsed (and its parse
 * failure reported) here — serializing a string into an object is not
 * re-declaring validation, which stays server-side.
 *
 * @returns {{ payload: object, metadataError?: string }}
 */
export function buildDraftPayload(form) {
  const content = {
    answer: form.answer.trim(),
    difficulty: form.difficulty.toLowerCase(),
  };

  let metadataError;
  const metadataText = form.nftMetadata.trim();
  if (metadataText) {
    try {
      content.nftMetadata = JSON.parse(metadataText);
    } catch {
      metadataError = "NFT metadata must be valid JSON.";
    }
  }

  const payload = {
    title: form.title.trim(),
    content,
  };
  if (form.description.trim()) {
    payload.description = form.description.trim();
  }

  return { payload, metadataError };
}

export default {
  createDraft,
  updateDraft,
  publishDraft,
  extractFieldErrors,
  buildDraftPayload,
};
