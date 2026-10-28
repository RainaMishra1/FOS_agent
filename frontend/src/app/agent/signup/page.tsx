import { redirect } from "next/navigation";

export default function AgentSignupPage() {
  redirect("/signup?role=agent");
}
