import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { cn } from "@/lib/utils";

interface ActionButtonProps extends ButtonProps {
  icon?: React.ReactNode;
  loading?: boolean;
}

/** Botão de ação com ícone opcional e estado de carregamento. */
export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ icon, loading, children, disabled, className, ...props }, ref) => (
    <Button
      ref={ref}
      disabled={disabled || loading}
      className={cn("gap-1.5", className)}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        icon && <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      )}
      {children}
    </Button>
  ),
);
ActionButton.displayName = "ActionButton";
