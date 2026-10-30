"use client";

import { useState } from "react";

type Props = {
  buttonLabel?: string;
  title: string;
  children: React.ReactNode;
};

export function EditPopover({ buttonLabel = "変更", title, children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-line bg-white px-2 py-1 text-xs text-muted hover:text-ink"
      >
        {buttonLabel}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="grid max-h-[85dvh] w-full max-w-md gap-3 overflow-y-auto rounded-xl border border-line bg-white p-4"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label={title}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold">{title}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-muted hover:text-ink"
              >
                閉じる
              </button>
            </div>
            {children}
          </div>
        </div>
      ) : null}
    </>
  );
}
