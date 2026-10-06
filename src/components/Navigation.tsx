import * as Dialog from "@radix-ui/react-dialog";
import {
  BookOpen,
  CalendarDays,
  LogOut,
  Notebook,
  Search,
  Settings,
  X,
} from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import type { RefObject } from "react";
import { useRef } from "react";
import { APP_NAME } from "../branding";
import type { RecordItem } from "../domain";
import { SubjectIcon } from "./UI";

type Props = {
  notebooks: RecordItem<"notebook">[];
  search: string;
  onSearch: (value: string) => void;
  onNavigate: () => void;
  onSignOut: () => void;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
};

export function Navigation(props: Props) {
  const { open, onOpenChange, returnFocus } = props;
  const opener = useRef<HTMLElement | null>(null);
  return (
    <>
      <aside className="app-sidebar" aria-label="Notebook navigation">
        <NavigationContent {...props} />
      </aside>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay navigation-overlay" />
          <Dialog.Content
            className="navigation-drawer"
            onOpenAutoFocus={() => {
              opener.current = document.activeElement as HTMLElement;
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              (opener.current?.isConnected
                ? opener.current
                : returnFocus.current
              )?.focus();
            }}
          >
            <Dialog.Title className="sr-only">
              Navigate your notebooks
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              Search entries or open a notebook.
            </Dialog.Description>
            <Dialog.Close
              className="icon-button drawer-close"
              aria-label="Close navigation"
            >
              <X size={18} />
            </Dialog.Close>
            <NavigationContent {...props} drawer />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function NavigationContent({
  notebooks,
  search,
  onSearch,
  onNavigate,
  onSignOut,
  onOpenChange,
  drawer = false,
}: Props & { drawer?: boolean }) {
  function navigate() {
    onNavigate();
    onOpenChange(false);
  }
  return (
    <>
      <Link
        to="/"
        onClick={navigate}
        className="brand"
        aria-label={`${APP_NAME} home`}
      >
        <Notebook size={23} strokeWidth={1.5} />
        <span>{APP_NAME}</span>
      </Link>
      <form
        className="sidebar-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          onOpenChange(false);
        }}
      >
        <label className="search">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Search entries"
            placeholder="Search notes…"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
          {search && (
            <button
              type="button"
              className="icon-button"
              aria-label="Clear search"
              onClick={() => onSearch("")}
            >
              <X size={14} />
            </button>
          )}
        </label>
        {drawer && search && (
          <button type="submit" className="search-results-button">
            View search results
          </button>
        )}
      </form>
      {!drawer && (
        <button
          className="rail-search icon-button"
          aria-label="Open search and navigation"
          onClick={() => onOpenChange(true)}
        >
          <Search size={18} />
        </button>
      )}
      <nav aria-label="Primary">
        <NavLink to="/" end onClick={navigate} aria-label="Today" title="Today">
          <CalendarDays size={18} />
          <span>Today</span>
        </NavLink>
        <NavLink
          to="/notebooks"
          onClick={navigate}
          aria-label="Notebooks"
          title="Notebooks"
        >
          <BookOpen size={18} />
          <span>Notebooks</span>
        </NavLink>
      </nav>
      <div className="sidebar-subhead">
        <span>Quick Links</span>
      </div>
      <nav className="notebook-nav" aria-label="Quick Links">
        {notebooks.map((notebook) => (
          <NavLink
            key={notebook.id}
            to={`/notebooks/${notebook.id}`}
            onClick={navigate}
            aria-label={notebook.data.name}
            title={notebook.data.name}
          >
            <SubjectIcon name={notebook.data.icon} size={18} />
            <span>{notebook.data.name}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <NavLink
          to="/settings"
          onClick={navigate}
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={18} />
          <span>Settings</span>
        </NavLink>
        <button
          className="sign-out"
          aria-label="Sign out"
          title="Sign out"
          onClick={onSignOut}
        >
          <LogOut size={18} />
          <span>Sign out</span>
        </button>
      </div>
    </>
  );
}
