"use client";

import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type DialogContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
};

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("Dialog components must be used inside Dialog.");
  return ctx;
}

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <DialogContext value={{ open, setOpen: onOpenChange, titleId }}>
      {children}
    </DialogContext>
  );
}

export function DialogContent({
  className,
  children,
  showCloseButton = true,
}: {
  className?: string;
  children: ReactNode;
  showCloseButton?: boolean;
}) {
  const { open, setOpen, titleId } = useDialog();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none items-end justify-center bg-transparent p-0 open:flex sm:items-center sm:p-4"
      onClose={() => setOpen(false)}
    >
      <div
        className="fixed inset-0 bg-ink/20"
        aria-hidden
        onClick={() => setOpen(false)}
      />
      <div
        className={cn(
          "relative z-10 grid max-h-[90dvh] w-full max-w-none gap-4 overflow-y-auto bg-canvas p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm text-ink sm:max-w-sm sm:pb-4 sm:ring-1 sm:ring-hairline",
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
        {showCloseButton ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-2 right-2"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            <X />
          </Button>
        ) : null}
      </div>
    </dialog>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 border-t border-hairline pt-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  const { titleId } = useDialog();
  return (
    <h2 id={titleId} className={cn("text-base font-medium leading-none", className)} {...props} />
  );
}

export function DialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-mute", className)} {...props} />;
}

export function DialogTrigger({
  children,
  render,
}: {
  children?: ReactNode;
  /** Fitcheck base-ui compat: pass the trigger element here. */
  render?: ReactElement;
}) {
  const { setOpen } = useDialog();
  if (render && isValidElement(render)) {
    const element = render as ReactElement<{ onClick?: (event: React.MouseEvent) => void }>;
    return cloneElement(element, {
      onClick: (event: React.MouseEvent) => {
        element.props.onClick?.(event);
        setOpen(true);
      },
    });
  }
  return (
    <button type="button" onClick={() => setOpen(true)}>
      {children}
    </button>
  );
}
