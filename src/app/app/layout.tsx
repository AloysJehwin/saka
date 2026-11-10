import { Shell } from "@/components/shell";

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return <Shell>{children}</Shell>;
}
