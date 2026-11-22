import { redirect } from "next/navigation";

// Settings now live on the Profile page.
export default function SettingsPage() {
  redirect("/profile");
}
