"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GoogleImport } from "@/components/google-import";
import { ImportReview, type CommitResult, type PreviewData } from "@/components/import-review";
import { cn } from "@/lib/utils";
import { IMPORT_EXTENSIONS, isImportable } from "@/lib/constants";

/**
 * Import flow: pick a source (file / Google Drive / Sheet link) → review every row
 * (column matching, flag, rating) → save. Nothing is written until the user saves.
 */
export function ImportUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<(CommitResult & { source: string }) | null>(null);

  async function requestPreview(label: string, init: RequestInit) {
    setLoading(label);
    setResult(null);
    const res = await fetch("/api/import/preview", { method: "POST", ...init });
    const json = await res.json().catch(() => ({ error: `Upload failed (HTTP ${res.status})` }));
    setLoading(null);
    if (!res.ok) return toast.error(json.error ?? "Couldn't read the file");
    setPreview(json);
  }

  function upload(file: File) {
    if (!isImportable(file.name)) return toast.error(`“${file.name}” isn't a spreadsheet. Use ${IMPORT_EXTENSIONS.join(", ")}`);
    const body = new FormData();
    body.append("file", file);
    requestPreview(file.name, { body });
  }

  function fetchLink(url: string) {
    requestPreview("Google Sheet", { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sheetUrl: url }) });
  }

  if (preview) {
    return (
      <ImportReview
        preview={preview}
        onCancel={() => setPreview(null)}
        onSaved={(r) => {
          setResult({ ...r, source: preview.source });
          setPreview(null);
          toast.success(`Saved ${r.saved} participant${r.saved === 1 ? "" : "s"}: ${r.created} new, ${r.updated} updated`);
          router.refresh();
        }}
      />
    );
  }

  const messages = result
    ? [
        ...result.errors.map((e) => ({ ...e, kind: "error" as const })),
        ...result.warnings.map((w) => ({ ...w, kind: "warning" as const })),
      ].sort((a, b) => a.row - b.row)
    : [];

  return (
    <div className="grid gap-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) upload(file);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card px-6 py-12 text-center transition-colors hover:border-ring",
          dragging && "border-primary bg-accent",
          loading && "pointer-events-none opacity-70",
        )}
      >
        {loading ? <Loader2 className="size-8 animate-spin text-muted-foreground" /> : <Upload className="size-8 text-muted-foreground" />}
        <div>
          <p className="font-medium">{loading ? `Reading ${loading}…` : "Drop an Excel or CSV file here"}</p>
          <p className="text-sm text-muted-foreground">or click to browse · Excel, Numbers or CSV up to 10 MB · you’ll review before saving</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={IMPORT_EXTENSIONS.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
      </div>

      <GoogleImport busy={!!loading} onFile={upload} onLink={fetchLink} />

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="size-4 text-emerald-600" /> Saved from {result.source}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["New", result.created],
                ["Updated", result.updated],
                ["Sessions logged", result.sessions],
                ["Flagged เก๊", result.flagged],
              ].map(([label, n]) => (
                <div key={label} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-semibold tabular-nums">{n}</p>
                </div>
              ))}
            </div>
            {messages.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-lg border">
                {messages.map((m, i) => (
                  <div key={i} className="flex items-start gap-2 border-b px-3 py-2 text-sm last:border-0">
                    <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", m.kind === "error" ? "text-destructive" : "text-amber-500")} />
                    <span className="text-muted-foreground">{m.row ? `Row ${m.row}` : "File"}</span>
                    <span>{m.message}</span>
                  </div>
                ))}
              </div>
            )}
            <div>
              <Button variant="outline" onClick={() => router.push("/participants")}>View participants</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
