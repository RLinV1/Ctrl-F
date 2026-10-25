"use client";

/**
 * @author: @kokonutui
 * @description: AI Prompt Input
 * @version: 2.0.0
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 *
 * Ctrl-F adaptation: the model menu becomes a menu of ways to ask, and there are no
 * attachments, slash commands, promo header or effort control. The mode marked as the
 * text mode shows the auto-growing textarea and Send (Enter sends, Shift+Enter breaks a
 * line, ↑ in an empty prompt recalls the last question); the other modes put their own
 * body in the card and their own control where Send sits. Restyled to the paper, ink and
 * brass palette with square corners.
 */

import { ArrowUp, Check, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useId, useRef, useState, useSyncExternalStore } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea";
import { cn } from "@/lib/utils";

export interface PromptMode {
  id: string;
  name: string;
  /** One line under the name in the menu. */
  description?: string;
  icon: ReactNode;
}

interface AIPromptProps {
  modes: PromptMode[];
  mode: string;
  onModeChange: (mode: string) => void;
  /** The mode that types into the textarea. */
  textMode: string;
  placeholder?: string;
  /** Sends a typed question. */
  onSubmit: (value: string) => void;
  /** A question is being worked on: Send waits. */
  busy?: boolean;
  /** For the other modes: what the card shows in place of the textarea. */
  body?: ReactNode;
  /** For the other modes: the control in place of Send. */
  action?: ReactNode;
  className?: string;
}

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const ghostButton = cn(
  "flex h-8 items-center gap-1.5 px-2.5 text-ink/80 text-sm",
  "hover:bg-panel hover:text-ink data-[state=open]:bg-panel data-[state=open]:text-ink",
  "transition-[background-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brass",
);

const menuPanel = "origin-(--radix-dropdown-menu-content-transform-origin) border-rule bg-sheet p-1";

function SendButton({ canSend, busy, onSend }: { canSend: boolean; busy: boolean; onSend: () => void }) {
  return (
    <button
      aria-busy={busy || undefined}
      aria-label="Send question"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brass",
        "transition-[background-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
        // Fills in once there is something to send, so it says "ready" before it is pressed.
        canSend ? "bg-ink text-paper hover:bg-ink/85" : "bg-ink/10 text-ink/35",
      )}
      data-testid="send"
      disabled={!canSend}
      onClick={onSend}
      type="button"
    >
      <ArrowUp aria-hidden className="size-4" strokeWidth={2.25} />
    </button>
  );
}

function ModeMenu({
  modes,
  selected,
  onSelect,
}: {
  modes: PromptMode[];
  selected: PromptMode;
  onSelect: (mode: PromptMode) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label={`How to ask: ${selected.name}`} className={cn(ghostButton, "group pr-2")} type="button">
          <span className="flex items-center [&_svg]:size-4">{selected.icon}</span>
          {/* Only the name swaps; the chevron stays put. */}
          <span className="relative inline-grid">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                animate={{ opacity: 1, filter: "blur(0px)" }}
                className="col-start-1 row-start-1 whitespace-nowrap font-semibold"
                exit={{ opacity: 0, filter: "blur(2px)" }}
                initial={{ opacity: 0, filter: "blur(2px)" }}
                key={selected.id}
                transition={{ duration: 0.15, ease: EASE_OUT }}
              >
                {selected.name}
              </motion.span>
            </AnimatePresence>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-data-[state=open]:rotate-180"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={cn(menuPanel, "w-72")} side="bottom" sideOffset={8}>
        <DropdownMenuLabel className="px-2 pt-1.5 pb-1 font-normal text-ink-muted text-xs">How to ask</DropdownMenuLabel>
        {modes.map((mode) => (
          <DropdownMenuItem
            className="flex items-center gap-2.5 px-2 py-2 focus:bg-panel"
            key={mode.id}
            onSelect={() => onSelect(mode)}
          >
            <span className="flex size-4 shrink-0 items-center justify-center text-ink [&_svg]:size-4">{mode.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-ink text-sm">{mode.name}</span>
              {mode.description && <span className="block text-ink-muted text-xs">{mode.description}</span>}
            </span>
            <Check aria-hidden="true" className={cn("size-4 shrink-0 text-ink", mode.id !== selected.id && "invisible")} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AI_Prompt({
  modes,
  mode,
  onModeChange,
  textMode,
  placeholder = "Where are my keys?",
  onSubmit,
  busy = false,
  body,
  action,
  className,
}: AIPromptProps) {
  const [value, setValue] = useState("");
  // True once hydrated (false in the server HTML), exposed as data-live for tests.
  const live = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  // The last question sent, for ↑ in an empty prompt (as in a terminal).
  const lastSentRef = useRef("");
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 40, maxHeight: 120 });
  const textareaId = useId();
  const selected = modes.find((m) => m.id === mode) ?? modes[0];
  const typing = selected.id === textMode;
  const canSend = value.trim().length > 0 && !busy;

  const submit = () => {
    if (!canSend) return;
    lastSentRef.current = value;
    onSubmit(value.trim());
    setValue("");
    adjustHeight(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter during IME composition confirms the candidate; it must not submit.
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowUp" && value === "" && lastSentRef.current) {
      e.preventDefault();
      setValue(lastSentRef.current);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        adjustHeight();
        el?.setSelectionRange(el.value.length, el.value.length);
      });
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className={cn("w-full", className)} data-live={live || undefined} data-mode={selected.id} data-testid="prompt">
      <div className="bg-panel p-1">
        <div className="relative flex flex-col bg-card-row ring-1 ring-rule transition-shadow duration-150 has-[textarea:focus-visible]:ring-brass-ink">
          {typing ? (
            <>
              <label className="sr-only" htmlFor={textareaId}>
                What are you looking for?
              </label>
              <Textarea
                className="min-h-[40px] w-full resize-none rounded-none border-none bg-transparent px-3 pt-2.5 pb-0.5 text-[15px] text-ink leading-relaxed placeholder:text-ink-muted/70 focus-visible:ring-0 focus-visible:ring-offset-0"
                id={textareaId}
                maxLength={300}
                onChange={(e) => {
                  setValue(e.target.value);
                  adjustHeight();
                }}
                onKeyDown={handleKeyDown}
                placeholder={busy ? "Working on your last question…" : placeholder}
                ref={textareaRef}
                value={value}
              />
            </>
          ) : (
            <div className="flex min-h-[44px] items-center px-3 pt-2.5 pb-0.5 text-[15px]">{body}</div>
          )}

          <div className="flex items-center gap-1 px-2 pt-0.5 pb-1.5">
            <ModeMenu modes={modes} onSelect={(m) => onModeChange(m.id)} selected={selected} />
            <div className="flex-1" />
            {typing ? <SendButton busy={busy} canSend={canSend} onSend={submit} /> : action}
          </div>
        </div>
      </div>
    </div>
  );
}
