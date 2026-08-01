"use client";

import type { ColumnMapping } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { ColumnMappingForm } from "@/components/csv/column-mapping-form";

import { useSavedImportMapping } from "../hooks/use-saved-import-mapping";

type MapStepProps = Readonly<{
  accountId: string;
  accountName: string;
  onChange: (mapping: ColumnMapping | undefined, error: string | undefined) => void;
}>;

export function MapStep({ accountId, accountName, onChange }: MapStepProps): ReactNode {
  const saved = useSavedImportMapping(accountId).data?.mapping ?? undefined;
  return (
    <div className="mt-5.5 animate-fade-in rounded-[18px] border border-border bg-surface-elevated p-4 sm:p-6.5">
      <ColumnMappingForm
        {...(saved === undefined ? {} : { initialMapping: saved })}
        savedMappingLabel={`Using your last mapping for ${accountName}.`}
        onChange={onChange}
      />
    </div>
  );
}
