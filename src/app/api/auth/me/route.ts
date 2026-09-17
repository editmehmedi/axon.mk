import { GET_me } from "@/lib/auth-handlers";

export async function GET() {
  return GET_me();
}
