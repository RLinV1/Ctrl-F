import { Shell } from "@/components/ctrlf/shell";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <Shell signOut={Boolean(process.env.UI_PASSWORD)}>{children}</Shell>;
}
