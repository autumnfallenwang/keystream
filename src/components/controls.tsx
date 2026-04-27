export type ControlsProps = {
  sendDisabled: boolean;
  statusText: string;
  onSendClick: () => void;
  stopDisabled: boolean;
  onStopClick: () => void;
};

const SEND_ENABLED =
  "rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm text-zinc-50 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200";
const SEND_DISABLED =
  "rounded-md bg-zinc-300 dark:bg-zinc-700 px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400 cursor-not-allowed";

const STOP_ENABLED =
  "rounded-md border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800";
const STOP_DISABLED =
  "rounded-md border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm text-zinc-400 dark:text-zinc-500 cursor-not-allowed";

export function Controls({
  sendDisabled,
  statusText,
  onSendClick,
  stopDisabled,
  onStopClick,
}: ControlsProps) {
  return (
    <div className="h-20 shrink-0 flex items-center justify-between gap-3 px-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{statusText}</div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={stopDisabled}
          className={stopDisabled ? STOP_DISABLED : STOP_ENABLED}
          onClick={onStopClick}
        >
          Stop
        </button>
        <button
          type="button"
          disabled={sendDisabled}
          className={sendDisabled ? SEND_DISABLED : SEND_ENABLED}
          onClick={onSendClick}
        >
          Send
        </button>
      </div>
    </div>
  );
}
