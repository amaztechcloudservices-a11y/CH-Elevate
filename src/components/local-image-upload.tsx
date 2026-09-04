"use client";

import { ImageIcon, Upload } from "lucide-react";
import { useId, useState, type ChangeEvent } from "react";

type LocalImageUploadProps = {
  label: string;
  value: string;
  onUploaded: (url: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  className?: string;
  onBusyChange?: (busy: boolean) => void;
};

export function LocalImageUpload({
  label,
  value,
  onUploaded,
  disabled = false,
  readOnly = false,
  required = false,
  className = "",
  onBusyChange,
}: LocalImageUploadProps) {
  const inputId = useId();
  const labelId = useId();
  const statusId = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || busy || disabled || readOnly) return;
    setBusy(true);
    setFailed(false);
    setMessage("Uploading image…");
    onBusyChange?.(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/admin/images", { method: "POST", body: form });
      const result = await response.json() as { data?: { url?: string }; error?: { message?: string } };
      if (!response.ok || !result.data?.url) throw new Error(result.error?.message || "The image could not be uploaded.");
      onUploaded(result.data.url);
      setMessage("Image uploaded. Save this form to use it.");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "The image could not be uploaded.");
    } finally {
      input.value = "";
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return <div className={`local-image-upload ${className}`.trim()}>
    <span className="local-image-upload__label" id={labelId}>{label}</span>
    {value
      ? <div className="local-image-upload__preview">
        {/* Admin previews must display both generated URLs and legacy remote records without an image-host allowlist. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt={`${label} preview`} referrerPolicy="no-referrer" /><span>Current image</span>
      </div>
      : <div className="local-image-upload__empty"><ImageIcon aria-hidden="true" /><span>No image selected</span></div>}
    {!readOnly && <>
      <label className="local-image-upload__picker" htmlFor={inputId} aria-disabled={disabled || busy}>
        <Upload aria-hidden="true" /> {busy ? "Uploading…" : value ? "Replace image" : "Choose image"}
      </label>
      <input
        id={inputId}
        className="local-image-upload__input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled || busy}
        aria-required={required && !value}
        aria-labelledby={labelId}
        aria-describedby={statusId}
        onChange={upload}
      />
      <small id={statusId}>Choose a PNG, JPEG or WebP image from this device, up to 5 MB.</small>
      {message && <span className={`local-image-upload__status${failed ? " is-error" : ""}`} role={failed ? "alert" : "status"}>{message}</span>}
    </>}
  </div>;
}
