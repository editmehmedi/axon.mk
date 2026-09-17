"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/components/LanguageProvider";
import { ProductImage } from "@/components/ProductImage";
import { proxiedExternalImage } from "@/lib/partImages";

export function AdminImageField({
  value,
  onChange,
  compact = false,
  showPreview = true,
  previewSrc,
  previewAlt = "preview",
  uploadUrl = "/api/admin/upload",
}: {
  value: string;
  onChange: (url: string) => void;
  compact?: boolean;
  showPreview?: boolean;
  previewSrc?: string | null;
  previewAlt?: string;
  uploadUrl?: string;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChange(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(uploadUrl, { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || t("admin.uploadFailed"));
        return;
      }
      onChange(String(json.url || ""));
    } catch {
      setError(t("admin.uploadFailed"));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const preview = previewSrc || (value.trim() ? proxiedExternalImage(value.trim()) : null);
  const inputClass = compact ? "input !py-1.5 !text-xs" : "input !py-2 !text-sm";

  return (
    <div className="space-y-2">
      <div className={`grid gap-2 ${compact ? "sm:grid-cols-[1fr_auto]" : "sm:grid-cols-[1fr_auto]"}`}>
        <input
          className={`${inputClass} min-w-0`}
          placeholder={t("admin.fieldImageUrl")}
          value={value}
          onChange={(e) => {
            setError(null);
            onChange(e.target.value);
          }}
        />
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            className="hidden"
            onChange={(e) => void onFileChange(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={uploading}
            className={`btn btn-ghost whitespace-nowrap ${compact ? "!px-2.5 !py-1.5 !text-xs" : "!px-3 !py-2 !text-xs"}`}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? t("admin.uploading") : t("admin.uploadPhoto")}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-[var(--danger,#f87171)]">{error}</p>}
      {showPreview && preview && (
        <ProductImage
          src={preview}
          alt={previewAlt}
          className={compact ? "!max-w-[6rem]" : "!max-w-[8rem]"}
        />
      )}
    </div>
  );
}
