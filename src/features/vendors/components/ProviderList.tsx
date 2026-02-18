import { useTranslation } from "react-i18next";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import type { ProviderConfig } from "../types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface ProviderListProps {
  providers: ProviderConfig[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (provider: ProviderConfig) => void;
  onDelete: (provider: ProviderConfig) => void;
  onSwitch: (id: string) => void;
}

export function ProviderList({
  providers,
  loading,
  onAdd,
  onEdit,
  onDelete,
  onSwitch,
}: ProviderListProps) {
  const { t } = useTranslation();
  const providerList = Array.isArray(providers) ? providers : [];

  return (
    <div className="vendor-provider-list">
      <div className="vendor-list-header">
        <span className="vendor-list-title">
          {t("settings.vendor.allProviders")}
        </span>
        <Button size="sm" onClick={onAdd}>
          + {t("settings.vendor.add")}
        </Button>
      </div>

      {loading && (
        <div className="vendor-loading">{t("settings.loading")}</div>
      )}

      <Table>
        <TableBody>
          {providerList.map((provider) => (
            <TableRow
              key={provider.id}
              className={cn(
                "vendor-provider-row border-border/20",
                provider.isActive && "vendor-provider-row-active",
              )}
            >
              <TableCell className="font-medium py-3">
                <div className="flex items-center gap-2">
                  {provider.name}
                  {provider.source === "cc-switch" && (
                    <Badge variant="outline" size="sm" className="text-stone-600 dark:text-stone-300">cc-switch</Badge>
                  )}
                </div>
                {provider.remark && (
                  <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[300px]" title={provider.remark}>
                    {provider.remark}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right py-3">
                <div className="flex items-center justify-end gap-1.5">
                  {provider.isActive ? (
                    <Badge variant="outline" className="text-stone-700 dark:text-stone-200">
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
                      {t("settings.vendor.inUse")}
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => onSwitch(provider.id)}
                    >
                      {t("settings.vendor.enable")}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onEdit(provider)}
                    title={t("settings.vendor.edit")}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="hover:text-destructive"
                    onClick={() => onDelete(provider)}
                    title={t("settings.vendor.delete")}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {!loading && providerList.length === 0 && (
        <div className="vendor-empty">
          {t("settings.vendor.emptyState")}
        </div>
      )}
    </div>
  );
}
