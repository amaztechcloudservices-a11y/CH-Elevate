"use client";

import { Play, X } from "lucide-react";
import { useRef, useState } from "react";

export function VideoDialog({
  className,
  label = "Play video",
  iconOnly = false,
}: {
  className?: string;
  label?: string;
  iconOnly?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  function show() {
    setOpen(true);
    dialog.current?.showModal();
  }

  function close() {
    dialog.current?.close();
    setOpen(false);
  }

  return (
    <>
      <button className={className} type="button" aria-label={label} onClick={show}>
        <Play aria-hidden="true" />
        {!iconOnly && <span>{label}</span>}
      </button>
      <dialog className="site-video-dialog" ref={dialog} onClose={() => setOpen(false)} onClick={(event) => { if (event.target === dialog.current) close(); }}>
        <button className="site-video-dialog__close" type="button" onClick={close} aria-label="Close video"><X aria-hidden="true" /></button>
        <div className="site-video-dialog__frame">
          {open && (
            <iframe
              src="https://www.youtube-nocookie.com/embed/XHOmBV4js_E?autoplay=1&rel=0"
              title="CH Elevate company overview"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
        </div>
      </dialog>
    </>
  );
}
