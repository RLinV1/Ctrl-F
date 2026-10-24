import { Suspense } from "react";
import { Shell } from "@/components/ctrlf/shell";
import { SignOut } from "@/components/ctrlf/sign-out";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Shell
      signOut={
        <Suspense fallback={null}>
          <SignOut />
        </Suspense>
      }
    >
      {children}
    </Shell>
  );
}
