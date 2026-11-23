import { EmptyState } from "./EmptyState";

/** Load failure with a Retry button. */
export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message?: string | null; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title={title}
      message={message ?? "Check your connection and try again."}
      actionLabel={onRetry ? "Retry" : undefined}
      onAction={onRetry}
    />
  );
}
