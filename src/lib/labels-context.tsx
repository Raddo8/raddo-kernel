import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";

export interface Labels {
  // Core entity
  item: string;
  items: string;
  newItem: string;
  itemType: string;

  // Computed case helpers
  itemLower: string;
  itemsLower: string;
  itemUpper: string;
  itemsUpper: string;

  // Field labels
  amount: string;
  dueDate: string;
  title: string;

  // Pass-through (never swapped)
  account: string;
  accounts: string;
}

const DEFAULT_LABELS: Labels = {
  item: "Item",
  items: "Items",
  newItem: "New Item",
  itemType: "item",
  itemLower: "item",
  itemsLower: "items",
  itemUpper: "ITEM",
  itemsUpper: "ITEMS",
  amount: "Amount",
  dueDate: "Due Date",
  title: "Title",
  account: "Account",
  accounts: "Accounts",
};

function buildLabels(config: any): Labels {
  const itemLabel: string = config?.item_label || "Item";
  const fieldLabels = config?.field_labels || {};

  // Support optional item_label_plural; fallback to simple "s" suffix
  const itemsLabel: string = config?.item_label_plural || itemLabel + "s";

  return {
    item: itemLabel,
    items: itemsLabel,
    newItem: `New ${itemLabel}`,
    itemType: config?.item_type || "item",

    itemLower: itemLabel.toLowerCase(),
    itemsLower: itemsLabel.toLowerCase(),
    itemUpper: itemLabel.toUpperCase(),
    itemsUpper: itemsLabel.toUpperCase(),

    amount: fieldLabels.amount || "Amount",
    dueDate: fieldLabels.due_date || "Due Date",
    title: fieldLabels.title || "Title",

    account: "Account",
    accounts: "Accounts",
  };
}

const LabelsContext = createContext<Labels>(DEFAULT_LABELS);

export const useLabels = () => useContext(LabelsContext);

// Cache resolved labels per workspace_id to prevent flicker on navigation
const labelsCache = new Map<string, Labels>();

export function LabelsProvider({ children }: { children: ReactNode }) {
  const { workspace } = useWorkspace();
  const [labels, setLabels] = useState<Labels>(
    workspace ? labelsCache.get(workspace.id) || DEFAULT_LABELS : DEFAULT_LABELS
  );
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workspace) return;

    // If already cached for this workspace, use it immediately
    const cached = labelsCache.get(workspace.id);
    if (cached) {
      setLabels(cached);
      fetchedRef.current = workspace.id;
      return;
    }

    // If we already fetched for this workspace this session, skip
    if (fetchedRef.current === workspace.id) return;
    fetchedRef.current = workspace.id;

    const load = async () => {
      const { data } = await supabase
        .from("vertical_packs")
        .select("config")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const resolved = data?.config ? buildLabels(data.config) : DEFAULT_LABELS;
      labelsCache.set(workspace.id, resolved);
      setLabels(resolved);
    };

    load();
  }, [workspace]);

  return (
    <LabelsContext.Provider value={labels}>
      {children}
    </LabelsContext.Provider>
  );
}
