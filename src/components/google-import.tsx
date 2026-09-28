"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "";
const APP_ID = process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? "";
/** Only files the user explicitly picks — the app can't see anything else in their Drive. */
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const LAST_LINK_KEY = "ph:lastSheetLink";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const PICKABLE = [SHEET_MIME, XLSX_MIME, "application/vnd.ms-excel", "text/csv", "application/vnd.oasis.opendocument.spreadsheet"];

export const googleLoginConfigured = Boolean(CLIENT_ID && API_KEY && APP_ID);

type GoogleGlobal = any;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function loadGoogle(): Promise<{ google: GoogleGlobal; gapi: GoogleGlobal }> {
  await Promise.all([loadScript("https://accounts.google.com/gsi/client"), loadScript("https://apis.google.com/js/api.js")]);
  const w = window as unknown as { google: GoogleGlobal; gapi: GoogleGlobal };
  await new Promise<void>((resolve) => w.gapi.load("picker", () => resolve()));
  return { google: w.google, gapi: w.gapi };
}

function requestToken(google: GoogleGlobal): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp: { access_token?: string; error?: string }) =>
        resp.access_token ? resolve(resp.access_token) : reject(new Error(resp.error ?? "Permission was not granted")),
      error_callback: (err: { type?: string }) =>
        reject(new Error(err?.type === "popup_closed" ? "Google sign-in was closed" : "Google sign-in failed")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

function pickFile(google: GoogleGlobal, token: string): Promise<{ id: string; name: string; mimeType: string } | null> {
  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes(PICKABLE.join(",")).setMode(google.picker.DocsViewMode.LIST);
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setTitle("Choose a participant sheet")
      .setCallback((data: any) => {
        const action = data[google.picker.Response.ACTION];
        if (action === google.picker.Action.PICKED) {
          const doc = data[google.picker.Response.DOCUMENTS][0];
          resolve({ id: doc[google.picker.Document.ID], name: doc[google.picker.Document.NAME], mimeType: doc[google.picker.Document.MIME_TYPE] });
        } else if (action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}

async function downloadDriveFile(token: string, doc: { id: string; name: string; mimeType: string }): Promise<File> {
  const isSheet = doc.mimeType === SHEET_MIME;
  const url = isSheet
    ? `https://www.googleapis.com/drive/v3/files/${doc.id}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`
    : `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google Drive returned ${res.status}. Try picking the file again.`);
  const blob = await res.blob();
  const name = isSheet ? `${doc.name}.xlsx` : doc.name;
  return new File([blob], name, { type: blob.type });
}

export function GoogleImport({
  busy,
  onFile,
  onLink,
}: {
  busy: boolean;
  onFile: (file: File) => void;
  onLink: (url: string) => void;
}) {
  const [consentOpen, setConsentOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [link, setLink] = useState("");
  const [lastLink, setLastLink] = useState("");

  useEffect(() => {
    try {
      setLastLink(localStorage.getItem(LAST_LINK_KEY) ?? "");
    } catch {}
  }, []);

  function submitLink(url: string) {
    const trimmed = url.trim();
    if (!/docs\.google\.com\/spreadsheets\//.test(trimmed)) return toast.error("Paste a Google Sheets link (docs.google.com/spreadsheets/…)");
    try {
      localStorage.setItem(LAST_LINK_KEY, trimmed);
      setLastLink(trimmed);
    } catch {}
    onLink(trimmed);
  }

  async function connectDrive() {
    setConsentOpen(false);
    setWorking(true);
    try {
      const { google } = await loadGoogle();
      const token = await requestToken(google);
      const doc = await pickFile(google, token);
      if (doc) onFile(await downloadDriveFile(token, doc));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't connect to Google Drive");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Import from Google</p>
          <p className="text-xs text-muted-foreground">Pick a file from your Drive, or paste a Google Sheets link.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!googleLoginConfigured || busy || working}
          onClick={() => setConsentOpen(true)}
          title={googleLoginConfigured ? undefined : "Google sign-in isn't set up yet — see README › Google Drive"}
        >
          {working ? <Loader2 className="animate-spin" /> : <GoogleDriveIcon />}
          Choose from Google Drive
        </Button>
      </div>
      {!googleLoginConfigured && (
        <p className="text-xs text-muted-foreground">
          “Choose from Google Drive” needs a Google Client ID (one-time setup, see README). Public sheet links work now.
        </p>
      )}

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          submitLink(link);
        }}
      >
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            aria-label="Google Sheets link"
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={busy || !link.trim()}>
          {busy && <Loader2 className="animate-spin" />} Fetch sheet
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">Links work when the sheet is shared as “Anyone with the link can view”.</p>
      {lastLink && (
        <button
          type="button"
          disabled={busy}
          onClick={() => submitLink(lastLink)}
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RotateCcw className="size-3" /> Import again from last linked sheet
        </button>
      )}

      <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="size-5" /> Allow access to Google Drive?</DialogTitle>
            <DialogDescription>Google will ask you to sign in and confirm this permission.</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-2 text-sm">
            <li>• Participant Hub can open <strong>only the file you pick</strong> — it cannot see the rest of your Drive.</li>
            <li>• Read-only use: the file is downloaded for import and never changed.</li>
            <li>• Access lasts for this browser session. You can revoke it anytime at myaccount.google.com › Security.</li>
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConsentOpen(false)}>Cancel</Button>
            <Button onClick={connectDrive}>Continue with Google</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GoogleDriveIcon() {
  return (
    <svg viewBox="0 0 87.3 78" aria-hidden className="size-4">
      <path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" />
      <path fill="#00ac47" d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5A9.06 9.06 0 0 0 0 53h27.5z" />
      <path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z" />
      <path fill="#00832d" d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" />
      <path fill="#2684fc" d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" />
      <path fill="#ffba00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" />
    </svg>
  );
}
