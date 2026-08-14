import { getCurrentUser } from "@/lib/auth";
import { SignOutButton } from "./auth-buttons";
import { HeaderBar } from "./header-bar";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <HeaderBar
      user={
        user
          ? {
              name: user.name ?? null,
              email: user.email ?? null,
              image: user.image ?? null,
            }
          : null
      }
      signOut={<SignOutButton />}
    />
  );
}
