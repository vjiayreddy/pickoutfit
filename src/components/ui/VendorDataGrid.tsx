"use client";

import {
  forwardRef,
  useMemo,
  type CSSProperties,
  type ForwardedRef,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
} from "ag-grid-community";
import { AgGridProvider, AgGridReact, type AgGridReactProps } from "ag-grid-react";
import { cn } from "@/lib/cn";

// Register once at module load so grids work even outside AgGridProvider.
ModuleRegistry.registerModules([AllCommunityModule]);

const baseThemeParams = {
  accentColor: "#111111",
  backgroundColor: "#ffffff",
  foregroundColor: "#111111",
  borderColor: "#e5e5e5",
  headerBackgroundColor: "#f5f5f5",
  headerTextColor: "#707072",
  headerFontWeight: 500,
  oddRowBackgroundColor: "#ffffff",
  rowHoverColor: "#f5f5f5",
  selectedRowBackgroundColor: "#f5f5f5",
  chromeBackgroundColor: "#ffffff",
  subtleTextColor: "#707072",
  fontFamily: "inherit",
  borderRadius: 0,
  wrapperBorderRadius: 0,
  wrapperBorder: false,
  columnBorder: false,
  rowBorder: true,
} as const;

const vendorTheme = themeQuartz.withParams({
  ...baseThemeParams,
  fontSize: 14,
  headerFontSize: 12,
  spacing: 8,
});

const vendorThemeCompact = themeQuartz.withParams({
  ...baseThemeParams,
  fontSize: 14,
  headerFontSize: 12,
  spacing: 6,
  cellHorizontalPadding: 14,
  headerColumnResizeHandleHeight: 18,
  wrapperBorder: false,
  pinnedColumnBorder: false,
});

const communityModules = [AllCommunityModule];

const defaultColDef: ColDef = {
  sortable: true,
  filter: false,
  resizable: true,
  flex: 1,
  minWidth: 80,
  suppressHeaderMenuButton: true,
  cellClass: "vendor-ag-cell-start",
  headerClass: "vendor-ag-header-start",
};

export type VendorDataGridProps<TData> = Omit<
  AgGridReactProps<TData>,
  "theme" | "defaultColDef" | "toolbar"
> & {
  className?: string;
  height?: CSSProperties["height"];
  density?: "default" | "compact";
  defaultColDef?: ColDef<TData>;
  /** Content rendered above the grid (e.g. quick-filter input). */
  above?: ReactNode;
};

function VendorDataGridInner<TData>(
  {
    className,
    height = "28rem",
    density = "default",
    defaultColDef: defaultColDefOverride,
    above,
    animateRows = true,
    suppressCellFocus = true,
    ...gridProps
  }: VendorDataGridProps<TData>,
  ref: ForwardedRef<AgGridReact<TData>>,
) {
  const compact = density === "compact";
  const mergedDefaultColDef = useMemo(
    () => ({
      ...defaultColDef,
      ...defaultColDefOverride,
    }),
    [defaultColDefOverride],
  );

  const fill = height === "100%" || height === "100";

  return (
    <AgGridProvider modules={communityModules}>
      <div
        className={cn(
          "flex h-full w-full flex-col",
          fill ? "min-h-0 flex-1 gap-0 p-0 m-0" : compact ? "gap-2" : "gap-3",
          className,
        )}
      >
        {above ? <div className="shrink-0">{above}</div> : null}
        <div
          className={cn(
            "h-full w-full min-w-0 p-0 m-0",
            fill ? "min-h-0 flex-1 border-0" : "border border-hairline",
          )}
          style={fill ? undefined : { height, width: "100%" }}
        >
          <AgGridReact<TData>
            ref={ref}
            theme={compact ? vendorThemeCompact : vendorTheme}
            defaultColDef={mergedDefaultColDef as ColDef<TData>}
            animateRows={animateRows}
            suppressCellFocus={suppressCellFocus}
            {...gridProps}
          />
        </div>
      </div>
    </AgGridProvider>
  );
}

export const VendorDataGrid = forwardRef(VendorDataGridInner) as <TData>(
  props: VendorDataGridProps<TData> & { ref?: ForwardedRef<AgGridReact<TData>> },
) => ReactElement | null;

export type { ColDef };
