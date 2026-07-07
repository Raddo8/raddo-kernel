import { Eye } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export interface ViewToggle { label: string; value: boolean; onChange: (v: boolean) => void; }

/** Compact "View" popover with a list of boolean toggles. */
export default function ViewMenu({ toggles }: { toggles: ViewToggle[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="font-mono text-xs">
          <Eye size={14} className="mr-1" /> View
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-2 py-1">
          Show
        </div>
        <div className="space-y-1">
          {toggles.map((t) => (
            <label key={t.label} className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-muted/50 rounded">
              <input
                type="checkbox"
                checked={t.value}
                onChange={(e) => t.onChange(e.target.checked)}
                className="accent-dossier-brass"
              />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
