"use client";

import React, { useState } from "react";
import { useApiMutation } from "../../../hooks/useApiMutation";
import {
  buildDraftPayload,
  createDraft,
  extractFieldErrors,
  publishDraft,
  updateDraft,
} from "../../../services/puzzleDraftService";

const difficulties = ["Easy", "Medium", "Hard", "Expert"];

export default function AdminPuzzleSubmission() {
  const [form, setForm] = useState({
    title: "",
    description: "",
    answer: "",
    difficulty: difficulties[0],
    nftMetadata: "",
  });
  // `null` when no draft exists yet; a string draft id once saved. Its
  // presence switches the form between "create" and "update" mode.
  const [draftId, setDraftId] = useState(null);
  const [status, setStatus] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  // Local busy flag rather than the mutation's `isLoading`: it covers both
  // mutations (including the save-then-publish fallback) and stays
  // independent of the react-query result naming across versions.
  const [busy, setBusy] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetAfterPublish = () => {
    setForm({
      title: "",
      description: "",
      answer: "",
      difficulty: difficulties[0],
      nftMetadata: "",
    });
    setDraftId(null);
  };

  // Shared mutation hook: consistent retry/error surface, no query cache to
  // invalidate because draft state is local to this form.
  const saveMutation = useApiMutation({
    fn: async ({ payload }) => {
      if (draftId) {
        return updateDraft(draftId, payload);
      }
      const created = await createDraft(payload);
      setDraftId(created.id);
      return created;
    },
    onError: (error) => {
      setFieldErrors(extractFieldErrors(error));
      setStatus("Failed to save draft.");
    },
  });

  const publishMutation = useApiMutation({
    fn: async () => {
      if (!draftId) {
        // The publish endpoint needs a persisted draft; save first.
        const { payload, metadataError } = buildDraftPayload(form);
        if (metadataError) {
          const error = new Error(metadataError);
          error.data = { message: [metadataError] };
          throw error;
        }
        const created = await createDraft(payload);
        setDraftId(created.id);
        return publishDraft(created.id);
      }
      return publishDraft(draftId);
    },
    onError: (error) => {
      setFieldErrors(extractFieldErrors(error));
      setStatus("Failed to publish draft.");
    },
  });

  const handleSave = async (e) => {
    e.preventDefault();
    setStatus(null);
    setFieldErrors({});
    const { payload, metadataError } = buildDraftPayload(form);
    if (metadataError) {
      setFieldErrors({ form: metadataError });
      return;
    }
    setBusy(true);
    try {
      await saveMutation.mutateAsync({ payload });
    } catch {
      // The error surface (status + field errors) is set in onError.
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async () => {
    setStatus(null);
    setFieldErrors({});
    const { payload, metadataError } = buildDraftPayload(form);
    if (metadataError) {
      setFieldErrors({ form: metadataError });
      return;
    }
    setBusy(true);
    try {
      const published = await publishMutation.mutateAsync();
      if (published) {
        setStatus("Draft published successfully.");
        resetAfterPublish();
      }
    } catch {
      // The error surface (status + field errors) is set in onError.
    } finally {
      setBusy(false);
    }
  };

  const submitting = busy || saveMutation.isLoading || publishMutation.isLoading;
  // The entered content is never cleared on failure: the form state is only
  // reset in `resetAfterPublish`, which runs after a successful publish.
  const showError = (field) =>
    fieldErrors[field] ? (
      <p className="mt-1 text-sm text-pink-400">{fieldErrors[field]}</p>
    ) : null;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-gradient-to-br from-black via-purple-900 to-black flex items-center justify-center">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-500/10 to-transparent opacity-20 pointer-events-none" />
      <div className="backdrop-blur-lg bg-white/10 p-8 sm:p-12 rounded-2xl shadow-2xl border border-white/20 max-w-xl w-full text-center z-10">
        <h1 className="text-3xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
          Submit New Puzzle
        </h1>
        {draftId && (
          <p className="text-sm text-white/60 mb-4" data-testid="draft-state">
            Draft saved — you can update it or publish it.
          </p>
        )}
        <form onSubmit={handleSave} className="space-y-6 text-left">
          <div>
            <label htmlFor="draft-title" className="block font-semibold mb-1 text-white">
              Title
            </label>
            <input
              id="draft-title"
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              className="w-full border border-white/20 bg-transparent text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              required
            />
            {showError("title")}
          </div>
          <div>
            <label htmlFor="draft-description" className="block font-semibold mb-1 text-white">
              Description
            </label>
            <textarea
              id="draft-description"
              name="description"
              value={form.description}
              onChange={handleChange}
              className="w-full border border-white/20 bg-transparent text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            {showError("description")}
          </div>
          <div>
            <label htmlFor="draft-answer" className="block font-semibold mb-1 text-white">
              Answer
            </label>
            <input
              id="draft-answer"
              type="text"
              name="answer"
              value={form.answer}
              onChange={handleChange}
              className="w-full border border-white/20 bg-transparent text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              required
            />
          </div>
          <div>
            <label htmlFor="draft-difficulty" className="block font-semibold mb-1 text-white">
              Difficulty
            </label>
            <select
              id="draft-difficulty"
              name="difficulty"
              value={form.difficulty}
              onChange={handleChange}
              className="w-full border border-white/20 bg-transparent text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {difficulties.map((level) => (
                <option
                  key={level}
                  value={level}
                  className="bg-black text-white"
                >
                  {level}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="draft-nft-metadata" className="block font-semibold mb-1 text-white">
              NFT Metadata (JSON)
            </label>
            <textarea
              id="draft-nft-metadata"
              name="nftMetadata"
              value={form.nftMetadata}
              onChange={handleChange}
              className="w-full border border-white/20 bg-transparent text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder='{ "name": "Puzzle badge", "image": "..." }'
            />
          </div>
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:cursor-not-allowed disabled:opacity-70 text-white font-bold py-3 px-6 rounded-lg transform transition-all hover:scale-105 shadow-lg hover:shadow-purple-500/50"
            >
              {saveMutation.isLoading
                ? "Saving..."
                : draftId
                  ? "Update Draft"
                  : "Save Draft"}
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={submitting}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:cursor-not-allowed disabled:opacity-70 text-white font-bold py-3 px-6 rounded-lg transform transition-all hover:scale-105 shadow-lg hover:shadow-emerald-500/50"
            >
              {publishMutation.isLoading ? "Publishing..." : "Publish"}
            </button>
          </div>
          {showError("form")}
          {status && <p className="text-sm text-white/80">{status}</p>}
        </form>
      </div>
    </main>
  );
}
