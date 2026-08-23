"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const LINKS = [
  { href: "/admin", label: "Queue" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/capacity", label: "Capacity" },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active =
          link.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`px-4 py-2 text-[12px] font-medium tracking-[0.1em] uppercase transition-colors ${
              active
                ? "bg-cream text-ink"
                : "text-cream/70 hover:text-cream"
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
