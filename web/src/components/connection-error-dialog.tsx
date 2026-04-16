import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { summarizeErrors } from "@/lib/api";

interface ConnectionErrorDialogProps {
  errors: string[];
  onRetry: () => void;
  retrying?: boolean;
}

function fingerprint(errors: string[]): string {
  return summarizeErrors(errors).join("|");
}

export function ConnectionErrorDialog({ errors, onRetry, retrying }: ConnectionErrorDialogProps) {
  const messages = summarizeErrors(errors);
  const key = fingerprint(errors);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  useEffect(() => {
    if (key === "") setDismissedKey(null);
  }, [key]);

  const open = messages.length > 0 && dismissedKey !== key;
  const isConnectionLost =
    messages.length === 1 && messages[0].startsWith("Unable to reach the server");

  const handleRetry = () => {
    setDismissedKey(null);
    onRetry();
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setDismissedKey(key);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-5 shadow-xl transition-all data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
          <Dialog.Title className="text-base font-semibold text-slate-950">
            {isConnectionLost ? "Connection lost" : "Failed to load data"}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-slate-600">
            {isConnectionLost
              ? messages[0]
              : "Some requests failed. You can retry or continue with the data already loaded."}
          </Dialog.Description>
          {!isConnectionLost && messages.length > 0 && (
            <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-md bg-slate-50 p-2 text-xs text-slate-700">
              {messages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close render={<Button variant="outline" />}>Dismiss</Dialog.Close>
            <Button variant="default" onClick={handleRetry} disabled={retrying}>
              {retrying ? "Retrying…" : "Retry"}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
