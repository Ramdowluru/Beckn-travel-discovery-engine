import Link from "next/link";
import AuthLayout from "../AuthLayout";
import SignUpForm from "./SignUpForm";

export default function SignUpPage() {
  return (
    <AuthLayout activePage="signup">
      <SignUpForm />
      <p className="auth-card-footer">Already have an account? <Link href="/auth/signin">Sign in</Link></p>
    </AuthLayout>
  );
}
