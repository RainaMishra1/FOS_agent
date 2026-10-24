"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AgentTrackingPage from "../tracking/page";

export default function CustomersRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/tracking");
  }, [router]);

  return <AgentTrackingPage />;
}
