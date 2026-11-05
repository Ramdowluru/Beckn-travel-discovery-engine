import Link from "next/link";
import { Suspense } from "react";
import AuthLayout from "../AuthLayout";
import SignInForm from "./SignInForm";
import { safeInternalReturnPath } from "@/lib/return-path";

interface Props {
  searchParams: Promise<{ returnTo?: string }>;
}

export default async function SignInPage({ searchParams }: Props) {
  const returnTo = safeInternalReturnPath((await searchParams).returnTo);
  const signupHref = returnTo ? `/auth/signup?returnTo=${encodeURIComponent(returnTo)}` : "/auth/signup";
  return (
    <AuthLayout activePage="signin">
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
      <p className="auth-card-footer">Don&apos;t have an account? <Link href={signupHref}>Create account</Link></p>
    </AuthLayout>
  );
}
