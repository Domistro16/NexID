import type { ReactNode } from "react";
import { AppShell } from "@/components/product/AppShell";
import { ProductProvider } from "@/components/product/ProductProvider";

export default function ProductLayout({ children }: { children: ReactNode }) {
  return <ProductProvider><AppShell>{children}</AppShell></ProductProvider>;
}
