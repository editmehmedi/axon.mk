import { POST_logout } from "@/lib/auth-handlers";

export async function POST() {
  return POST_logout();
}
