import Link from "next/link";
import { Suspense } from "react";
import AuthLayout from "../AuthLayout";
import SignInForm from "./SignInForm";

export default function SignInPage() {
  return (
    <AuthLayout activePage="signin">
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
      <p className="auth-card-footer">Don&apos;t have an account? <Link href="/auth/signup">Create account</Link></p>
    </AuthLayout>
  );
}
