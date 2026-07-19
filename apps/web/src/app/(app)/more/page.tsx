import { redirect } from "next/navigation";

export default function MorePage(): never {
  redirect("/settings");
}
