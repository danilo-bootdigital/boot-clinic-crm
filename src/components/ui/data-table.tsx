'use client';

import * as React from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { LoadingState } from "./loading-state";

export interface Column<T> {
  /** chave única da coluna */
  key: string;
  header: React.ReactNode;
  /** renderiza a célula */
  cell: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  align?: "left" | "right" | "center";
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: { title: string; description?: string; action?: React.ReactNode };
  className?: string;
}

const alignClass = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  loading,
  empty,
  className,
}: DataTableProps<T>) {
  if (loading) {
    return <LoadingState rows={5} />;
  }

  if (!data.length && empty) {
    return (
      <EmptyState
        title={empty.title}
        description={empty.description}
        action={empty.action}
      />
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-card",
        className,
      )}
    >
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                    alignClass[col.align ?? "left"],
                    col.headerClassName,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "transition-colors",
                  onRowClick && "cursor-pointer hover:bg-muted/40",
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-4 py-3 text-foreground",
                      alignClass[col.align ?? "left"],
                      col.className,
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
