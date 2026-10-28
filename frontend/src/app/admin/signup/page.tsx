import { redirect } from "next/navigation";

export default function AdminSignupPage() {
  redirect("/signup?role=admin");
}
