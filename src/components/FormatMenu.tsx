import { useRef } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import type { Format } from "./formatting";

const menus = {
  Heading: [
    ["h1", "Heading 1"],
    ["h2", "Heading 2"],
    ["h3", "Heading 3"],
  ],
  Code: [
    ["inlineCode", "Inline code"],
    ["code", "Code block"],
  ],
  Math: [
    ["inlineMath", "Inline math"],
    ["math", "Display equation"],
  ],
  More: [
    ["bullet", "Bullet list"],
    ["number", "Numbered list"],
    ["task", "Task list"],
    ["quote", "Block quote"],
  ],
} as const satisfies Record<string, readonly (readonly [Format, string])[]>;

export function FormatMenu({
  name,
  onFormat,
}: {
  name: keyof typeof menus;
  onFormat: (format: Format) => void;
}) {
  const selected = useRef<Format | null>(null);
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="format-menu-trigger" aria-label={name}>
          {name}
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="format-menu"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onCloseAutoFocus={(event) => {
            // Apply after the menu closes so its focus restoration cannot
            // steal the caret from CodeMirror. Escape still returns to the trigger.
            if (selected.current) {
              event.preventDefault();
              const format = selected.current;
              selected.current = null;
              onFormat(format);
            }
          }}
        >
          {menus[name].map(([format, label]) => (
            <DropdownMenu.Item
              key={format}
              className="format-menu-item"
              onSelect={() => {
                selected.current = format;
              }}
            >
              {label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
