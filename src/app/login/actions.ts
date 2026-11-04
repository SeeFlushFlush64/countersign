"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";

export type LoginState = { error: string | null };

// The one-click entry: signs in to the sample workspace as its countersigner.
// signIn redirects by throwing, which must propagate.
export async function openSampleWorkspace(): Promise<void> {
  try {
    await signIn("sample-workspace", { redirectTo: "/agreements" });
  } catch (error) {
    if (error instanceof AuthError) redirect("/login?sample=unavailable");
    throw error;
  }
}

export async function authenticate(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: (formData.get("redirectTo") as string) || "/agreements",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "Invalid email or password." };
        default:
          return { error: "Something went wrong. Try again." };
      }
    }
    throw error;
  }

  return { error: null };
}
