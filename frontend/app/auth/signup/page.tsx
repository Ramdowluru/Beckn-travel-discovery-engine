import Link from "next/link";
import AuthLayout from "../AuthLayout";
import SignUpForm from "./SignUpForm";
import { safeInternalReturnPath } from "@/lib/return-path";

interface Props {
  searchParams: Promise<{ returnTo?: string }>;
}

export default async function SignUpPage({ searchParams }: Props) {
  const returnTo = safeInternalReturnPath((await searchParams).returnTo);
  const signinHref = returnTo ? `/auth/signin?returnTo=${encodeURIComponent(returnTo)}` : "/auth/signin";
  return (
    <AuthLayout activePage="signup">
      <SignUpForm returnTo={returnTo} />
      <p className="auth-card-footer">Already have an account? <Link href={signinHref}>Sign in</Link></p>
    </AuthLayout>
  );
}
