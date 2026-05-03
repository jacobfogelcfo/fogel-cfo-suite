import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useClient } from "@/contexts/ClientContext";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function OrgSwitcher() {
  const { clients, currentClient, setCurrentClientId } = useClient();
  const [open, setOpen] = useState(false);

  if (clients.length === 0) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
        <Building2 className="h-4 w-4" />
        <span>No organizations</span>
      </div>
    );
  }

  if (clients.length === 1) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium">
        <Building2 className="h-4 w-4 shrink-0" />
        <span className="truncate">{currentClient?.client_name ?? clients[0].client_name}</span>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <span className="flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{currentClient?.client_name ?? "Select organization"}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search organizations…" />
          <CommandList>
            <CommandEmpty>No organization found.</CommandEmpty>
            <CommandGroup>
              {clients.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.client_name}
                  onSelect={() => {
                    setCurrentClientId(c.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "me-2 h-4 w-4",
                      currentClient?.id === c.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {c.client_name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
