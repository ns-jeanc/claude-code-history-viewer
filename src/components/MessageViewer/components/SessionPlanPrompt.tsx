/**
 * SessionPlanPrompt
 *
 * A collapsible per-session "plan prompt" panel rendered at the top of the
 * message viewer. Lets the user record what they intend to do next in this
 * session. The text is persisted to ~/.claude-history-viewer/user-data.json
 * via the session-metadata store (see `useSessionMetadata`), so it survives
 * app restarts and is scoped to the session id.
 *
 * Save strategy: debounced (auto-saves ~700ms after typing stops) and on
 * blur. While the user is editing, external store updates are ignored so the
 * cursor position and in-progress text are never clobbered.
 */

import { ChevronDown, ClipboardList } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSessionMetadata } from "@/hooks/useSessionMetadata";
import { cn } from "@/lib/utils";

const SAVE_DEBOUNCE_MS = 700;

interface SessionPlanPromptProps {
  sessionId: string;
}

export function SessionPlanPrompt({ sessionId }: SessionPlanPromptProps) {
  const { t } = useTranslation();
  const { planPrompt, setPlanPrompt } = useSessionMetadata(sessionId);

  // Default open — the plan prompt is the panel's primary surface, not an
  // opt-in accessory. The textarea is resize-y so the user can reclaim or
  // expand the space against the navigator list below.
  const [isOpen, setIsOpen] = useState(true);
  // Local edit buffer. Kept in sync with the store except while editing.
  const [draft, setDraft] = useState(planPrompt ?? "");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEditingRef = useRef(false);

  // Sync the local buffer when the store value changes externally — i.e. when
  // switching sessions or when another surface updates the same session. We
  // deliberately skip the sync while the user is actively editing this field
  // so we never overwrite in-progress input.
  useEffect(() => {
    if (isEditingRef.current) return;
    setDraft(planPrompt ?? "");
    setIsDirty(false);
  }, [planPrompt]);

  const flushSave = useCallback(
    async (value: string) => {
      setIsSaving(true);
      try {
        // Store empty string and undefined equivalently: clear the field.
        await setPlanPrompt(value.trim() ? value : undefined);
        setSavedAt(true);
        setIsDirty(false);
        // Fade the "saved" indicator out shortly after.
        setTimeout(() => setSavedAt(false), 1500);
      } finally {
        setIsSaving(false);
      }
    },
    [setPlanPrompt]
  );

  // Debounced auto-save while typing.
  useEffect(() => {
    if (!isDirty) return;
    setIsSaving(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void flushSave(draft);
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [draft, isDirty, flushSave]);

  // On session change, cancel any pending save and drop the edit lock so the
  // buffer resyncs to the new session's stored value.
  useEffect(() => {
    isEditingRef.current = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, [sessionId]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      isEditingRef.current = true;
      setDraft(e.target.value);
      setIsDirty(true);
    },
    []
  );

  const handleBlur = useCallback(() => {
    isEditingRef.current = false;
    if (!isDirty) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void flushSave(draft);
  }, [draft, isDirty, flushSave]);

  const hasContent = Boolean(planPrompt?.trim());
  const statusKey = isSaving
    ? "messageViewer.planPrompt.saving"
    : savedAt
      ? "messageViewer.planPrompt.saved"
      : null;

  return (
    <div className="shrink-0 border-b border-border/50 bg-muted/20">
      {/* Toggle bar */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls="session-plan-prompt-body"
        className={cn(
          "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
          "hover:bg-accent/10"
        )}
      >
        <ClipboardList
          className={cn(
            "w-3.5 h-3.5 shrink-0",
            hasContent ? "text-accent" : "text-muted-foreground"
          )}
        />
        <span className="text-xs font-medium text-foreground">
          {t("messageViewer.planPrompt.title")}
        </span>
        {hasContent && !isOpen && (
          <span className="text-xs text-muted-foreground truncate min-w-0">
            {planPrompt}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {statusKey && (
            <span
              role="status"
              className="text-2xs text-muted-foreground tabular-nums"
            >
              {t(statusKey)}
            </span>
          )}
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        </span>
      </button>

      {/* Editor body */}
      {isOpen && (
        <div id="session-plan-prompt-body" className="px-2 pb-2">
          <textarea
            value={draft}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder={t("messageViewer.planPrompt.placeholder")}
            aria-label={t("messageViewer.planPrompt.title")}
            rows={8}
            className={cn(
              "w-full resize-y rounded text-sm p-2 min-h-[140px]",
              "bg-muted/30 border border-border/30",
              "text-foreground placeholder:text-muted-foreground/50",
              "focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40",
              "transition-all duration-200"
            )}
          />
        </div>
      )}
    </div>
  );
}
