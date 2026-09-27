import { redirect } from "next/navigation";

export default function UsedPcsPage() {
  redirect("/prebuilts?condition=used");
}
