"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Accueil" },
  { href: "/exces", label: "Tous les exces" },
  { href: "/carte", label: "Carte" },
  { href: "/a-propos", label: "A propos" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-input">
      <div className="mx-auto max-w-6xl flex items-center gap-6 px-4 py-3 sm:px-6 lg:px-8">
        {links.map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm transition-colors ${
                active
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
