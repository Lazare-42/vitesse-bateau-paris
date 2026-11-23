"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Accueil" },
  { href: "/direct", label: "En direct" },
  { href: "/evolution", label: "Évolution" },
  { href: "/compagnies", label: "Compagnies" },
  { href: "/exces", label: "Tous les excès" },
  { href: "/plus-rapides", label: "Records" },
  { href: "/carte", label: "Carte" },
  { href: "/dossiers/vitesse-bateaux-mouches", label: "Bateaux-mouches" },
  { href: "/a-propos", label: "À propos" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-input">
      {/* Scrolls horizontally on narrow screens instead of overflowing the page. */}
      <div className="mx-auto flex max-w-6xl items-center gap-5 overflow-x-auto whitespace-nowrap px-4 py-3 [scrollbar-width:none] sm:px-6 lg:px-8">
        {links.map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`shrink-0 text-sm transition-colors ${
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
