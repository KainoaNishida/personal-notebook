import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  Sprout,
  BookOpen,
  FlaskConical,
  Network,
  Pencil,
  Dumbbell,
} from "lucide-react";
import type { ReactNode } from "react";
export function SubjectIcon({
  name,
  size = 20,
}: {
  name?: string;
  size?: number;
}) {
  const Icon =
    (
      {
        science: FlaskConical,
        system: Network,
        art: Pencil,
        gym: Dumbbell,
        reading: BookOpen,
      } as Record<string, typeof Sprout>
    )[name || ""] || Sprout;
  return <Icon size={size} strokeWidth={1.5} />;
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <div className="row between">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="muted">
            {description}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Sprout size={28} strokeWidth={1} />
      <h3>{title}</h3>
      <div className="muted">{children}</div>
    </div>
  );
}
export function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <div role="alert" className="inline-error">
      {error instanceof Error ? error.message : String(error)}
    </div>
  ) : null;
}
