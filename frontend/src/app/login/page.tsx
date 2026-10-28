import { Suspense } from "react";
import UnifiedLoginForm from "@/components/UnifiedLoginForm";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-beige-bg flex items-center justify-center p-4">
          <div className="w-8 h-8 rounded-full border-2 border-[#1E3F35] border-t-transparent animate-spin" />
        </div>
      }
    >
      <UnifiedLoginForm />
    </Suspense>
  );
}
